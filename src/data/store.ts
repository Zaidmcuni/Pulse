/**
 * Owner: Ali
 * Purpose: localStorage-backed Store; seed from /seed/*.json on first run; dances from /dances/index.json (kept in memory, never in localStorage)
 * FRs: FR-51, FR-52
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Every dance file goes through parseDance(). Every saved result through assertSessionResult(); every post through assertFeedPost().
 */

import { assertFeedPost, assertSessionResult, parseDance } from "../contracts/validators";
import { createMemoryStore } from "../mocks/memoryStore";
import type { Dance, EarnedBadge, FeedPost, Group, Meetup, PlayerProfile, SessionResult, Store } from "../types/pulse";

const STORAGE_KEY = "pulse:store";

interface State {
  activeId: string | null;
  profiles: PlayerProfile[];
  results: SessionResult[];
  posts: FeedPost[];
  groups: Group[];
  meetups: Meetup[];
  badges: EarnedBadge[];
}

function arrayOf<T>(value: unknown, source: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Expected an array in ${source}`);
  return value;
}

async function loadJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response.json();
}

async function loadArray<T>(path: string): Promise<T[]> {
  return arrayOf<T>(await loadJson(path), path);
}

async function loadSeed(): Promise<State> {
  const [profiles, results, posts, groups, meetups] = await Promise.all([
    loadArray<PlayerProfile>("/seed/profiles.json"), loadArray<SessionResult>("/seed/results.json"),
    loadArray<FeedPost>("/seed/posts.json"), loadArray<Group>("/seed/groups.json"),
    loadArray<Meetup>("/seed/meetups.json"),
  ]);
  return { activeId: profiles[0]?.id ?? null, profiles, results, posts, groups, meetups, badges: [] };
}

async function loadDances(): Promise<Dance[]> {
  const ids = await loadArray<unknown>("/dances/index.json");
  return Promise.all(ids.map(async (id) => {
    if (typeof id !== "string" || !id) throw new Error("Invalid dance ID in /dances/index.json");
    const dance = parseDance(await loadJson(`/dances/${encodeURIComponent(id)}.json`));
    if (dance.id !== id) throw new Error(`Dance ID does not match catalogue entry ${id}`);
    return dance;
  }));
}

function readState(): State | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) return null;
  const state: State = JSON.parse(stored);
  if (!state || (state.activeId !== null && typeof state.activeId !== "string")) {
    throw new Error("Invalid saved PULSE data");
  }
  for (const key of ["profiles", "results", "posts", "groups", "meetups", "badges"] as const) {
    arrayOf(state[key], `saved ${key}`);
  }
  return state;
}

function upsert<T extends { id: string }>(records: T[], record: T): T[] {
  return [...records.filter(({ id }) => id !== record.id), record];
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function withMembership(state: State, profile: PlayerProfile): State {
  const groupIds = [...new Set(profile.groupIds)].filter((id) => state.groups.some((group) => group.id === id));
  const groups = state.groups.map((group) => {
    const isMember = group.memberIds.includes(profile.id);
    if (isMember === groupIds.includes(group.id)) return group;
    return { ...group, memberIds: toggle(group.memberIds, profile.id) };
  });
  return { ...state, groups, profiles: upsert(state.profiles, { ...profile, groupIds }) };
}

function createBrowserStore(): Store {
  let state: State = { activeId: null, profiles: [], results: [], posts: [], groups: [], meetups: [], badges: [] };
  let dances: Dance[] = [];
  let initialization: Promise<void> | undefined;

  function persist(next: State): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
  }

  function update(change: (current: State) => State): void {
    const current = readState();
    if (!current) throw new Error("PULSE store has not initialized");
    const next = change(current);
    if (next !== current) persist(next);
    else state = current;
  }

  async function initialize(): Promise<void> {
    const saved = readState();
    const [candidate, catalogue] = await Promise.all([saved ?? loadSeed(), loadDances()]);
    // Another tab may have finished seeding while the assets were loading.
    const current = readState();
    const next = current ?? candidate;
    next.results.forEach(assertSessionResult);
    next.posts.forEach(assertFeedPost);
    if (current) state = current;
    else persist(next);
    dances = catalogue;
  }

  function changeMembership(groupId: string, playerId: string, join: boolean): void {
    update((current) => {
      const group = current.groups.find(({ id }) => id === groupId);
      const profile = current.profiles.find(({ id }) => id === playerId);
      if (!group || !profile || (profile.groupIds.includes(groupId) === join && group.memberIds.includes(playerId) === join)) return current;
      const groupIds = profile.groupIds.filter((id) => id !== groupId);
      if (join) groupIds.push(groupId);
      return withMembership(current, { ...profile, groupIds });
    });
  }

  return {
    init() {
      initialization ??= initialize().catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
      return initialization;
    },
    listProfiles: () => structuredClone(state.profiles),
    getActiveProfile: () => structuredClone(state.profiles.find(({ id }) => id === state.activeId) ?? null),
    saveProfile(p) {
      update((current) => withMembership(current, structuredClone(p)));
    },
    setActiveProfile(id) {
      update((current) => ({ ...current, activeId: id }));
    },
    listDances: () => [...dances],
    getDance: (id) => dances.find((dance) => dance.id === id),
    saveResult(r) {
      assertSessionResult(r);
      update((current) => ({ ...current, results: upsert(current.results, structuredClone(r)) }));
    },
    getResult: (id) => structuredClone(state.results.find((result) => result.id === id)),
    listResults: (playerId) => structuredClone(state.results.filter((result) => result.playerId === playerId)),
    createPost(p) {
      const current = readState();
      if (!current) throw new Error("PULSE store has not initialized");
      const ids = new Set(current.posts.map(({ id }) => id));
      let number = current.posts.length + 1;
      while (ids.has(`post-${number}`)) number++;
      const post: FeedPost = { ...structuredClone(p), id: `post-${number}`, kudosBy: [], createdAtIso: new Date().toISOString() };
      assertFeedPost(post);
      persist({ ...current, posts: [post, ...current.posts] });
      return structuredClone(post);
    },
    listFeed: (groupId) => structuredClone(state.posts
      .filter((post) => groupId === undefined || post.groupIds.includes(groupId))
      .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))),
    toggleKudos(postId, playerId) {
      update((current) => ({
        ...current,
        posts: current.posts.map((post) => post.id === postId ? { ...post, kudosBy: toggle(post.kudosBy, playerId) } : post),
      }));
    },
    listGroups: () => structuredClone(state.groups),
    joinGroup: (groupId, playerId) => changeMembership(groupId, playerId, true),
    leaveGroup: (groupId, playerId) => changeMembership(groupId, playerId, false),
    weeklyLeaderboard: () => [],
    listMeetups: (groupId) => structuredClone(state.meetups.filter((meetup) => meetup.groupId === groupId)),
    toggleRsvp(meetupId, playerId) {
      update((current) => ({
        ...current,
        meetups: current.meetups.map((meetup) => meetup.id === meetupId ? { ...meetup, rsvpIds: toggle(meetup.rsvpIds, playerId) } : meetup),
      }));
    },
    listBadges: (playerId) => structuredClone(state.badges.filter((badge) => badge.playerId === playerId)),
    awardBadge(b) {
      update((current) => ({ ...current, badges: [...current.badges, structuredClone(b)] }));
    },
    resetDemo: () => {},
  };
}

// GetReady's server-rendered previews use the same contract without browser APIs.
export const store: Store = typeof window === "undefined" ? createMemoryStore() : createBrowserStore();
