/**
 * Owner: Ali
 * Purpose: Verify browser store initialization, persistence, and data boundaries.
 * FR: FR-51
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import groupFixtures from "../../public/seed/groups.json";
import meetupFixtures from "../../public/seed/meetups.json";
import postFixtures from "../../public/seed/posts.json";
import profileFixtures from "../../public/seed/profiles.json";
import resultFixtures from "../../public/seed/results.json";
import { assertFeedPost, assertSessionResult } from "../contracts/validators";
import { FAKE_DANCE } from "../mocks/fakeDance";
import type { EarnedBadge, FeedPost, Group, Meetup, PlayerProfile, SessionResult } from "../types/pulse";

const profiles = profileFixtures as PlayerProfile[];
const results = resultFixtures as SessionResult[];
const posts: FeedPost[] = postFixtures;
const groups = groupFixtures as Group[];
const meetups: Meetup[] = meetupFixtures;
const assets = new Map<string, unknown>([
  ["/seed/profiles.json", profiles], ["/seed/results.json", results], ["/seed/posts.json", posts],
  ["/seed/groups.json", groups], ["/seed/meetups.json", meetups], ["/dances/index.json", []],
]);
const postInput = {
  authorId: posts[0].authorId, resultId: posts[0].resultId, groupIds: posts[0].groupIds,
  showCalories: true, hasClip: false,
};

let files: Map<string, unknown>;
let stored: Map<string, string>;
const storage = {
  getItem: vi.fn((key: string) => stored.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { stored.set(key, value); }),
};
const fetchAsset = vi.fn(async (path: string) => files.has(path)
  ? Response.json(files.get(path))
  : new Response(null, { status: 404 }));

async function newApp() {
  vi.resetModules();
  return (await import("./store")).store;
}

function fetchedPaths(): string[] {
  return fetchAsset.mock.calls.map(([path]) => path);
}

function savedPayload(): string {
  expect(stored.size).toBe(1);
  return [...stored.values()][0];
}

beforeEach(() => {
  stored = new Map();
  files = new Map(assets);
  vi.clearAllMocks();
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("fetch", fetchAsset);
});

afterEach(() => vi.unstubAllGlobals());

describe("store initialization", () => {
  it("loads the real fixtures once across concurrent calls, repeat init, and app reload", async () => {
    const store = await newApp();
    const first = store.init();
    expect(store.init()).toBe(first);
    await first;
    await store.init();

    expect(store.listProfiles()).toEqual(profiles);
    expect(store.getActiveProfile()).toEqual(profiles[0]);
    expect(store.listGroups()).toEqual(groups);
    expect(groups.flatMap(({ id }) => store.listMeetups(id))).toEqual(meetups);
    expect(store.listFeed()).toEqual([...posts].sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso)));
    for (const post of store.listFeed()) assertFeedPost(post);
    for (const result of results) {
      const loaded = store.getResult(result.id)!;
      assertSessionResult(loaded);
      expect(loaded).toEqual(result);
    }
    expect(store.listBadges(profiles[0].id)).toEqual([]);
    expect(store.listDances()).toEqual([]);
    expect(store.getDance("missing")).toBeUndefined();
    expect(store.getResult("missing")).toBeUndefined();
    expect(fetchedPaths().sort()).toEqual([...assets.keys()].sort());
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const saved = savedPayload();

    fetchAsset.mockClear();
    const reloaded = await newApp();
    await reloaded.init();
    expect(fetchedPaths()).toEqual(["/dances/index.json"]);
    expect(reloaded.getActiveProfile()).toEqual(profiles[0]);
    expect(reloaded.listFeed()).toEqual(store.listFeed());
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(savedPayload()).toBe(saved);
  });

  it("loads and validates a populated catalogue without persisting templates or audio paths", async () => {
    files.set("/dances/index.json", [FAKE_DANCE.id]);
    files.set(`/dances/${FAKE_DANCE.id}.json`, FAKE_DANCE);
    const store = await newApp();
    await store.init();

    expect(store.listDances()).toEqual([FAKE_DANCE]);
    expect(store.getDance(FAKE_DANCE.id)).toEqual(FAKE_DANCE);
    expect(Object.keys(JSON.parse(savedPayload())).sort()).toEqual([
      "activeId", "badges", "groups", "meetups", "posts", "profiles", "results",
    ]);
    expect(savedPayload()).not.toContain('"frames"');
    expect(savedPayload()).not.toContain(FAKE_DANCE.audioUrl);
    fetchAsset.mockClear();
    const reloaded = await newApp();
    await reloaded.init();
    expect(fetchedPaths()).toEqual(["/dances/index.json", `/dances/${FAKE_DANCE.id}.json`]);
  });

  it("exposes no seeded data after a failed asset load and can retry", async () => {
    files.delete("/seed/meetups.json");
    const store = await newApp();
    await expect(store.init()).rejects.toThrow("/seed/meetups.json");
    expect(stored.size).toBe(0);
    expect(store.getActiveProfile()).toBeNull();
    expect(store.listGroups()).toEqual([]);
    expect(store.listFeed()).toEqual([]);
    expect(store.getResult(results[0].id)).toBeUndefined();

    files.set("/seed/meetups.json", meetups);
    await store.init();
    expect(store.listFeed()).toHaveLength(posts.length);
    expect(store.getActiveProfile()).toEqual(profiles[0]);
  });

  it("rejects invalid dances and leaves saved data intact", async () => {
    const store = await newApp();
    await store.init();
    store.setActiveProfile(profiles[1].id);
    const saved = savedPayload();
    files.set("/dances/index.json", [FAKE_DANCE.id]);
    files.set(`/dances/${FAKE_DANCE.id}.json`, { ...FAKE_DANCE, frames: [] });

    const reloaded = await newApp();
    await expect(reloaded.init()).rejects.toThrow("frames empty");
    expect(reloaded.listDances()).toEqual([]);
    expect(savedPayload()).toBe(saved);

    files.set(`/dances/${FAKE_DANCE.id}.json`, FAKE_DANCE);
    await reloaded.init();
    expect(reloaded.getActiveProfile()).toEqual(profiles[1]);
  });

  it.each([
    ["/seed/posts.json", [{ ...posts[0], heartRate: 120 }], "forbidden keys"],
    ["/seed/results.json", [{ ...results[0], accuracyPct: 101 }], "accuracyPct"],
  ])("rejects invalid records from %s before persisting", async (path, records, error) => {
    files.set(path, records);
    const store = await newApp();
    await expect(store.init()).rejects.toThrow(error);
    expect(stored.size).toBe(0);
  });

  it("retries a first-run quota failure without exposing partially initialized data", async () => {
    storage.setItem.mockImplementationOnce(() => { throw new DOMException("Storage is full", "QuotaExceededError"); });
    const store = await newApp();
    await expect(store.init()).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(stored.size).toBe(0);
    expect(store.listProfiles()).toEqual([]);
    await store.init();
    expect(store.getActiveProfile()).toEqual(profiles[0]);
    expect(savedPayload()).toBeTruthy();
  });

  it("does not replace unreadable saved data with a seed", async () => {
    const app = await newApp();
    await app.init();
    const [key] = stored.keys();
    stored.set(key, "{bad data");
    const reloaded = await newApp();
    await expect(reloaded.init()).rejects.toThrow(SyntaxError);
    expect(savedPayload()).toBe("{bad data");
  });
});

describe("store writes", () => {
  it("persists profile and result upserts and active-profile changes across app reloads", async () => {
    const store = await newApp();
    await store.init();
    const profile = { ...profiles[1], handle: "demo_user-2", displayName: "Updated dancer" };
    const result = { ...results[0], totalPoints: results[0].totalPoints + 1 };
    store.saveProfile({ ...profile, handle: `@${profile.handle}` });
    store.saveResult(result);
    store.setActiveProfile("unknown");
    expect(store.getActiveProfile()).toBeNull();
    store.setActiveProfile(profile.id);

    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.getActiveProfile()).toEqual(profile);
    expect(reloaded.listProfiles()).toHaveLength(profiles.length);
    const savedResult = reloaded.getResult(result.id)!;
    assertSessionResult(savedResult);
    expect(savedResult).toEqual(result);
    expect(reloaded.listResults(result.playerId).filter(({ id }) => id === result.id)).toEqual([result]);
  });

  it("orders posts by instant, filters groups, and issues new IDs across app reloads", async () => {
    const previousId = `post-${posts.length + 1}`;
    const older = { ...posts[0], id: previousId, createdAtIso: "2026-11-21T00:00:00+01:00" };
    const newer = { ...posts[1], createdAtIso: "2026-11-20T23:30:00Z" };
    files.set("/seed/posts.json", [older, newer, ...posts.slice(2)]);
    const store = await newApp();
    await store.init();
    const original = store.listFeed().map(({ id }) => id);
    expect(original.indexOf(newer.id)).toBeLessThan(original.indexOf(older.id));
    const first = store.createPost(postInput);
    assertFeedPost(first);
    expect(first).toMatchObject({ ...postInput, kudosBy: [] });

    const reloaded = await newApp();
    await reloaded.init();
    const second = reloaded.createPost(postInput);
    const ids = reloaded.listFeed().map(({ id }) => id);
    expect(new Set(ids).size).toBe(posts.length + 2);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(reloaded.listFeed(postInput.groupIds[0])).toEqual(reloaded.listFeed().filter((p) => p.groupIds.includes(postInput.groupIds[0])));
    expect(reloaded.listFeed("missing")).toEqual([]);
  });

  it("persists kudos, RSVPs, badges, and both sides of group membership", async () => {
    const store = await newApp();
    await store.init();
    const group = groups.find((candidate) => profiles.some(({ id }) => !candidate.memberIds.includes(id)))!;
    const player = profiles.find(({ id }) => !group.memberIds.includes(id))!;
    const meetup = meetups[0];
    const post = store.createPost(postInput);
    const badge: EarnedBadge = { badgeId: "first_steps", playerId: player.id, earnedAtIso: "2026-11-21T12:00:00Z" };

    store.toggleKudos(post.id, player.id);
    store.toggleKudos(post.id, player.id);
    expect(store.listFeed().find(({ id }) => id === post.id)?.kudosBy).toEqual([]);
    store.toggleKudos(post.id, player.id);
    const rsvpPlayer = meetup.rsvpIds[0];
    store.toggleRsvp(meetup.id, rsvpPlayer);
    expect(store.listMeetups(meetup.groupId).find(({ id }) => id === meetup.id)?.rsvpIds).not.toContain(rsvpPlayer);
    store.toggleRsvp(meetup.id, rsvpPlayer);
    store.toggleRsvp(meetup.id, rsvpPlayer);
    store.joinGroup(group.id, player.id);
    store.joinGroup(group.id, player.id);
    store.awardBadge(badge);

    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.listFeed().find(({ id }) => id === post.id)?.kudosBy).toEqual([player.id]);
    expect(reloaded.listMeetups(meetup.groupId).find(({ id }) => id === meetup.id)?.rsvpIds).not.toContain(rsvpPlayer);
    expect(reloaded.listBadges(player.id)).toEqual([badge]);
    expect(reloaded.listGroups().find(({ id }) => id === group.id)?.memberIds).toEqual([...group.memberIds, player.id]);
    expect(reloaded.listProfiles().find(({ id }) => id === player.id)?.groupIds).toEqual([...player.groupIds, group.id]);

    reloaded.leaveGroup(group.id, player.id);
    reloaded.resetDemo();
    const afterLeaving = await newApp();
    await afterLeaving.init();
    expect(afterLeaving.listGroups().find(({ id }) => id === group.id)?.memberIds).toEqual(group.memberIds);
    expect(afterLeaving.listProfiles().find(({ id }) => id === player.id)?.groupIds).toEqual(player.groupIds);
    expect(afterLeaving.listBadges(player.id)).toEqual([badge]);
  });

  it("ranks a featured dance from seeded and newly saved scores for current members", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 21, 12));
      const store = await newApp();
      await store.init();
      const groupId = "mcgill-friday-night-crew";
      const danceId = FAKE_DANCE.id;
      const initial = [
        { playerId: "player-nia", points: 204 },
        { playerId: "player-theo", points: 190 },
        { playerId: "player-amira", points: 179 },
        { playerId: "player-jules", points: 87 },
      ];
      expect(store.weeklyLeaderboard(groupId, danceId)).toEqual(initial);

      const highScore = { ...results[0], id: "amira-new-best", totalPoints: 220, createdAtIso: new Date().toISOString() };
      store.saveResult(highScore);
      const updated = [{ playerId: "player-amira", points: 220 }, initial[0], initial[1], initial[3]];
      expect(store.weeklyLeaderboard(groupId, danceId)).toEqual(updated);

      const unfeatured = "unfeatured-dance";
      store.saveResult({ ...highScore, id: "unfeatured-result", danceId: unfeatured });
      expect(store.weeklyLeaderboard(groupId, unfeatured)).toEqual([]);
      expect(store.weeklyLeaderboard("missing-group", danceId)).toEqual([]);
      store.leaveGroup(groupId, highScore.playerId);
      expect(store.weeklyLeaderboard(groupId, danceId)).toEqual(updated.slice(1));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not persist rejected records or publish failed writes", async () => {
    const store = await newApp();
    await store.init();
    const saved = savedPayload();
    for (const handle of ["@@demo", "Demo", "demo name", "demo.name", "@"]) {
      expect(() => store.saveProfile({ ...profiles[0], handle })).toThrow("Invalid profile handle");
    }
    const privatePost = { ...postInput, heartRate: 120, weightKg: 68 };
    expect(() => store.createPost(privatePost)).toThrow("forbidden keys");
    expect(() => store.saveResult({ ...results[0], completed: false, totalPoints: 10 })).toThrow("quit-early");
    expect(savedPayload()).toBe(saved);

    storage.setItem.mockImplementationOnce(() => { throw new DOMException("Storage is full", "QuotaExceededError"); });
    expect(() => store.createPost(postInput)).toThrow("Storage is full");
    expect(store.listFeed()).toHaveLength(posts.length);
    expect(savedPayload()).toBe(saved);

    const group = groups.find((candidate) => profiles.some(({ id }) => !candidate.memberIds.includes(id)))!;
    const player = profiles.find(({ id }) => !group.memberIds.includes(id))!;
    storage.setItem.mockImplementationOnce(() => { throw new DOMException("Storage is full", "QuotaExceededError"); });
    expect(() => store.joinGroup(group.id, player.id)).toThrow("Storage is full");
    expect(store.listProfiles()).toEqual(profiles);
    expect(store.listGroups()).toEqual(groups);
    expect(savedPayload()).toBe(saved);

    expect(store.createPost(postInput)).toMatchObject(postInput);
    expect(store.listFeed()).toHaveLength(posts.length + 1);
  });

  it("keeps persisted changes from another app instance when writing", async () => {
    const first = await newApp();
    await first.init();
    const second = await newApp();
    await second.init();
    first.setActiveProfile(profiles[1].id);
    second.saveProfile({ ...profiles[0], displayName: "Updated in another tab" });
    expect(second.getActiveProfile()).toEqual(profiles[1]);
    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.getActiveProfile()).toEqual(profiles[1]);
    expect(reloaded.listProfiles().find(({ id }) => id === profiles[0].id)?.displayName).toBe("Updated in another tab");
  });
});
