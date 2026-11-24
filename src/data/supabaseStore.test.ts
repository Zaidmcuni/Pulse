/**
 * Owner: Ali / Infrastructure
 * Purpose: Unit tests for the Supabase Store adapter (privacy separation, optimistic cache,
 *          kudos, group memberships, highlights, and local fallback when unconfigured).
 * FRs: FR-02, FR-38, FR-39, FR-40, FR-41, FR-42, FR-46, FR-51
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertFeedPost, assertSessionResult } from "../contracts/validators";
import { getSupabaseClient, isSupabaseConfigured, setSupabaseClientForTest } from "../lib/supabase";
import { computeAvgBpm } from "./postStats";
import { createSupabaseStore } from "./supabaseStore";
import { songMs, type PlayerProfile, type RecordedPoseSample, type SessionResult } from "../types/pulse";

const USER_A_ID = "11111111-1111-4111-8111-111111111111";
const USER_B_ID = "22222222-2222-4222-8222-222222222222";

const PROFILE_A: PlayerProfile = {
  id: USER_A_ID,
  handle: "amira-steps",
  displayName: "Amira",
  age: 29,
  sex: "female",
  weightKg: 62.5,
  heightCm: 168,
  restingHr: 58,
  hrMaxOverride: 192,
  mode: "standing",
  groupIds: ["mcgill-friday-night-crew"],
};

const RESULT_A: SessionResult = {
  id: "res-a-1",
  playerId: USER_A_ID,
  danceId: "dance4",
  completed: true,
  totalPoints: 1420,
  accuracyPct: 86.5,
  level: "superstar",
  durationSec: 20,
  caloriesKcal: 24.8,
  bestWindowStartSec: 5,
  samples: [
    { tSec: 1, heartRate: 148, hrSource: "ble", effort: 0.8, accuracy: 0.85, points: 70 },
    { tSec: 2, heartRate: 152, hrSource: "ble", effort: 0.85, accuracy: 0.88, points: 72 },
  ],
  createdAtIso: "2026-11-23T15:00:00.000Z",
};

interface TableStore {
  rows: Record<string, unknown>[];
  upserts: Record<string, unknown>[];
  inserts: Record<string, unknown>[];
  deletes: Record<string, unknown>[];
}

function createMockSupabase(initialSessionUserId: string | null = USER_A_ID) {
  const tables: Record<string, TableStore> = {
    public_profiles: { rows: [], upserts: [], inserts: [], deletes: [] },
    private_biometrics: { rows: [], upserts: [], inserts: [], deletes: [] },
    groups: {
      rows: [
        {
          id: "mcgill-friday-night-crew",
          name: "McGill Friday Night Crew",
          kind: "friends",
          group_dance_ids: ["dance4"],
        },
      ],
      upserts: [],
      inserts: [],
      deletes: [],
    },
    group_members: { rows: [], upserts: [], inserts: [], deletes: [] },
    session_results: { rows: [], upserts: [], inserts: [], deletes: [] },
    session_private_data: { rows: [], upserts: [], inserts: [], deletes: [] },
    feed_posts: { rows: [], upserts: [], inserts: [], deletes: [] },
    post_groups: { rows: [], upserts: [], inserts: [], deletes: [] },
    post_kudos: { rows: [], upserts: [], inserts: [], deletes: [] },
    earned_badges: { rows: [], upserts: [], inserts: [], deletes: [] },
    result_highlights: { rows: [], upserts: [], inserts: [], deletes: [] },
  };

  const sessionUserId = initialSessionUserId;

  const from = vi.fn((tableName: string) => {
    const tbl = tables[tableName] ?? (tables[tableName] = { rows: [], upserts: [], inserts: [], deletes: [] });

    const makeFilterBuilder = (mode: "select" | "delete", filters: Record<string, unknown> = {}) => {
      const execute = () => {
        const matched = tbl.rows.filter((row) =>
          Object.entries(filters).every(([k, v]) => row[k] === v),
        );
        if (mode === "delete") {
          tbl.deletes.push({ ...filters });
          tbl.rows = tbl.rows.filter(
            (row) => !Object.entries(filters).every(([k, v]) => row[k] === v),
          );
        }
        return Promise.resolve({ data: matched, error: null });
      };

      const chain = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return chain;
        },
        match(matchObj: Record<string, unknown>) {
          Object.assign(filters, matchObj);
          return chain;
        },
        maybeSingle() {
          const matched = tbl.rows.filter((row) =>
            Object.entries(filters).every(([k, v]) => row[k] === v),
          );
          return Promise.resolve({ data: matched[0] ?? null, error: null });
        },
        then(
          onFulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => unknown) | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ) {
          return execute().then(onFulfilled, onRejected);
        },
      };
      return chain;
    };

    return {
      select: vi.fn(() => makeFilterBuilder("select")),
      upsert: vi.fn((payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const items = Array.isArray(payload) ? payload : [payload];
        tbl.upserts.push(...items);
        tbl.rows.push(...items);
        return Promise.resolve({ data: items, error: null });
      }),
      insert: vi.fn((payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const items = Array.isArray(payload) ? payload : [payload];
        tbl.inserts.push(...items);
        tbl.rows.push(...items);
        return Promise.resolve({ data: items, error: null });
      }),
      delete: vi.fn(() => makeFilterBuilder("delete")),
    };
  });

  const channelObj = {
    on: vi.fn(() => channelObj),
    subscribe: vi.fn(() => channelObj),
  };

  const client = {
    from,
    channel: vi.fn(() => channelObj),
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: sessionUserId ? { user: { id: sessionUserId, email: "amira@example.com" } } : null,
        },
        error: null,
      })),
    },
  } as unknown as SupabaseClient;

  return { client, tables };
}

beforeEach(() => {
  setSupabaseClientForTest(null);
});

afterEach(() => {
  setSupabaseClientForTest(null);
  vi.restoreAllMocks();
});

describe("Supabase configuration fallback", () => {
  it("returns false for isSupabaseConfigured() and null for getSupabaseClient() when env vars are absent", () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseClient()).toBeNull();
  });
});

describe("Supabase Store privacy separation & write-through cache", () => {
  it("saveProfile splits public_profiles and private_biometrics cleanly", async () => {
    const { client, tables } = createMockSupabase();
    const s = createSupabaseStore(client);
    await s.init();

    s.saveProfile({ ...PROFILE_A, handle: "@amira-steps" });
    await new Promise((r) => setTimeout(r, 10));

    // Optimistic cache has full profile with @ stripped
    expect(s.listProfiles()).toHaveLength(1);
    expect(s.listProfiles()[0].handle).toBe("amira-steps");
    expect(s.listProfiles()[0].weightKg).toBe(62.5);

    // Public table receives ONLY public identity fields (never age, sex, weight, height, resting_hr)
    expect(tables.public_profiles.upserts).toHaveLength(1);
    const pubRow = tables.public_profiles.upserts[0];
    expect(pubRow).toEqual({
      id: USER_A_ID,
      handle: "amira-steps",
      display_name: "Amira",
      mode: "standing",
    });
    for (const forbidden of ["age", "sex", "weight_kg", "weightKg", "height_cm", "heightCm", "resting_hr", "restingHr", "hr_max_override"]) {
      expect(pubRow).not.toHaveProperty(forbidden);
    }

    // Private biometrics table receives body stats strictly under user_id
    expect(tables.private_biometrics.upserts).toHaveLength(1);
    expect(tables.private_biometrics.upserts[0]).toMatchObject({
      user_id: USER_A_ID,
      age: 29,
      sex: "female",
      weight_kg: 62.5,
      height_cm: 168,
      resting_hr: 58,
      hr_max_override: 192,
    });
  });

  it("saveResult splits public session_results from private session_private_data and awards badges", async () => {
    const { client, tables } = createMockSupabase();
    const s = createSupabaseStore(client);
    await s.init();

    s.saveResult(RESULT_A);
    await new Promise((r) => setTimeout(r, 10));

    const cached = s.getResult(RESULT_A.id)!;
    assertSessionResult(cached);
    expect(cached).toEqual(RESULT_A);

    // Public session_results never contains raw samples or calories_kcal
    expect(tables.session_results.upserts).toHaveLength(1);
    const pubResult = tables.session_results.upserts[0];
    expect(pubResult).toMatchObject({
      id: RESULT_A.id,
      player_id: USER_A_ID,
      dance_id: "dance4",
      completed: true,
      total_points: 1420,
      accuracy_pct: 86.5,
      level: "superstar",
      duration_sec: 20,
      best_window_start_sec: 5,
      has_heart_rate: true,
      avg_bpm: 150,
    });
    expect(pubResult).not.toHaveProperty("calories_kcal");
    expect(pubResult).not.toHaveProperty("samples");

    // Private session_private_data stores calories_kcal and samples[]
    expect(tables.session_private_data.upserts).toHaveLength(1);
    expect(tables.session_private_data.upserts[0]).toEqual({
      result_id: RESULT_A.id,
      player_id: USER_A_ID,
      calories_kcal: 24.8,
      samples: RESULT_A.samples,
    });

    // Earned badges (first_steps, superstar, 1k_club) are awarded and persisted
    const badgeIds = s.listBadges(USER_A_ID).map((b) => b.badgeId);
    expect(badgeIds).toContain("first_steps");
    expect(badgeIds).toContain("superstar");
    expect(badgeIds).toContain("1k_club");
    expect(tables.earned_badges.upserts.length).toBeGreaterThanOrEqual(3);
  });

  it("createPost validates via assertFeedPost and only attaches shared_calories_kcal / shared_avg_bpm when toggled on", async () => {
    const { client, tables } = createMockSupabase();
    const s = createSupabaseStore(client);
    await s.init();
    s.saveResult(RESULT_A);

    // 1. Both showCalories and showHeartRate OFF
    const postPrivate = s.createPost({
      authorId: USER_A_ID,
      resultId: RESULT_A.id,
      showCalories: false,
      showHeartRate: false,
      hasClip: false,
      groupIds: ["mcgill-friday-night-crew"],
    });
    assertFeedPost(postPrivate);

    // 2. Both showCalories and showHeartRate ON
    const postShared = s.createPost({
      authorId: USER_A_ID,
      resultId: RESULT_A.id,
      showCalories: true,
      showHeartRate: true,
      hasClip: true,
      groupIds: [],
    });
    assertFeedPost(postShared);

    await new Promise((r) => setTimeout(r, 10));

    expect(tables.feed_posts.inserts).toHaveLength(2);
    expect(tables.feed_posts.inserts[0]).toMatchObject({
      id: postPrivate.id,
      author_id: USER_A_ID,
      result_id: RESULT_A.id,
      show_calories: false,
      show_heart_rate: false,
      shared_calories_kcal: null,
      shared_avg_bpm: null,
    });
    expect(tables.feed_posts.inserts[1]).toMatchObject({
      id: postShared.id,
      author_id: USER_A_ID,
      result_id: RESULT_A.id,
      show_calories: true,
      show_heart_rate: true,
      has_clip: true,
      shared_calories_kcal: 24.8,
      shared_avg_bpm: 150,
    });
    expect(tables.post_groups.inserts).toEqual([
      { post_id: postPrivate.id, group_id: "mcgill-friday-night-crew" },
    ]);
  });

  it("hydrates active user with real biometrics/samples while keeping other users' private fields unexposed", async () => {
    const { client, tables } = createMockSupabase(USER_A_ID);
    tables.public_profiles.rows.push(
      { id: USER_A_ID, handle: "amira-steps", display_name: "Amira", mode: "standing" },
      { id: USER_B_ID, handle: "theo-on-beat", display_name: "Theo", mode: "seated" },
    );
    tables.private_biometrics.rows.push({
      user_id: USER_A_ID,
      age: 29,
      sex: "female",
      weight_kg: 62.5,
      height_cm: 168,
      resting_hr: 58,
      hr_max_override: 192,
    });
    tables.session_results.rows.push(
      {
        id: "res-own",
        player_id: USER_A_ID,
        dance_id: "dance4",
        completed: true,
        total_points: 1420,
        accuracy_pct: 86.5,
        level: "superstar",
        duration_sec: 20,
        best_window_start_sec: 5,
        has_heart_rate: true,
        avg_bpm: 150,
        created_at: "2026-11-23T14:00:00.000Z",
      },
      {
        id: "res-other-private",
        player_id: USER_B_ID,
        dance_id: "dance4",
        completed: true,
        total_points: 1100,
        accuracy_pct: 75,
        level: "gold",
        duration_sec: 20,
        best_window_start_sec: 0,
        has_heart_rate: true,
        avg_bpm: 164,
        created_at: "2026-11-23T14:05:00.000Z",
      },
      {
        id: "res-other-shared",
        player_id: USER_B_ID,
        dance_id: "dance4",
        completed: true,
        total_points: 1300,
        accuracy_pct: 82,
        level: "gold",
        duration_sec: 20,
        best_window_start_sec: 0,
        has_heart_rate: true,
        avg_bpm: 158,
        created_at: "2026-11-23T14:10:00.000Z",
      },
    );
    tables.session_private_data.rows.push({
      result_id: "res-own",
      player_id: USER_A_ID,
      calories_kcal: 24.8,
      samples: RESULT_A.samples,
    });
    tables.feed_posts.rows.push(
      {
        id: "post-private",
        author_id: USER_B_ID,
        result_id: "res-other-private",
        show_calories: false,
        show_heart_rate: false,
        has_clip: false,
        shared_calories_kcal: null,
        shared_avg_bpm: null,
        created_at: "2026-11-23T14:06:00.000Z",
      },
      {
        id: "post-shared",
        author_id: USER_B_ID,
        result_id: "res-other-shared",
        show_calories: true,
        show_heart_rate: true,
        has_clip: false,
        shared_calories_kcal: 31.2,
        shared_avg_bpm: 158,
        created_at: "2026-11-23T14:11:00.000Z",
      },
    );

    const s = createSupabaseStore(client);
    await s.init();

    const ownProfile = s.listProfiles().find((p) => p.id === USER_A_ID)!;
    const otherProfile = s.listProfiles().find((p) => p.id === USER_B_ID)!;
    expect(ownProfile.weightKg).toBe(62.5);
    expect(ownProfile.hrMaxOverride).toBe(192);
    // Other user gets safe placeholders
    expect(otherProfile.weightKg).toBe(70);
    expect(otherProfile.age).toBe(24);
    expect(otherProfile.hrMaxOverride).toBeUndefined();

    // Own result has full samples and calories
    const ownRes = s.getResult("res-own")!;
    expect(ownRes.caloriesKcal).toBe(24.8);
    expect(ownRes.samples).toEqual(RESULT_A.samples);

    // Other user's unshared result hides calories and heart rate
    const otherPrivRes = s.getResult("res-other-private")!;
    expect(otherPrivRes.caloriesKcal).toBe(0);
    expect(otherPrivRes.samples).toEqual([]);
    expect(computeAvgBpm(otherPrivRes)).toBeNull();

    // Other user's explicitly shared post exposes opted-in calories and synthetic avg BPM
    const otherSharedRes = s.getResult("res-other-shared")!;
    expect(otherSharedRes.caloriesKcal).toBe(31.2);
    expect(computeAvgBpm(otherSharedRes)).toBe(158);
  });

  it("toggleKudos inserts and deletes post_kudos and updates cache optimistically", async () => {
    const { client, tables } = createMockSupabase(USER_A_ID);
    const s = createSupabaseStore(client);
    await s.init();
    s.saveResult(RESULT_A);
    const post = s.createPost({
      authorId: USER_A_ID,
      resultId: RESULT_A.id,
      showCalories: false,
      hasClip: false,
      groupIds: [],
    });

    // Add kudos
    s.toggleKudos(post.id, USER_B_ID);
    expect(s.listFeed()[0].kudosBy).toEqual([USER_B_ID]);
    await new Promise((r) => setTimeout(r, 10));
    expect(tables.post_kudos.inserts).toContainEqual({ post_id: post.id, user_id: USER_B_ID });

    // Remove kudos
    s.toggleKudos(post.id, USER_B_ID);
    expect(s.listFeed()[0].kudosBy).toEqual([]);
    await new Promise((r) => setTimeout(r, 10));
    expect(tables.post_kudos.deletes).toContainEqual({ post_id: post.id, user_id: USER_B_ID });
  });

  it("joinGroup and leaveGroup update group_members and local cache", async () => {
    const { client, tables } = createMockSupabase(USER_A_ID);
    tables.public_profiles.rows.push({
      id: USER_A_ID,
      handle: "amira-steps",
      display_name: "Amira",
      mode: "standing",
    });
    const s = createSupabaseStore(client);
    await s.init();

    s.joinGroup("mcgill-friday-night-crew", USER_A_ID);
    expect(s.listGroups()[0].memberIds).toContain(USER_A_ID);
    expect(s.listProfiles()[0].groupIds).toContain("mcgill-friday-night-crew");
    await new Promise((r) => setTimeout(r, 10));
    expect(tables.group_members.upserts).toContainEqual({
      group_id: "mcgill-friday-night-crew",
      user_id: USER_A_ID,
    });

    s.leaveGroup("mcgill-friday-night-crew", USER_A_ID);
    expect(s.listGroups()[0].memberIds).not.toContain(USER_A_ID);
    expect(s.listProfiles()[0].groupIds).not.toContain("mcgill-friday-night-crew");
    await new Promise((r) => setTimeout(r, 10));
    expect(tables.group_members.deletes).toContainEqual({
      group_id: "mcgill-friday-night-crew",
      user_id: USER_A_ID,
    });
  });

  it("saves and retrieves 2D silhouette result_highlights without ever uploading raw video", async () => {
    const { client, tables } = createMockSupabase(USER_A_ID);
    const s = createSupabaseStore(client);
    await s.init();

    const makeSample = (t: number): RecordedPoseSample => ({
      tSongMs: songMs(t),
      points: Array.from({ length: 12 }, () => ({ x: 0.2, y: 0.4, v: 0.9 })),
    });
    const samples = [0, 4800, 5000, 10000, 19800, 20000].map(makeSample);

    s.saveResultHighlight(RESULT_A, 30, samples);
    await new Promise((r) => setTimeout(r, 10));

    expect(tables.result_highlights.upserts).toHaveLength(1);
    expect(tables.result_highlights.upserts[0]).toMatchObject({
      result_id: RESULT_A.id,
      player_id: USER_A_ID,
      start_sec: 5,
      duration_sec: 15,
    });
    expect(s.getResultHighlight(RESULT_A.id)).toBeDefined();
  });
});
