/**
 * Owner: Ali
 * Purpose: Verify browser store initialization, persistence, and data boundaries.
 * FR: FR-51
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import badgeFixtures from "../../public/seed/badges.json";
import groupFixtures from "../../public/seed/groups.json";
import meetupFixtures from "../../public/seed/meetups.json";
import postFixtures from "../../public/seed/posts.json";
import profileFixtures from "../../public/seed/profiles.json";
import resultFixtures from "../../public/seed/results.json";
import { assertFeedPost, assertSessionResult, parseDance } from "../contracts/validators";
import tipToe from "../../public/dances/dance4.json";
import { createDanceSession } from "../scoring/session";
import { createSimulatedMonitor } from "../hr/heartRate";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { perfMs, songMs, type EarnedBadge, type FeedPost, type Group, type Meetup, type PlayerProfile, type SessionResult } from "../types/pulse";

const profiles = profileFixtures as PlayerProfile[];
const results = resultFixtures as SessionResult[];
const posts: FeedPost[] = postFixtures;
const groups = groupFixtures as Group[];
const meetups: Meetup[] = meetupFixtures;
const seedBadgesFor = (playerId: string) => badgeFixtures.filter((badge) => badge.playerId === playerId);
const assets = new Map<string, unknown>([
  ["/seed/profiles.json", profiles], ["/seed/results.json", results], ["/seed/posts.json", posts],
  ["/seed/groups.json", groups], ["/seed/meetups.json", meetups], ["/seed/badges.json", badgeFixtures], ["/dances/index.json", []],
]);
const postInput = {
  authorId: posts[0].authorId, resultId: posts[0].resultId, groupIds: posts[0].groupIds,
  showCalories: true, hasClip: false,
};

let files: Map<string, unknown>;
let stored: Map<string, string>;
const storage = {
  get length() { return stored.size; },
  key: (index: number) => [...stored.keys()][index] ?? null,
  removeItem: (key: string) => { stored.delete(key); },
  getItem: vi.fn((key: string) => stored.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { stored.set(key, value); }),
};
// A RawBody is served as-is, so tests can return malformed JSON.
class RawBody { constructor(readonly text: string) {} }
const fetchAsset = vi.fn(async (path: string) => {
  if (!files.has(path)) return new Response(null, { status: 404 });
  const body = files.get(path);
  return body instanceof RawBody ? new Response(body.text) : Response.json(body);
});

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
    expect(store.listBadges(profiles[0].id)).toEqual(seedBadgesFor(profiles[0].id));
    expect(store.listDances()).toEqual([]);
    expect(store.getDance("missing")).toBeUndefined();
    expect(store.getResult("missing")).toBeUndefined();
    expect(fetchedPaths().sort()).toEqual([...assets.keys()].sort());
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const saved = savedPayload();

    fetchAsset.mockClear();
    const reloaded = await newApp();
    await reloaded.init();
    expect(fetchedPaths().sort()).toEqual([...assets.keys()].sort());
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
      "activeId", "badges", "groups", "meetups", "posts", "profiles", "resetSeed", "results",
    ]);
    expect(savedPayload()).not.toContain('"frames"');
    expect(savedPayload()).not.toContain(FAKE_DANCE.audioUrl);
    fetchAsset.mockClear();
    const reloaded = await newApp();
    await reloaded.init();
    expect(fetchedPaths().sort()).toEqual([...assets.keys(), `/dances/${FAKE_DANCE.id}.json`].sort());
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

  // NFR-06: one broken dance file hides only that dance instead of blocking startup.
  it.each([
    ["fails validation", { ...FAKE_DANCE, id: "broken", frames: [] }, "frames empty"],
    ["is missing", undefined, "HTTP 404"],
    ["is malformed JSON", new RawBody("{not json"), "JSON"],
    ["has a mismatched id", { ...FAKE_DANCE, id: "other" }, "does not match catalogue entry broken"],
  ])("skips a dance file that %s, keeps the others in order, and leaves saved data intact", async (_case, body, reason) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = await newApp();
    await store.init();
    store.setActiveProfile(profiles[1].id);
    const saved = savedPayload();
    const second = { ...FAKE_DANCE, id: "second", title: "Second" };
    files.set("/dances/index.json", [FAKE_DANCE.id, "broken", second.id]);
    files.set(`/dances/${FAKE_DANCE.id}.json`, FAKE_DANCE);
    files.set(`/dances/${second.id}.json`, second);
    if (body !== undefined) files.set("/dances/broken.json", body);

    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.listDances()).toEqual([FAKE_DANCE, second]);
    expect(reloaded.getDance("broken")).toBeUndefined();
    expect(reloaded.getActiveProfile()).toEqual(profiles[1]);
    expect(savedPayload()).toBe(saved);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Skipping dance broken:");
    expect(warn.mock.calls[0][0]).toContain(reason);
    warn.mockRestore();
  });

  it.each([
    ["is missing", undefined, "/dances/index.json (HTTP 404)"],
    ["is not an array", { ids: [FAKE_DANCE.id] }, "Expected an array in /dances/index.json"],
    ["lists an invalid id", [FAKE_DANCE.id, ""], "Invalid dance ID in /dances/index.json"],
  ])("still blocks startup when the dance index %s", async (_case, index, error) => {
    files.set(`/dances/${FAKE_DANCE.id}.json`, FAKE_DANCE);
    if (index === undefined) files.delete("/dances/index.json");
    else files.set("/dances/index.json", index);
    const store = await newApp();
    await expect(store.init()).rejects.toThrow(error);
    expect(stored.size).toBe(0);
    expect(store.listDances()).toEqual([]);
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
  it("restores the original seed in one write without modifying the catalogue or unrelated storage", async () => {
    files.set("/dances/index.json", [FAKE_DANCE.id]);
    files.set(`/dances/${FAKE_DANCE.id}.json`, FAKE_DANCE);
    const store = await newApp();
    await store.init();
    const seed = JSON.parse(savedPayload());
    const profile = profiles[1];
    store.saveProfile({ ...profile, displayName: "Local dancer" });
    store.setActiveProfile(profile.id);
    store.saveResult({ ...results[0], id: "local-result" });
    const post = store.createPost(postInput);
    store.toggleKudos(post.id, profile.id);
    store.leaveGroup(profile.groupIds[0], profile.id);
    store.toggleRsvp(meetups[0].id, profile.id);
    store.awardBadge({ badgeId: "superstar", playerId: profile.id, earnedAtIso: "2026-11-21T12:00:00Z" });
    stored.set("pulse:store:highlight:local-result", "local clip");
    stored.set("pulse:store:highlight:another-result", "another clip");
    stored.set("unrelated", "keep me");
    const { getHighlightClip, saveHighlightClip } = await import("../clip/highlightStore");
    saveHighlightClip({
      resultId: "transient-res",
      danceId: "dance-1",
      videoBlob: null,
      videoStartSongMs: 0,
      overlaySamples: [],
      poseSamples: [],
      showLandmarks: false,
    });
    expect(getHighlightClip("transient-res")).toBeDefined();
    const writesBefore = storage.setItem.mock.calls.length;
    const requestsBefore = fetchAsset.mock.calls.length;

    await store.resetDemo();

    expect(storage.setItem).toHaveBeenCalledTimes(writesBefore + 1);
    expect(fetchedPaths().slice(requestsBefore).sort()).toEqual([...assets.keys()].filter((path) => path.startsWith("/seed/")).sort());
    expect(stored.get("unrelated")).toBe("keep me");
    expect([...stored.keys()].some((key) => key.startsWith("pulse:store:highlight:"))).toBe(false);
    expect(getHighlightClip("transient-res")).toBeUndefined();
    expect(JSON.parse(stored.get("pulse:store")!)).toEqual({ ...seed, activeId: profile.id });
    expect(store.getActiveProfile()).toEqual(profile);
    expect(store.listBadges(profiles[0].id)).toEqual(seedBadgesFor(profiles[0].id));
    expect(store.getResult("local-result")).toBeUndefined();
    expect(store.listDances()).toEqual([FAKE_DANCE]);
    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.listGroups()).toEqual(groups);
    expect(reloaded.listFeed()).toEqual(store.listFeed());
  });

  it("adds the reset baseline to older saves without replacing their user data", async () => {
    const store = await newApp();
    await store.init();
    const local = { ...profiles[1], displayName: "Older local profile" };
    store.saveProfile(local);
    store.setActiveProfile(local.id);
    const [key] = stored.keys();
    const snapshot = JSON.parse(savedPayload());
    delete snapshot.resetSeed;
    stored.set(key, JSON.stringify(snapshot));

    fetchAsset.mockClear();
    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.getActiveProfile()).toEqual(local);
    expect(fetchedPaths()).toContain("/seed/profiles.json");
    await reloaded.resetDemo();
    expect(reloaded.getActiveProfile()).toEqual(profiles[1]);
  });

  it("updates changed seeds on a reload and on reset while keeping the signed-in profile", async () => {
    const store = await newApp();
    await store.init();
    const editedProfile = { ...profiles[1], displayName: "My local name" };
    store.saveProfile(editedProfile);
    const localResult = { ...results[0], id: "local-result" };
    store.saveResult(localResult);
    files.set("/seed/results.json", [{ ...results[0], totalPoints: 1500 }, ...results.slice(1)]);

    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.getResult(results[0].id)?.totalPoints).toBe(1500);
    expect(reloaded.getResult(localResult.id)).toEqual(localResult);
    expect(reloaded.listProfiles()).toContainEqual(editedProfile);

    const { accounts, DEMO_PASSWORD, emailForHandle } = await import("../auth/accounts");
    await accounts.logIn(emailForHandle(editedProfile.handle), DEMO_PASSWORD);
    files.set("/seed/results.json", [{ ...results[0], totalPoints: 1700 }, ...results.slice(1)]);
    await reloaded.resetDemo(accounts.signedInProfileId()!);
    expect(reloaded.getResult(results[0].id)?.totalPoints).toBe(1700);
    expect(reloaded.getResult(localResult.id)).toBeUndefined();
    expect(accounts.signedInProfileId()).toBe(profiles[1].id);
    expect(reloaded.getActiveProfile()).toEqual(profiles[1]);
  });

  it("retains local joins and leaves when the seed changes group membership", async () => {
    const store = await newApp();
    await store.init();
    const group = groups[0];
    const leavingId = group.memberIds[0];
    const [joining, seeded] = profiles.filter(({ id }) => !group.memberIds.includes(id));
    store.leaveGroup(group.id, leavingId);
    store.joinGroup(group.id, joining.id);

    files.set("/seed/profiles.json", profiles.map((profile) => profile.id === seeded.id
      ? { ...profile, groupIds: [...profile.groupIds, group.id] }
      : profile));
    files.set("/seed/groups.json", [{ ...group, memberIds: [...group.memberIds, seeded.id] }, ...groups.slice(1)]);
    const reloaded = await newApp();
    await reloaded.init();

    const members = reloaded.listGroups().find(({ id }) => id === group.id)!.memberIds;
    expect(members).toContain(joining.id);
    expect(members).toContain(seeded.id);
    expect(members).not.toContain(leavingId);
    expect([...members].sort()).toEqual(reloaded.listProfiles()
      .filter(({ groupIds }) => groupIds.includes(group.id)).map(({ id }) => id).sort());
  });

  it("keeps a registered profile and its login through reset", async () => {
    const store = await newApp();
    await store.init();
    const { accounts } = await import("../auth/accounts");
    const profile = { ...profiles[1], id: "registered", handle: "registered" };
    await accounts.signUp(profile, "registered@example.com", "secret-pass");
    await store.resetDemo(accounts.signedInProfileId()!);

    expect(store.getActiveProfile()).toEqual({ ...profile, groupIds: [] });
    expect(accounts.signedInProfileId()).toBe(profile.id);
    accounts.logOut();
    expect(await accounts.logIn("registered@example.com", "secret-pass")).toBe("ok");
  });

  it("keeps current data visible and persisted after a reset write fails", async () => {
    const store = await newApp();
    await store.init();
    store.setActiveProfile(profiles[1].id);
    const snapshot = savedPayload();
    storage.setItem.mockImplementationOnce(() => { throw new DOMException("Storage is full", "QuotaExceededError"); });

    await expect(store.resetDemo()).rejects.toThrow("Storage is full");
    expect(store.getActiveProfile()).toEqual(profiles[1]);
    expect(savedPayload()).toBe(snapshot);
  });


  it("saves results and newly earned club badges together, and does not duplicate badges", async () => {
    const store = await newApp();
    await store.init();
    const result: SessionResult = {
      ...results[0], id: "new-badge-result", danceId: "solo", totalPoints: 10000,
      createdAtIso: "2026-11-21T12:00:00Z",
    };
    const original = store.listBadges(result.playerId);
    storage.setItem.mockImplementationOnce(() => { throw new DOMException("Storage is full", "QuotaExceededError"); });

    expect(() => store.saveResult(result)).toThrow("Storage is full");
    expect(store.getResult(result.id)).toBeUndefined();
    expect(store.listBadges(result.playerId)).toEqual(original);

    store.saveResult(result);
    store.saveResult(result);
    const reloaded = await newApp();
    await reloaded.init();
    expect(reloaded.getResult(result.id)).toEqual(result);
    expect(reloaded.listBadges(result.playerId)).toEqual([
      ...original,
      ...(["5k_club", "10k_club"] as const)
        .map((badgeId) => ({ badgeId, playerId: result.playerId, earnedAtIso: result.createdAtIso })),
    ]);
  });

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
    const badge: EarnedBadge = { badgeId: "10k_club", playerId: player.id, earnedAtIso: "2026-11-21T12:00:00Z" };

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
    expect(reloaded.listBadges(player.id)).toEqual([...seedBadgesFor(player.id), badge]);
    expect(reloaded.listGroups().find(({ id }) => id === group.id)?.memberIds).toEqual([...group.memberIds, player.id]);
    expect(reloaded.listProfiles().find(({ id }) => id === player.id)?.groupIds).toEqual([...player.groupIds, group.id]);

    reloaded.leaveGroup(group.id, player.id);
    const afterLeaving = await newApp();
    await afterLeaving.init();
    expect(afterLeaving.listGroups().find(({ id }) => id === group.id)?.memberIds).toEqual(group.memberIds);
    expect(afterLeaving.listProfiles().find(({ id }) => id === player.id)?.groupIds).toEqual(player.groupIds);
    expect(afterLeaving.listBadges(player.id)).toEqual([...seedBadgesFor(player.id), badge]);
  });

  it("ranks a new group member's full Tip Toe run alongside the full-length fixtures", async () => {
    vi.useFakeTimers();
    const monitor = createSimulatedMonitor();
    try {
      vi.setSystemTime(new Date(2026, 10, 21, 12));
      const store = await newApp();
      await store.init();
      const groupId = "montreal-dancers";
      const dance = parseDance(tipToe);
      expect(results.every(({ durationSec, samples }) =>
        durationSec === Math.floor(dance.lengthSec) && samples.length === durationSec)).toBe(true);

      const profile = { ...profiles[1], id: "new-dancer", handle: "new-dancer", groupIds: [] };
      store.saveProfile(profile);
      store.joinGroup(groupId, profile.id);
      const session = createDanceSession(dance, profile);
      monitor.subscribe((reading) => session.addHeartRate(reading));
      await monitor.connect();
      for (let sec = 1; sec <= dance.lengthSec; sec++) {
        vi.advanceTimersByTime(1000);
        const time = songMs(sec * 1000);
        session.addFrameScore(time, 0.75);
        session.advance(time, perfMs(performance.now()));
      }
      const result = session.finish({ id: "live-run", completed: true, createdAtIso: new Date().toISOString() });
      store.saveResult(result);
      const ranking = store.weeklyLeaderboard(groupId, dance.id);
      expect(ranking).toContainEqual({ playerId: profile.id, points: result.totalPoints });
      expect(ranking[0].points).toBeGreaterThan(result.totalPoints);
      expect(ranking.at(-1)!.points).toBeLessThan(result.totalPoints);
      expect(store.weeklyLeaderboard(groupId, "unfeatured-dance")).toEqual([]);
      expect(store.weeklyLeaderboard("missing-group", dance.id)).toEqual([]);
      store.leaveGroup(groupId, profile.id);
      expect(store.weeklyLeaderboard(groupId, dance.id)).toEqual(ranking.filter(({ playerId }) => playerId !== profile.id));
    } finally {
      monitor.disconnect();
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

  it("keeps each tab's selected profile through shared writes and resets", async () => {
    const first = await newApp();
    await first.init();
    first.setActiveProfile(profiles[1].id);
    const second = await newApp();
    await second.init();
    second.setActiveProfile(profiles[2].id);

    first.toggleKudos(posts[0].id, profiles[1].id);
    expect(first.getActiveProfile()).toEqual(profiles[1]);
    await first.resetDemo(profiles[1].id);
    second.toggleKudos(posts[0].id, profiles[2].id);
    expect(second.getActiveProfile()).toEqual(profiles[2]);
    expect(first.getActiveProfile()).toEqual(profiles[1]);
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


it("persists only the selected silhouette and boundary frames by result ID", async () => {
  const { getResultHighlight, saveResultHighlight } = await import("./store");
  const sampleAt = (time: number) => ({
    tSongMs: songMs(time),
    points: Array.from({ length: 12 }, () => ({ x: 0, y: 0, v: 1 })),
  });
  const result = { ...results[0], id: "clip-result", completed: true, bestWindowStartSec: 15 };
  const samples = [0, 14800, 14900, 15000, 20000, 29800, 30000, 30100, 30200].map(sampleAt);
  saveResultHighlight(result, 30, samples);
  const highlight = getResultHighlight(result.id);
  expect(highlight).toEqual({ startSec: 15, durationSec: 15, samples: samples.slice(2, 8) });
  expect(getResultHighlight("missing")).toBeUndefined();

  saveResultHighlight({ ...result, id: "short" }, 2.5, [sampleAt(0), sampleAt(2400)]);
  expect(getResultHighlight("short")).toMatchObject({ startSec: 0, durationSec: 2.5 });
  saveResultHighlight({ ...result, id: "quit", completed: false }, 30, samples);
  expect(getResultHighlight("quit")).toBeUndefined();
});
