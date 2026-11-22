/**
 * Owner: Ali
 * Purpose: Verify feed and profile presentation, post privacy, and missing-data states.
 * FRs: FR-39, FR-40, FR-41
 * Edited: Mohamed (task 17, ProfilePage now needs a router for the badges link)
 * Edited: Mohamed (task 18, feed author names link to profiles, so the feed needs a router)
 * Edited: Mohamed (task 22, the private Today ring shows kcal, so the no-kcal check covers the posts only)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { clearHighlightClips, saveHighlightClip } from "../../clip/highlightStore";
import { assertFeedPost } from "../../contracts/validators";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../../mocks/fakeSession";
import { songMs, type FeedPost } from "../../types/pulse";
import Feed from "./Feed";
import ProfilePage from "./ProfilePage";

afterEach(() => {
  clearHighlightClips();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fixtures(): void {
  const demo = store.getActiveProfile()!;
  const other = {
    ...demo, id: "other", displayName: "Other dancer", handle: "amira-steps",
    age: 91, sex: "female" as const, weightKg: 131.37, heightCm: 193.47, restingHr: 44, hrMaxOverride: 198,
  };
  const own = { ...FAKE_RESULT, id: "own", playerId: demo.id, caloriesKcal: 19.7 };
  const shared = {
    ...FAKE_RESULT, id: "shared", playerId: other.id, caloriesKcal: 21.3, accuracyPct: 91.4, durationSec: 186,
  };
  const posts: FeedPost[] = [
    { id: "new", authorId: other.id, resultId: shared.id, showCalories: true, hasClip: false, groupIds: [], kudosBy: [], createdAtIso: "2026-11-21T12:00:00Z" },
    { id: "old", authorId: demo.id, resultId: own.id, showCalories: false, hasClip: false, groupIds: [], kudosBy: [demo.id], createdAtIso: "2026-11-20T12:00:00Z" },
  ];
  posts.forEach(assertFeedPost);
  vi.spyOn(store, "listFeed").mockReturnValue(posts);
  vi.spyOn(store, "listProfiles").mockReturnValue([demo, other]);
  vi.spyOn(store, "getResult").mockImplementation((id) => [own, shared].find((result) => result.id === id));
  vi.spyOn(store, "getDance").mockReturnValue(FAKE_DANCE);
  vi.spyOn(store, "listResults").mockReturnValue([own, FAKE_RESULT_QUIT]);
  vi.spyOn(store, "listBadges").mockReturnValue([{ badgeId: "first_steps", playerId: demo.id, earnedAtIso: "2026-11-20T12:00:00Z" }]);
}

it("renders recent timestamps, accuracy and duration, and respects post privacy", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 21, 14, 5));
  fixtures();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  const posts = store.listFeed();
  posts[0].createdAtIso = today.toISOString();
  posts[1].createdAtIso = yesterday.toISOString();
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain('href="/u/other"');
  expect(html.indexOf("@amira-steps")).toBeLessThan(html.indexOf("@demo"));
  expect(html).not.toContain("@@demo");
  expect(html).toContain(FAKE_DANCE.title);
  expect(html).toContain(FAKE_DANCE.artist!);
  expect(html).toContain(`dateTime="${today.toISOString()}"`);
  expect(html).toContain(">2 h ago</time>");
  expect(html).toContain(`dateTime="${yesterday.toISOString()}"`);
  expect(html).toContain(">Yesterday</time>");
  expect(html).toContain("91.4% accuracy");
  expect(html).toContain("3:06 duration");
  expect(html).toContain("21.3 kcal estimated");
  expect(html).not.toMatch(/19\.7 kcal|heart rate|weight|height|131\.37|193\.47|female|198 bpm|44 bpm|91 years/i);
  expect(html).toMatch(/aria-pressed="true">Kudos 1<\/button>/);
  expect(html).toMatch(/aria-pressed="false">Kudos 0<\/button>/);
});

it("shows the active dancer's completed totals, stored badges, and own posts", () => {
  fixtures();
  const html = renderToStaticMarkup(<StaticRouter location="/me"><ProfilePage /></StaticRouter>);
  expect(html).toContain("@demo");
  expect(html).toContain("<dt>Total points</dt><dd>842</dd>");
  expect(html).toContain("<dt>Completed dances</dt><dd>1</dd>");
  expect(html).toContain("First Steps");
  expect(html.match(/<article/g)).toHaveLength(1);
  expect(html).toContain('dateTime="2026-11-20T12:00:00.000Z"');
  expect(html).toContain("78% accuracy");
  expect(html).toContain("0:20 duration");
  expect(html).not.toContain("Other dancer");
  expect(html.slice(html.indexOf('id="profile-posts-title"'))).not.toContain("kcal"); // own posts never show calories
});

it.each([
  [0, "Just now"],
  [59, "59 min ago"],
  [60, "1 h ago"],
  [60 * 24 * 2, "2 d ago"],
])("formats a post from %i minutes ago as %s", (elapsed, expected) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 21, 14));
  fixtures();
  store.listFeed()[0].createdAtIso = new Date(Date.now() - elapsed * 60_000).toISOString();
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain(`>${expected}</time>`);
});

it("handles an invalid timestamp and displays an absolute time for a future post", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
  fixtures();
  const posts = store.listFeed();
  posts[0].createdAtIso = "invalid";
  posts[1].createdAtIso = "2026-11-22T12:00:00Z";
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain("Time unavailable");
  expect(html).toMatch(/dateTime="2026-11-22T12:00:00.000Z" title="([^"]+)">\1<\/time>/);
  expect(html.match(/<time/g)).toHaveLength(1);
});

it.each([
  undefined,
  { ...FAKE_RESULT_QUIT, playerId: "other" },
  { ...FAKE_RESULT, playerId: "another-dancer" },
])("preserves the post but hides metrics when its result cannot be shared", (result) => {
  fixtures();
  vi.mocked(store.listFeed).mockReturnValue([store.listFeed()[0]]);
  vi.mocked(store.getResult).mockReturnValue(result);
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain("Dance session");
  expect(html).toContain('dateTime="2026-11-21T12:00:00.000Z"');
  expect(html).not.toMatch(/accuracy|duration|points|kcal/);
});

it("shows zero metrics and omits invalid metrics", () => {
  fixtures();
  vi.mocked(store.getResult).mockImplementation((id) => id === "shared"
    ? { ...FAKE_RESULT, playerId: "other", accuracyPct: 0, durationSec: 0 }
    : { ...FAKE_RESULT, accuracyPct: NaN, durationSec: NaN });
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain("0% accuracy");
  expect(html).toContain("0:00 duration");
  expect(html).not.toContain("NaN");
});

it("handles missing catalog data and renders helpful empty states", () => {
  fixtures();
  vi.mocked(store.getDance).mockReturnValue(undefined);
  expect(renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>)).toContain("Dance session");
  vi.mocked(store.listFeed).mockReturnValue([]);
  expect(renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>)).toContain("Your feed is empty");
  vi.spyOn(store, "getActiveProfile").mockReturnValue(null);
  expect(renderToStaticMarkup(<StaticRouter location="/me"><ProfilePage /></StaticRouter>)).toMatch(/href="\/profile\/setup"/);
});

it("explains the effect of the reset action on the profile", () => {
  fixtures();
  const html = renderToStaticMarkup(<StaticRouter location="/me"><ProfilePage /></StaticRouter>);
  expect(html).toContain("Resetting restores the current demo data and clears local activity.");
  expect(html).toContain("Your registered account and profile are kept.");
  expect(html).toContain(">Reset demo data</button>");
});

it("renders feed post cover art when coverUrl exists and clean fallback without dangling separator when omitted", () => {
  fixtures();
  vi.mocked(store.getDance).mockReturnValue({ ...FAKE_DANCE, coverUrl: "/dances/dance1.jpg" });
  const coverHtml = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(coverHtml).toContain('src="/dances/dance1.jpg"');

  const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
  vi.mocked(store.getDance).mockReturnValue(noArtistDance);
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain(`<h2 class="social-post-title">${FAKE_DANCE.title}</h2>`);
  expect(html).not.toContain("social-post-artist");
  expect(html).not.toContain("<img");
  expect(html).toContain("♪");
  expect(html).not.toContain("undefined");
});

it("renders Watch highlight on feed posts with hasClip: true both with in-memory highlight and in silhouette fallback mode", () => {
  fixtures();
  const posts = store.listFeed();
  posts[0].hasClip = true;
  posts[1].hasClip = true;

  // 1. In-memory highlight present for posts[0].resultId ("shared")
  saveHighlightClip({
    resultId: "shared",
    danceId: FAKE_DANCE.id,
    videoBlob: null,
    videoStartSongMs: 0,
    overlaySamples: [],
    poseSamples: [{ tSongMs: songMs(4000), points: Array.from({ length: 12 }, () => ({ x: 0, y: 0, v: 0.9 })) }],
    showLandmarks: true,
  });

  // 2. posts[1].resultId ("own") has no in-memory video (simulates seeded/reloaded post)
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html.match(/<summary>Watch highlight<\/summary>/g)).toHaveLength(2);
});

it("draws an aria-hidden pulse line and no song-initial watermark on each post", () => {
  fixtures();
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).not.toContain("social-post-mark");
  expect(html.match(/<svg class="social-post-pulse"[^>]*aria-hidden="true"/g)).toHaveLength(2);
});
