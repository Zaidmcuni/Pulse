/**
 * Owner: Mohamed
 * Purpose: Badges page: own and other dancer views, unknown dancer, detail view, privacy, profile link.
 * FRs: FR-46, FR-02, NFR-10
 */

import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { store } from "../data/store";
import { FAKE_RESULT } from "../mocks/fakeSession";
import ProfilePage from "../screens/social/ProfilePage";
import type { PlayerProfile } from "../types/pulse";
import BadgesPage from "./BadgesPage";

let demo: PlayerProfile;
let other: PlayerProfile;

beforeEach(() => {
  demo = store.getActiveProfile()!;
  other = { ...demo, id: "player-x", displayName: "Zoë Park", handle: "zoe@dance.example", age: 37, weightKg: 88 };
  vi.spyOn(store, "listProfiles").mockReturnValue([demo, other]);
  vi.spyOn(store, "listResults").mockReturnValue([]);
  vi.spyOn(store, "listGroups").mockReturnValue([]);
  vi.spyOn(store, "listBadges").mockImplementation((playerId) =>
    playerId === demo.id ? [{ badgeId: "first_steps", playerId, earnedAtIso: "2026-11-20T12:00:00Z" }] : []);
});

afterEach(() => vi.restoreAllMocks());

function render(path: string): string {
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <Routes>
        <Route path="/badges" element={<BadgesPage />} />
        <Route path="/u/:playerId/badges" element={<BadgesPage />} />
        <Route path="/me" element={<ProfilePage />} />
      </Routes>
    </StaticRouter>,
  );
}

const visibleText = (html: string): string => html.replace(/<[^>]*>/g, " ");

it("shows your badges with earned and locked tiles by family", () => {
  const html = render("/badges");
  expect(html).toContain("Your badges");
  expect(html).toContain('href="/me"');
  expect(html).toContain("← Profile");
  expect(visibleText(html)).toMatch(/1\s+of\s+9\s+earned/);
  for (const title of ["Milestones", "Points clubs", "Crew"]) expect(html).toContain(title);
  expect(html).toContain("First Steps");
  expect(html).toContain("Earned Nov 20");
  expect(html).toContain('aria-label="First Steps badge, earned"');
  expect(html).toContain('aria-label="1K Club badge, locked"');
  expect(html).toContain("0 / 1,000 points");
  expect(html).toContain("0 / 3 days in a row");
  expect(html).toContain("Not yet");
});

it("shows another dancer's badges without the profile link", () => {
  const html = render("/u/player-x/badges");
  expect(html).toContain("Zoë Park&#x27;s badges");
  expect(html).toContain("@zoe@dance.example");
  expect(html).not.toContain("← Profile");
  expect(visibleText(html)).toMatch(/0\s+of\s+9\s+earned/);
});

it("says when the dancer doesn't exist", () => {
  const html = render("/u/nobody/badges");
  expect(html).toContain("Dancer not found");
  expect(html).toContain('href="/feed"');
});

it("opens the detail view from the URL instead of the grid", () => {
  const html = render("/badges?badge=1k_club");
  expect(html).toContain("How to earn");
  expect(html).toContain("Earn 1,000 points in total.");
  expect(html).toContain("Points clubs · Bronze");
  expect(html).toContain("0 / 1,000 points");
  expect(html).toContain("Dance to start this one.");
  expect(html).toContain("← All badges");
  expect(html).not.toContain("badges-grid");
  expect(html).not.toContain("Your badges");
});

it("encourages progress on a started locked badge and dates an earned one", () => {
  vi.mocked(store.listResults).mockReturnValue([{ ...FAKE_RESULT, playerId: demo.id, completed: true, totalPoints: 620 }]);
  const started = render("/badges?badge=1k_club");
  expect(started).toContain("620 / 1,000 points");
  expect(started).toContain("Keep dancing, you&#x27;re on your way!");
  expect(render("/badges?badge=first_steps")).toContain("Earned on November 20, 2026");
});

it("never shows private stats on someone else's page", () => {
  for (const path of ["/u/player-x/badges", "/u/player-x/badges?badge=superstar"]) {
    const text = visibleText(render(path));
    expect(text).not.toMatch(/\b37\b|\b88\b/);
    expect(text).not.toMatch(/weight|height|age|heart rate|bpm|kcal|calorie/i);
  }
});

it("links the profile Badges card to the badges page", () => {
  const html = render("/me");
  expect(html).toContain('href="/badges"');
  expect(html).toContain("See all →");
  expect(html).toContain('aria-label="First Steps badge, earned"');
  vi.mocked(store.listBadges).mockReturnValue([]);
  const empty = render("/me");
  expect(empty).toContain("No badges earned yet.");
  expect(empty).toContain("See all →");
});
