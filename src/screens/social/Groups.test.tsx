/**
 * Owner: Ali
 * Purpose: Groups directory and detail rendering coverage.
 * FRs: FR-42, FR-43, FR-44, FR-45
 */

import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import GroupDetail from "./GroupDetail";
import Groups from "./Groups";

afterEach(() => vi.restoreAllMocks());

function renderGroup(path: string): string {
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <Routes><Route path="/groups/:id" element={<GroupDetail />} /></Routes>
    </StaticRouter>,
  );
}

it("lists categories and gives a member a Leave action", () => {
  const html = renderToStaticMarkup(<StaticRouter location="/groups"><Groups /></StaticRouter>);
  expect(html).toContain('aria-label="Group category"');
  expect(html).toContain(">Dance type</button>");
  expect(html).toContain('href="/groups/g-friends"');
  expect(html).toContain('aria-label="Leave McGill Friday Night Crew"');
});

it("scopes group posts and ranking, formats handles, and omits past meetups", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-21T12:00:00Z"));
  vi.spyOn(store, "listFeed").mockReturnValue([]);
  const rank = vi.spyOn(store, "weeklyLeaderboard").mockReturnValue([{ playerId: "p-demo", points: 42 }]);
  vi.spyOn(store, "listMeetups").mockReturnValue([
    { id: "old", groupId: "g-friends", title: "Past meetup", place: "Hall", startsAtIso: "2026-11-20T12:00:00Z", rsvpIds: [] },
    { id: "next", groupId: "g-friends", title: "Next meetup", place: "Studio", startsAtIso: "2026-11-22T12:00:00Z", rsvpIds: ["p-demo"] },
  ]);

  const html = renderGroup("/groups/g-friends");
  expect(store.listFeed).toHaveBeenCalledWith("g-friends");
  expect(rank).toHaveBeenCalledWith("g-friends", FAKE_DANCE.id);
  expect(html).toContain("<td>1</td><td>@demo</td><td>42</td>");
  expect(html).not.toContain("@@demo");
  expect(html).not.toContain("Past meetup");
  expect(html).toContain("Next meetup");
  expect(html).toContain("Studio");
  expect(html).toContain('dateTime="2026-11-22T12:00:00Z"');
  expect(html).toContain('aria-pressed="true">RSVP</button>');
  expect(html).toContain("1 going");
});

it("renders empty panels and recovers from unknown group URLs", () => {
  const empty = renderGroup("/groups/g-friends");
  expect(empty).toContain("No scores this week yet.");
  expect(empty).toContain("No upcoming meetups.");
  expect(empty).toContain("No posts shared with this group yet.");
  const missing = renderGroup("/groups/unknown");
  expect(missing).toContain("Group not found");
  expect(missing).toContain('href="/groups"');
});
