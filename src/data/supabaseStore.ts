/**
 * Owner: Ali / Infrastructure
 * Purpose: Supabase-backed Store implementation with a write-through in-memory cache,
 *          strict public/private data separation (FR-02, NFR-05), local static dance loading (NFR-04),
 *          and Supabase Realtime subscriptions on feed_posts and post_kudos.
 * FRs: FR-02, FR-38, FR-39, FR-40, FR-41, FR-42, FR-43, FR-44, FR-46, FR-51
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";
import { assertFeedPost, assertLandmarks, assertSessionResult, parseDance } from "../contracts/validators";
import { ensureSupabaseClient, getSupabaseClient } from "../lib/supabase";
import { resultHasHeartRate } from "../scoring/session";
import {
  songMs,
  type AccuracyLevel,
  type BadgeId,
  type Dance,
  type EarnedBadge,
  type FeedPost,
  type Group,
  type GroupKind,
  type Meetup,
  type PlayerProfile,
  type PosturalMode,
  type RecordedPoseSample,
  type ScoreSample,
  type SessionResult,
  type Sex,
} from "../types/pulse";
import { evaluateNewBadges } from "./badges";
import { computeWeeklyLeaderboard } from "./leaderboard";
import { computeAvgBpm } from "./postStats";
import type { DemoStore, ResultHighlight } from "./store";

const GUEST_ID = "p-guest";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

interface PublicProfileRow {
  id: string;
  handle: string;
  display_name: string;
  mode: PosturalMode;
}

interface PrivateBiometricsRow {
  user_id: string;
  age: number;
  sex: Sex;
  weight_kg: number | string;
  height_cm: number | string;
  resting_hr: number;
  hr_max_override: number | null;
}

interface GroupRow {
  id: string;
  name: string;
  kind: GroupKind;
  group_dance_ids: string[] | null;
}

interface GroupMemberRow {
  group_id: string;
  user_id: string;
}

interface SessionResultRow {
  id: string;
  player_id: string;
  dance_id: string;
  completed: boolean;
  total_points: number;
  accuracy_pct: number | string;
  level: AccuracyLevel;
  duration_sec: number;
  best_window_start_sec: number | string;
  has_heart_rate: boolean;
  avg_bpm: number | null;
  created_at: string;
}

interface SessionPrivateDataRow {
  result_id: string;
  player_id: string;
  calories_kcal: number | string;
  samples: ScoreSample[] | null;
}

interface FeedPostRow {
  id: string;
  author_id: string;
  result_id: string;
  show_calories: boolean;
  show_heart_rate: boolean | null;
  has_clip: boolean;
  shared_calories_kcal: number | string | null;
  shared_avg_bpm: number | null;
  created_at: string;
}

interface PostGroupRow {
  post_id: string;
  group_id: string;
}

interface PostKudosRow {
  post_id: string;
  user_id: string;
}

interface EarnedBadgeRow {
  badge_id: BadgeId;
  player_id: string;
  earned_at: string;
}

interface ResultHighlightRow {
  result_id: string;
  player_id: string;
  start_sec: number | string;
  duration_sec: number | string;
  samples: RecordedPoseSample[];
}

interface CacheState {
  activeId: string | null;
  profiles: PlayerProfile[];
  results: SessionResult[];
  posts: FeedPost[];
  groups: Group[];
  meetups: Meetup[];
  badges: EarnedBadge[];
}

export function sliceHighlightWindow(
  result: SessionResult,
  songDurationSec: number,
  samples: RecordedPoseSample[],
): ResultHighlight | null {
  if (!result.completed || samples.length === 0) return null;
  const durationSec = Math.min(CONFIG.clipLengthSec, songDurationSec);
  if (!(durationSec > 0)) return null;
  const startSec = Math.max(0, Math.min(result.bestWindowStartSec, songDurationSec - durationSec));
  const startMs = startSec * 1000;
  const endMs = (startSec + durationSec) * 1000;

  let first = samples.findIndex(({ tSongMs }) => tSongMs >= startMs);
  if (first < 0) return null;
  let last = samples.findIndex(({ tSongMs }) => tSongMs > endMs);
  if (last < 0) last = samples.length;
  if (!samples.slice(first, last).some(({ points }) => points.some(({ v }) => v >= CONFIG.visibilityMin))) return null;
  first = Math.max(0, first - 1);

  return { startSec, durationSec, samples: samples.slice(first, last + 1) };
}

function validateHighlightClip(raw: { startSec: number; durationSec: number; samples: RecordedPoseSample[] }): ResultHighlight | undefined {
  if (
    !Number.isFinite(raw.startSec) || raw.startSec < 0 ||
    !Number.isFinite(raw.durationSec) || raw.durationSec <= 0 ||
    !Array.isArray(raw.samples) || raw.samples.length === 0
  ) {
    return undefined;
  }
  const normalizedSamples: RecordedPoseSample[] = [];
  for (let i = 0; i < raw.samples.length; i++) {
    const sample = raw.samples[i];
    const tMs = Number(sample.tSongMs);
    if (!Number.isFinite(tMs) || (i > 0 && tMs <= Number(raw.samples[i - 1].tSongMs))) {
      return undefined;
    }
    assertLandmarks(sample.points, "ResultHighlight");
    normalizedSamples.push({
      tSongMs: songMs(tMs),
      points: sample.points.map((pt) => ({ x: pt.x, y: pt.y, v: pt.v })),
    });
  }
  return {
    startSec: Number(raw.startSec),
    durationSec: Number(raw.durationSec),
    samples: normalizedSamples,
  };
}

async function loadStaticDances(): Promise<Dance[]> {
  if (typeof fetch !== "function") return [];
  let indexRes: Response;
  try {
    indexRes = await fetch("/dances/index.json");
  } catch {
    return [];
  }
  if (!indexRes.ok) return [];
  const rawIds: unknown = await indexRes.json();
  if (!Array.isArray(rawIds)) return [];
  const ids = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  const loaded = await Promise.allSettled(
    ids.map(async (id) => {
      const res = await fetch(`/dances/${encodeURIComponent(id)}.json`);
      if (!res.ok) throw new Error(`Could not load /dances/${id}.json (HTTP ${res.status})`);
      const dance = parseDance(await res.json());
      if (dance.id !== id) throw new Error(`Dance ID does not match catalogue entry ${id}`);
      return dance;
    }),
  );
  return loaded.flatMap((outcome, index) => {
    if (outcome.status === "fulfilled") return [outcome.value];
    const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    console.warn(`Skipping dance ${ids[index]}: ${reason}`);
    return [];
  });
}

function upsert<T extends { id: string }>(records: T[], record: T): T[] {
  return [...records.filter(({ id }) => id !== record.id), record];
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

export interface SupabaseStore extends DemoStore {
  subscribe(cb: () => void): () => void;
  refresh(): Promise<void>;
  clearPrivateData(): void;
  saveResultHighlight(result: SessionResult, songDurationSec: number, samples: RecordedPoseSample[]): void;
  getResultHighlight(resultId: string): ResultHighlight | undefined;
}

export function createSupabaseStore(clientOverride?: SupabaseClient | null): SupabaseStore {
  let state: CacheState = {
    activeId: null,
    profiles: [],
    results: [],
    posts: [],
    groups: [],
    meetups: [],
    badges: [],
  };
  let dances: Dance[] = [];
  let initialization: Promise<void> | undefined;
  let realtimeSubscribed = false;
  let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
  const subscribers = new Set<() => void>();
  const highlights = new Map<string, ResultHighlight>();
  const pendingHighlightFetches = new Set<string>();

  function client(): SupabaseClient | null {
    return clientOverride ?? getSupabaseClient();
  }

  function notify(): void {
    for (const cb of subscribers) {
      try {
        cb();
      } catch (err) {
        console.warn("[PULSE supabaseStore] subscriber error:", err);
      }
    }
  }

  function scheduleRealtimeRefresh(): void {
    if (realtimeTimer !== null) clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(() => {
      realtimeTimer = null;
      void refresh().catch((err) => {
        console.warn("[PULSE supabaseStore] realtime refresh failed:", err);
      });
    }, 150);
  }

  function ensureRealtimeSubscription(sb: SupabaseClient): void {
    if (realtimeSubscribed || typeof sb.channel !== "function") return;
    realtimeSubscribed = true;
    try {
      sb.channel("pulse-social-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, () => {
          scheduleRealtimeRefresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "post_kudos" }, () => {
          scheduleRealtimeRefresh();
        })
        .subscribe();
    } catch (err) {
      console.warn("[PULSE supabaseStore] Realtime subscription warning:", err);
    }
  }

  async function resolveActiveUserId(sb: SupabaseClient): Promise<string | null> {
    try {
      const { data } = await sb.auth.getSession();
      const sessionUserId = data?.session?.user?.id ?? null;
      if (sessionUserId) return sessionUserId;
    } catch {
      // ignore session lookup errors and fall back to activeId
    }
    return state.activeId && state.activeId !== GUEST_ID ? state.activeId : null;
  }

  async function refresh(): Promise<void> {
    const sb = client() ?? (await ensureSupabaseClient());
    if (!sb) return;

    const activeUserId = await resolveActiveUserId(sb);

    const [
      profilesRes,
      groupsRes,
      membersRes,
      resultsRes,
      postsRes,
      postGroupsRes,
      postKudosRes,
      badgesRes,
      biometricsRes,
      privateResultsRes,
    ] = await Promise.all([
      sb.from("public_profiles").select("id, handle, display_name, mode"),
      sb.from("groups").select("id, name, kind, group_dance_ids"),
      sb.from("group_members").select("group_id, user_id"),
      sb.from("session_results").select(
        "id, player_id, dance_id, completed, total_points, accuracy_pct, level, duration_sec, best_window_start_sec, has_heart_rate, avg_bpm, created_at",
      ),
      sb.from("feed_posts").select(
        "id, author_id, result_id, show_calories, show_heart_rate, has_clip, shared_calories_kcal, shared_avg_bpm, created_at",
      ),
      sb.from("post_groups").select("post_id, group_id"),
      sb.from("post_kudos").select("post_id, user_id"),
      sb.from("earned_badges").select("badge_id, player_id, earned_at"),
      activeUserId && isUuid(activeUserId)
        ? sb.from("private_biometrics").select("user_id, age, sex, weight_kg, height_cm, resting_hr, hr_max_override").eq("user_id", activeUserId)
        : Promise.resolve({ data: [] as PrivateBiometricsRow[], error: null }),
      activeUserId && isUuid(activeUserId)
        ? sb.from("session_private_data").select("result_id, player_id, calories_kcal, samples").eq("player_id", activeUserId)
        : Promise.resolve({ data: [] as SessionPrivateDataRow[], error: null }),
    ]);

    const profileRows = (profilesRes.data ?? []) as PublicProfileRow[];
    const groupRows = (groupsRes.data ?? []) as GroupRow[];
    const memberRows = (membersRes.data ?? []) as GroupMemberRow[];
    const resultRows = (resultsRes.data ?? []) as SessionResultRow[];
    const postRows = (postsRes.data ?? []) as FeedPostRow[];
    const postGroupRows = (postGroupsRes.data ?? []) as PostGroupRow[];
    const postKudosRows = (postKudosRes.data ?? []) as PostKudosRow[];
    const badgeRows = (badgesRes.data ?? []) as EarnedBadgeRow[];
    const bioRows = (biometricsRes.data ?? []) as PrivateBiometricsRow[];
    const privResultRows = (privateResultsRes.data ?? []) as SessionPrivateDataRow[];

    const bioByUserId = new Map<string, PrivateBiometricsRow>(bioRows.map((row) => [row.user_id, row]));
    const privByResultId = new Map<string, SessionPrivateDataRow>(privResultRows.map((row) => [row.result_id, row]));

    const groupsByUser = new Map<string, string[]>();
    const membersByGroup = new Map<string, string[]>();
    for (const m of memberRows) {
      const userGroups = groupsByUser.get(m.user_id) ?? [];
      if (!userGroups.includes(m.group_id)) userGroups.push(m.group_id);
      groupsByUser.set(m.user_id, userGroups);

      const groupMembers = membersByGroup.get(m.group_id) ?? [];
      if (!groupMembers.includes(m.user_id)) groupMembers.push(m.user_id);
      membersByGroup.set(m.group_id, groupMembers);
    }

    const hydratedGroups: Group[] = groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      memberIds: membersByGroup.get(g.id) ?? [],
      groupDanceIds: Array.isArray(g.group_dance_ids) ? g.group_dance_ids : [],
    }));

    const hydratedProfiles: PlayerProfile[] = profileRows.map((p) => {
      const ownBio = p.id === activeUserId ? bioByUserId.get(p.id) : undefined;
      const profile: PlayerProfile = {
        id: p.id,
        handle: p.handle.replace(/^@/, ""),
        displayName: p.display_name,
        // Privacy (FR-02): Only the active user gets their real private biometrics;
        // other users receive safe non-displayed placeholders.
        age: ownBio ? Number(ownBio.age) : 24,
        sex: ownBio ? ownBio.sex : "other",
        weightKg: ownBio ? Number(ownBio.weight_kg) : 70,
        heightCm: ownBio ? Number(ownBio.height_cm) : 170,
        restingHr: ownBio ? Number(ownBio.resting_hr) : CONFIG.restingHrDefault,
        mode: p.mode,
        groupIds: groupsByUser.get(p.id) ?? [],
      };
      if (ownBio && ownBio.hr_max_override !== null && ownBio.hr_max_override !== undefined) {
        profile.hrMaxOverride = Number(ownBio.hr_max_override);
      }
      return profile;
    });

    // Retain local guest profile if currently active in memory
    const existingGuest = state.profiles.find((p) => p.id === GUEST_ID);
    if (existingGuest && !hydratedProfiles.some((p) => p.id === GUEST_ID)) {
      hydratedProfiles.push(existingGuest);
    }

    const groupsByPost = new Map<string, string[]>();
    for (const pg of postGroupRows) {
      const list = groupsByPost.get(pg.post_id) ?? [];
      if (!list.includes(pg.group_id)) list.push(pg.group_id);
      groupsByPost.set(pg.post_id, list);
    }

    const kudosByPost = new Map<string, string[]>();
    for (const pk of postKudosRows) {
      const list = kudosByPost.get(pk.post_id) ?? [];
      if (!list.includes(pk.user_id)) list.push(pk.user_id);
      kudosByPost.set(pk.post_id, list);
    }

    const postByResultId = new Map<string, FeedPostRow>();
    const hydratedPosts: FeedPost[] = [];
    for (const row of postRows) {
      postByResultId.set(row.result_id, row);
      const post: FeedPost = {
        id: row.id,
        authorId: row.author_id,
        resultId: row.result_id,
        showCalories: Boolean(row.show_calories),
        hasClip: Boolean(row.has_clip),
        groupIds: groupsByPost.get(row.id) ?? [],
        kudosBy: kudosByPost.get(row.id) ?? [],
        createdAtIso: row.created_at,
      };
      if (row.show_heart_rate !== null && row.show_heart_rate !== undefined) {
        post.showHeartRate = Boolean(row.show_heart_rate);
      }
      assertFeedPost(post);
      hydratedPosts.push(post);
    }

    const hydratedResults: SessionResult[] = [];
    for (const row of resultRows) {
      const isOwn = row.player_id === activeUserId;
      const ownPriv = isOwn ? privByResultId.get(row.id) : undefined;
      const postRow = postByResultId.get(row.id);

      let caloriesKcal = 0;
      let samples: ScoreSample[] = [];

      if (isOwn && ownPriv) {
        caloriesKcal = Number(ownPriv.calories_kcal ?? 0);
        samples = Array.isArray(ownPriv.samples) ? ownPriv.samples : [];
      } else {
        // Privacy (FR-02, FR-38): Only attach shared_calories_kcal or synthetic BLE sample
        // for shared_avg_bpm when explicitly opted in on the post.
        if (postRow?.show_calories && postRow.shared_calories_kcal !== null && postRow.shared_calories_kcal !== undefined) {
          caloriesKcal = Number(postRow.shared_calories_kcal);
        }
        if (postRow?.show_heart_rate && postRow.shared_avg_bpm !== null && postRow.shared_avg_bpm !== undefined && Number(postRow.shared_avg_bpm) > 0) {
          samples = [
            {
              tSec: 1,
              heartRate: Math.round(Number(postRow.shared_avg_bpm)),
              hrSource: "ble",
              effort: 1,
              accuracy: Number(row.accuracy_pct) / 100,
              points: 0,
            },
          ];
        } else if (postRow?.show_calories && row.has_heart_rate && caloriesKcal > 0) {
          // Allow PostCard's resultHasHeartRate(sharedResult) check to recognize watch-measured calories
          // without exposing any BPM value (hrSource: "simulated" is ignored by computeAvgBpm).
          samples = [
            {
              tSec: 1,
              heartRate: 1,
              hrSource: "simulated",
              effort: 1,
              accuracy: Number(row.accuracy_pct) / 100,
              points: 0,
            },
          ];
        }
      }

      const hydrated: SessionResult = {
        id: row.id,
        playerId: row.player_id,
        danceId: row.dance_id,
        completed: Boolean(row.completed),
        totalPoints: row.completed ? Number(row.total_points) : 0,
        accuracyPct: Number(row.accuracy_pct),
        level: row.level,
        durationSec: Number(row.duration_sec),
        caloriesKcal,
        bestWindowStartSec: Number(row.best_window_start_sec),
        samples,
        createdAtIso: row.created_at,
      };
      assertSessionResult(hydrated);
      hydratedResults.push(hydrated);
    }

    // Retain local guest results if guest is active
    const guestResults = state.results.filter((r) => r.playerId === GUEST_ID);
    for (const gr of guestResults) {
      if (!hydratedResults.some((r) => r.id === gr.id)) hydratedResults.push(gr);
    }

    const hydratedBadges: EarnedBadge[] = badgeRows.map((b) => ({
      badgeId: b.badge_id,
      playerId: b.player_id,
      earnedAtIso: b.earned_at,
    }));

    const nextActiveId = state.activeId ?? activeUserId ?? null;
    state = {
      activeId: nextActiveId,
      profiles: hydratedProfiles,
      results: hydratedResults,
      posts: hydratedPosts,
      groups: hydratedGroups,
      meetups: [],
      badges: hydratedBadges,
    };
    notify();
  }

  async function initialize(): Promise<void> {
    const [catalogue] = await Promise.all([loadStaticDances(), refresh()]);
    dances = catalogue;
    const sb = client();
    if (sb) ensureRealtimeSubscription(sb);
  }

  function saveResultHighlightMethod(
    result: SessionResult,
    songDurationSec: number,
    samples: RecordedPoseSample[],
  ): void {
    const clip = sliceHighlightWindow(result, songDurationSec, samples);
    if (!clip) return;
    highlights.set(result.id, clip);
    notify();

    if (result.playerId === GUEST_ID || !isUuid(result.playerId)) return;
    const sb = client();
    if (!sb) return;

    void (async () => {
      try {
        const { error } = await sb.from("result_highlights").upsert(
          {
            result_id: result.id,
            player_id: result.playerId,
            start_sec: clip.startSec,
            duration_sec: clip.durationSec,
            samples: clip.samples,
          },
          { onConflict: "result_id" },
        );
        if (error) {
          console.warn("[PULSE supabaseStore] saveResultHighlight failed:", error.message);
        }
      } catch (err) {
        console.warn("[PULSE supabaseStore] saveResultHighlight exception:", err);
      }
    })();
  }

  function getResultHighlightMethod(resultId: string): ResultHighlight | undefined {
    const cached = highlights.get(resultId);
    if (cached) return structuredClone(cached);

    const sb = client();
    if (sb && !pendingHighlightFetches.has(resultId)) {
      pendingHighlightFetches.add(resultId);
      void (async () => {
        try {
          const { data, error } = await sb
            .from("result_highlights")
            .select("result_id, player_id, start_sec, duration_sec, samples")
            .eq("result_id", resultId)
            .maybeSingle();
          if (error || !data) return;
          const row = data as ResultHighlightRow;
          const validated = validateHighlightClip({
            startSec: Number(row.start_sec),
            durationSec: Number(row.duration_sec),
            samples: row.samples,
          });
          if (validated) {
            highlights.set(resultId, validated);
            notify();
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] getResultHighlight fetch warning:", err);
        } finally {
          pendingHighlightFetches.delete(resultId);
        }
      })();
    }
    return undefined;
  }

  return {
    init() {
      initialization ??= initialize().catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
      return initialization;
    },
    subscribe(cb: () => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    refresh,
    clearPrivateData() {
      const prevActive = state.activeId;
      state = {
        ...state,
        activeId: null,
        profiles: state.profiles.map((p) =>
          p.id === prevActive
            ? {
                id: p.id,
                handle: p.handle,
                displayName: p.displayName,
                age: 24,
                sex: "other",
                weightKg: 70,
                heightCm: 170,
                restingHr: CONFIG.restingHrDefault,
                mode: p.mode,
                groupIds: p.groupIds,
              }
            : p,
        ),
        results: state.results
          .filter((r) => r.completed)
          .map((r) => (r.playerId === prevActive ? { ...r, caloriesKcal: 0, samples: [] } : r)),
      };
      notify();
    },
    listProfiles: () => structuredClone(state.profiles),
    isSeededProfile: () => false,
    getActiveProfile: () => structuredClone(state.profiles.find(({ id }) => id === state.activeId) ?? null),
    saveProfile(p: PlayerProfile) {
      const handle = p.handle.replace(/^@/, "");
      if (!/^[a-z0-9_-]+$/.test(handle)) throw new Error("Invalid profile handle");
      const cleanProfile: PlayerProfile = {
        ...structuredClone(p),
        handle,
        groupIds: [...new Set(p.groupIds)].filter((gid) => state.groups.some((g) => g.id === gid)),
      };
      const prevProfiles = state.profiles;
      state = {
        ...state,
        profiles: upsert(state.profiles, cleanProfile),
      };
      notify();

      if (cleanProfile.id === GUEST_ID || !isUuid(cleanProfile.id)) return;
      const sb = client();
      if (!sb) return;

      void (async () => {
        try {
          const [pubRes, bioRes] = await Promise.all([
            sb.from("public_profiles").upsert(
              {
                id: cleanProfile.id,
                handle: cleanProfile.handle,
                display_name: cleanProfile.displayName,
                mode: cleanProfile.mode,
              },
              { onConflict: "id" },
            ),
            sb.from("private_biometrics").upsert(
              {
                user_id: cleanProfile.id,
                age: cleanProfile.age,
                sex: cleanProfile.sex,
                weight_kg: cleanProfile.weightKg,
                height_cm: cleanProfile.heightCm,
                resting_hr: cleanProfile.restingHr,
                hr_max_override: cleanProfile.hrMaxOverride ?? null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            ),
          ]);
          if (pubRes.error || bioRes.error) {
            console.warn(
              "[PULSE supabaseStore] saveProfile failed:",
              pubRes.error?.message ?? bioRes.error?.message,
            );
            state = { ...state, profiles: prevProfiles };
            notify();
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] saveProfile exception:", err);
          state = { ...state, profiles: prevProfiles };
          notify();
        }
      })();
    },
    setActiveProfile(id: string) {
      if (state.activeId === id) return;
      state = { ...state, activeId: id };
      notify();
    },
    listDances: () => [...dances],
    getDance: (id: string) => dances.find((dance) => dance.id === id),
    saveResult(r: SessionResult) {
      assertSessionResult(r);
      const prevResults = state.results;
      const prevBadges = state.badges;
      const nextResults = upsert(state.results, structuredClone(r));
      const earned = evaluateNewBadges(r.playerId, r, nextResults, state.badges, state.groups);
      state = {
        ...state,
        results: nextResults,
        badges: [...state.badges, ...earned],
      };
      notify();

      if (r.playerId === GUEST_ID || !isUuid(r.playerId)) return;
      const sb = client();
      if (!sb) return;

      const hasHr = resultHasHeartRate(r);
      const avgBpm = computeAvgBpm(r);

      void (async () => {
        try {
          const resWrite = await sb.from("session_results").upsert(
            {
              id: r.id,
              player_id: r.playerId,
              dance_id: r.danceId,
              completed: r.completed,
              total_points: r.totalPoints,
              accuracy_pct: r.accuracyPct,
              level: r.level,
              duration_sec: r.durationSec,
              best_window_start_sec: r.bestWindowStartSec,
              has_heart_rate: hasHr,
              avg_bpm: avgBpm,
              created_at: r.createdAtIso,
            },
            { onConflict: "id" },
          );
          const privWrite = await sb.from("session_private_data").upsert(
            {
              result_id: r.id,
              player_id: r.playerId,
              calories_kcal: r.caloriesKcal,
              samples: r.samples,
            },
            { onConflict: "result_id" },
          );

          if (resWrite.error || privWrite.error) {
            console.warn(
              "[PULSE supabaseStore] saveResult failed:",
              resWrite.error?.message ?? privWrite.error?.message,
            );
            state = { ...state, results: prevResults, badges: prevBadges };
            notify();
            return;
          }

          if (earned.length > 0) {
            const badgeWrite = await sb.from("earned_badges").upsert(
              earned.map((b) => ({
                badge_id: b.badgeId,
                player_id: b.playerId,
                earned_at: b.earnedAtIso,
              })),
              { onConflict: "badge_id,player_id" },
            );
            if (badgeWrite.error) {
              console.warn("[PULSE supabaseStore] earned_badges upsert warning:", badgeWrite.error.message);
            }
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] saveResult exception:", err);
          state = { ...state, results: prevResults, badges: prevBadges };
          notify();
        }
      })();
    },
    getResult: (id: string) => structuredClone(state.results.find((result) => result.id === id)),
    listResults: (playerId: string) => structuredClone(state.results.filter((result) => result.playerId === playerId)),
    createPost(p) {
      if (p.authorId === GUEST_ID) {
        throw new Error("Create an account to share posts with your crew.");
      }
      const existingIds = new Set(state.posts.map(({ id }) => id));
      let postId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `post-${crypto.randomUUID()}`
        : `post-${state.posts.length + 1}`;
      let seq = state.posts.length + 1;
      while (existingIds.has(postId)) {
        postId = `post-${seq++}`;
      }

      const post: FeedPost = {
        ...structuredClone(p),
        id: postId,
        kudosBy: [],
        createdAtIso: new Date().toISOString(),
      };
      assertFeedPost(post);

      const prevPosts = state.posts;
      state = {
        ...state,
        posts: [post, ...state.posts],
      };
      notify();

      const sb = client();
      if (sb && isUuid(post.authorId)) {
        const result = state.results.find((r) => r.id === post.resultId);
        const sharedCaloriesKcal = post.showCalories && result ? result.caloriesKcal : null;
        const sharedAvgBpm = post.showHeartRate === true && result ? computeAvgBpm(result) : null;

        void (async () => {
          try {
            const { error: postErr } = await sb.from("feed_posts").insert({
              id: post.id,
              author_id: post.authorId,
              result_id: post.resultId,
              show_calories: post.showCalories,
              show_heart_rate: post.showHeartRate ?? false,
              has_clip: post.hasClip,
              shared_calories_kcal: sharedCaloriesKcal,
              shared_avg_bpm: sharedAvgBpm,
              created_at: post.createdAtIso,
            });
            if (postErr) {
              console.warn("[PULSE supabaseStore] createPost failed:", postErr.message);
              state = { ...state, posts: prevPosts };
              notify();
              return;
            }
            if (post.groupIds.length > 0) {
              const { error: groupErr } = await sb.from("post_groups").insert(
                post.groupIds.map((groupId) => ({
                  post_id: post.id,
                  group_id: groupId,
                })),
              );
              if (groupErr) {
                console.warn("[PULSE supabaseStore] post_groups insert warning:", groupErr.message);
              }
            }
          } catch (err) {
            console.warn("[PULSE supabaseStore] createPost exception:", err);
            state = { ...state, posts: prevPosts };
            notify();
          }
        })();
      }

      return structuredClone(post);
    },
    listFeed: (groupId?: string) =>
      structuredClone(
        state.posts
          .filter((post) => groupId === undefined || post.groupIds.includes(groupId))
          .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso)),
      ),
    toggleKudos(postId: string, playerId: string) {
      if (playerId === GUEST_ID) return;
      const target = state.posts.find((p) => p.id === postId);
      if (!target) return;
      const removing = target.kudosBy.includes(playerId);
      const prevPosts = state.posts;

      state = {
        ...state,
        posts: state.posts.map((post) =>
          post.id === postId ? { ...post, kudosBy: toggle(post.kudosBy, playerId) } : post,
        ),
      };
      notify();

      const sb = client();
      if (!sb || !isUuid(playerId)) return;

      void (async () => {
        try {
          if (removing) {
            const { error } = await sb
              .from("post_kudos")
              .delete()
              .eq("post_id", postId)
              .eq("user_id", playerId);
            if (error) {
              console.warn("[PULSE supabaseStore] delete post_kudos failed:", error.message);
              state = { ...state, posts: prevPosts };
              notify();
            }
          } else {
            const { error } = await sb
              .from("post_kudos")
              .insert({ post_id: postId, user_id: playerId });
            if (error) {
              console.warn("[PULSE supabaseStore] insert post_kudos failed:", error.message);
              state = { ...state, posts: prevPosts };
              notify();
            }
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] toggleKudos exception:", err);
          state = { ...state, posts: prevPosts };
          notify();
        }
      })();
    },
    listGroups: () => structuredClone(state.groups),
    joinGroup(groupId: string, playerId: string) {
      if (playerId === GUEST_ID) {
        throw new Error("Create an account to join groups.");
      }
      const group = state.groups.find((g) => g.id === groupId);
      const profile = state.profiles.find((p) => p.id === playerId);
      if (!group || !profile) return;
      if (group.memberIds.includes(playerId) && profile.groupIds.includes(groupId)) return;

      const prevGroups = state.groups;
      const prevProfiles = state.profiles;
      state = {
        ...state,
        groups: state.groups.map((g) =>
          g.id === groupId && !g.memberIds.includes(playerId)
            ? { ...g, memberIds: [...g.memberIds, playerId] }
            : g,
        ),
        profiles: state.profiles.map((p) =>
          p.id === playerId && !p.groupIds.includes(groupId)
            ? { ...p, groupIds: [...p.groupIds, groupId] }
            : p,
        ),
      };
      notify();

      const sb = client();
      if (!sb || !isUuid(playerId)) return;

      void (async () => {
        try {
          const { error } = await sb
            .from("group_members")
            .upsert({ group_id: groupId, user_id: playerId }, { onConflict: "group_id,user_id" });
          if (error) {
            console.warn("[PULSE supabaseStore] joinGroup failed:", error.message);
            state = { ...state, groups: prevGroups, profiles: prevProfiles };
            notify();
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] joinGroup exception:", err);
          state = { ...state, groups: prevGroups, profiles: prevProfiles };
          notify();
        }
      })();
    },
    leaveGroup(groupId: string, playerId: string) {
      const group = state.groups.find((g) => g.id === groupId);
      const profile = state.profiles.find((p) => p.id === playerId);
      if (!group || !profile) return;
      if (!group.memberIds.includes(playerId) && !profile.groupIds.includes(groupId)) return;

      const prevGroups = state.groups;
      const prevProfiles = state.profiles;
      state = {
        ...state,
        groups: state.groups.map((g) =>
          g.id === groupId ? { ...g, memberIds: g.memberIds.filter((id) => id !== playerId) } : g,
        ),
        profiles: state.profiles.map((p) =>
          p.id === playerId ? { ...p, groupIds: p.groupIds.filter((id) => id !== groupId) } : p,
        ),
      };
      notify();

      const sb = client();
      if (!sb || !isUuid(playerId)) return;

      void (async () => {
        try {
          const { error } = await sb
            .from("group_members")
            .delete()
            .eq("group_id", groupId)
            .eq("user_id", playerId);
          if (error) {
            console.warn("[PULSE supabaseStore] leaveGroup failed:", error.message);
            state = { ...state, groups: prevGroups, profiles: prevProfiles };
            notify();
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] leaveGroup exception:", err);
          state = { ...state, groups: prevGroups, profiles: prevProfiles };
          notify();
        }
      })();
    },
    weeklyLeaderboard(groupId: string, danceId: string) {
      const group = state.groups.find(({ id }) => id === groupId);
      if (!group?.groupDanceIds.includes(danceId)) return [];
      return computeWeeklyLeaderboard(state.results, group.memberIds, danceId);
    },
    listMeetups: (groupId: string) => structuredClone(state.meetups.filter((m) => m.groupId === groupId)),
    toggleRsvp(meetupId: string, playerId: string) {
      state = {
        ...state,
        meetups: state.meetups.map((m) =>
          m.id === meetupId ? { ...m, rsvpIds: toggle(m.rsvpIds, playerId) } : m,
        ),
      };
      notify();
    },
    listBadges: (playerId: string) => structuredClone(state.badges.filter((b) => b.playerId === playerId)),
    awardBadge(b: EarnedBadge) {
      if (state.badges.some((existing) => existing.playerId === b.playerId && existing.badgeId === b.badgeId)) {
        return;
      }
      const prevBadges = state.badges;
      state = {
        ...state,
        badges: [...state.badges, structuredClone(b)],
      };
      notify();

      if (b.playerId === GUEST_ID || !isUuid(b.playerId)) return;
      const sb = client();
      if (!sb) return;

      void (async () => {
        try {
          const { error } = await sb.from("earned_badges").upsert(
            {
              badge_id: b.badgeId,
              player_id: b.playerId,
              earned_at: b.earnedAtIso,
            },
            { onConflict: "badge_id,player_id" },
          );
          if (error) {
            console.warn("[PULSE supabaseStore] awardBadge failed:", error.message);
            state = { ...state, badges: prevBadges };
            notify();
          }
        } catch (err) {
          console.warn("[PULSE supabaseStore] awardBadge exception:", err);
          state = { ...state, badges: prevBadges };
          notify();
        }
      })();
    },
    async resetDemo() {
      // Never wipe production database in Supabase mode; simply refresh cache.
      await refresh();
    },
    saveResultHighlight: saveResultHighlightMethod,
    getResultHighlight: getResultHighlightMethod,
  };
}
