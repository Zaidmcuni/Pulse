/**
 * Owner: Mohamed
 * Purpose: render tests for the public dancer profile (/u/:playerId), including FR-02 privacy
 * FRs: FR-39, FR-41, FR-02
 */

import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { assertFeedPost } from "../../contracts/validators";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { FeedPost, Group, PlayerProfile, SessionResult } from "../../types/pulse";
import DancerProfile from "./DancerProfile.tsx"; // explicit: "./DancerProfile" resolves to dancerProfile.ts on case-insensitive disks

afterEach(() => vi.restoreAllMocks());

const viewer: PlayerProfile = {
  id: "player-amira", handle: "amira", displayName: "Amira", age: 29, sex: "female",
  weightKg: 60, heightCm: 165, restingHr: 65, mode: "standing", groupIds: ["g-afro"],
};
const theo: PlayerProfile = {
  id: "player-theo", handle: "theo.moves", displayName: "Theo", age: 37, sex: "male",
  weightKg: 88, heightCm: 191, restingHr: 61, hrMaxOverride: 177, mode: "seated", groupIds: ["g-afro", "g-zumba"],
};
const groups: Group[] = [
  { id: "g-zumba", name: "Zumba Crew", kind: "dance_type", memberIds: ["player-theo"], groupDanceIds: [] },
  { id: "g-afro", name: "Afro Beats", kind: "friends", memberIds: ["player-theo", "player-amira"], groupDanceIds: [] },
];

function result(id: string, totalPoints: number, createdAtIso: string): SessionResult {
  return { ...FAKE_RESULT, id, playerId: theo.id, totalPoints, caloriesKcal: 333, createdAtIso };
}

function setup(posts: FeedPost[] = []): void {
  posts.forEach(assertFeedPost);
  const results = [result("r-now", 400, new Date().toISOString()), result("r-old", 220, "2020-01-06T12:00:00.000Z")];
  vi.spyOn(store, "getActiveProfile").mockReturnValue(viewer);
  vi.spyOn(store, "listProfiles").mockReturnValue([viewer, theo]);
  vi.spyOn(store, "listResults").mockReturnValue(results);
  vi.spyOn(store, "listGroups").mockReturnValue(groups);
  vi.spyOn(store, "listBadges").mockReturnValue([
    { badgeId: "podium", playerId: theo.id, earnedAtIso: "2026-11-18T12:00:00.000Z" },
    { badgeId: "first_steps", playerId: theo.id, earnedAtIso: "2026-11-17T12:00:00.000Z" },
  ]);
  vi.spyOn(store, "listFeed").mockReturnValue(posts);
  vi.spyOn(store, "getResult").mockImplementation((id) => results.find((entry) => entry.id === id));
  vi.spyOn(store, "getDance").mockReturnValue(FAKE_DANCE);
}

function render(path: string): string {
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <Routes><Route path="/u/:playerId" element={<DancerProfile />} /></Routes>
    </StaticRouter>,
  );
}

const visibleText = (html: string): string => html.replace(/<[^>]*>/g, " ");

it("shows another dancer's name, handle, mode, stats, groups, badges and posts", () => {
  setup([{ id: "post-1", authorId: theo.id, resultId: "r-now", showCalories: false, hasClip: false, groupIds: [], kudosBy: [], createdAtIso: "2026-11-19T12:00:00.000Z" }]);
  const html = render("/u/player-theo");
  expect(html).toContain("Theo");
  expect(html).toContain("@theo.moves");
  expect(html).toContain('<span class="badge">Seated</span>');
  expect(html).toContain("<dt>Points this week</dt><dd>400</dd>");
  expect(html).toContain("<dt>Total points</dt><dd>620</dd>");
  expect(html).toContain("<dt>Dances completed</dt><dd>2</dd>");
  expect(html).toContain(">Groups</h2>");
  expect(html.indexOf("Afro Beats")).toBeLessThan(html.indexOf("Zumba Crew"));
  expect(html).toContain('href="/groups/g-zumba"');
  expect(html).toContain(">Badges</h2>");
  expect(html).toContain('href="/u/player-theo/badges"');
  expect(html.indexOf("First Steps")).toBeLessThan(html.indexOf("Podium"));
  expect(html).toContain(">Posts</h2>");
  expect(html.match(/<article/g)).toHaveLength(1);
});

it("marks groups the viewer shares", () => {
  setup();
  const html = render("/u/player-theo");
  expect(html.match(/✓ You&#x27;re in this too|✓ You're in this too/g)).toHaveLength(1);
  expect(html).toContain("No posts yet.");
});

it("shows a friendly not-found card for an unknown dancer", () => {
  setup();
  const html = render("/u/nobody");
  expect(html).toContain("Dancer not found");
  expect(html).toContain('href="/feed"');
  expect(html).toContain("Back to the feed");
});

it("does not render the viewer's own page here (redirects to /me)", () => {
  setup();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  expect(render("/u/player-amira")).not.toContain("Amira");
});

it("never shows body stats, heart rate, email or unposted calories (FR-02)", () => {
  setup();
  const text = visibleText(render("/u/player-theo"));
  for (const secret of ["37", "88", "191", "61", "177", "333", "@pulse.demo"]) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/kcal|heart rate|weight|height|male/i);
});
