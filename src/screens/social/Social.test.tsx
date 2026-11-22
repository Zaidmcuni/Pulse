/**
 * Owner: Ali
 * Purpose: Verify feed and profile presentation, post privacy, and missing-data states.
 * FRs: FR-39, FR-40, FR-41
 * Edited: Mohamed (task 17, ProfilePage now needs a router for the badges link)
 * Edited: Mohamed (task 18, feed author names link to profiles, so the feed needs a router)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { assertFeedPost } from "../../contracts/validators";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { FAKE_RESULT, FAKE_RESULT_QUIT } from "../../mocks/fakeSession";
import type { FeedPost } from "../../types/pulse";
import Feed from "./Feed";
import ProfilePage from "./ProfilePage";

afterEach(() => vi.restoreAllMocks());

function fixtures(): void {
  const demo = store.getActiveProfile()!;
  const other = { ...demo, id: "other", displayName: "Other dancer", handle: "amira-steps" };
  const own = { ...FAKE_RESULT, id: "own", playerId: demo.id, caloriesKcal: 19.7 };
  const shared = { ...FAKE_RESULT, id: "shared", playerId: other.id, caloriesKcal: 21.3 };
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

it("renders newest first, respects calorie privacy, and marks existing kudos", () => {
  fixtures();
  const html = renderToStaticMarkup(<StaticRouter location="/feed"><Feed /></StaticRouter>);
  expect(html).toContain('href="/u/other"');
  expect(html.indexOf("@amira-steps")).toBeLessThan(html.indexOf("@demo"));
  expect(html).not.toContain("@@demo");
  expect(html).toContain(FAKE_DANCE.title);
  expect(html).toContain("21.3 kcal estimated");
  expect(html).not.toMatch(/19\.7 kcal|heart rate|weight|height/i);
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
  expect(html).not.toMatch(/Other dancer|21\.3 kcal/);
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
