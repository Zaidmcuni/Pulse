/**
 * Owner: Ali
 * Purpose: Groups directory and detail rendering coverage.
 * Edited: Mohamed (task 15, joined vs discover)
 * Edited: Mohamed (task 18, leaderboard handle links to the profile)
 * FRs: FR-42, FR-43, FR-44, FR-45
 */

import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import type { Group } from "../../types/pulse";
import GroupDetail from "./GroupDetail";
import Groups from "./Groups";
import { splitGroups } from "./groupSections";

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
  expect(html).toContain(`href="/dance/${FAKE_DANCE.id}/ready"`);
  expect(html).toContain(`aria-label="Start dance: ${FAKE_DANCE.title} — ${FAKE_DANCE.artist}"`);
  expect(html).toContain('<td>1</td><td><a href="/u/p-demo" data-discover="true">@demo</a></td><td>42</td>');
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
  expect(empty).toContain(`href="/dance/${FAKE_DANCE.id}/ready"`);
  expect(empty).toContain("No upcoming meetups.");
  expect(empty).toContain("No posts shared with this group yet.");
  const missing = renderGroup("/groups/unknown");
  expect(missing).toContain("Group not found");
  expect(missing).toContain('href="/groups"');
});

it("directs visitors to join the featured group and omits the dance action", () => {
  vi.spyOn(store, "listGroups").mockReturnValue([{
    id: "montreal-dancers",
    name: "Montreal Dancers",
    kind: "city",
    memberIds: [],
    groupDanceIds: [FAKE_DANCE.id],
  }]);

  const html = renderGroup("/groups/montreal-dancers");
  expect(html).toMatch(/Join Montreal Dancers in <a href="\/groups"[^>]*>Discover groups<\/a>/);
  expect(html).not.toContain('href="/dance/');
  expect(renderGroups()).toContain('aria-label="Join Montreal Dancers"');
});

it("links each available featured dance to its own Get Ready route", () => {
  const secondDance = { ...FAKE_DANCE, id: "second-dance", title: "Second Dance" };
  const [featuredGroup] = store.listGroups();
  vi.spyOn(store, "listGroups").mockReturnValue([{
    ...featuredGroup,
    groupDanceIds: [FAKE_DANCE.id, secondDance.id],
  }]);
  const getDance = store.getDance;
  vi.spyOn(store, "getDance").mockImplementation((id) => id === secondDance.id ? secondDance : getDance(id));

  const html = renderGroup("/groups/g-friends");
  expect(html).toMatch(`href="/dance/${FAKE_DANCE.id}/ready"`);
  expect(html).toMatch('href="/dance/second-dance/ready"');
});

it("explains when a featured dance is unavailable and omits a broken launch link", () => {
  vi.spyOn(store, "getDance").mockReturnValue(undefined);

  const html = renderGroup("/groups/g-friends");
  expect(html).toContain("This featured dance is unavailable right now.");
  expect(html).not.toContain('href="/dance/');
});

const group = (id: string, name: string, kind: Group["kind"], memberIds: string[]): Group => ({ id, name, kind, memberIds, groupDanceIds: [] });

function renderGroups(): string {
  return renderToStaticMarkup(<StaticRouter location="/groups"><Groups /></StaticRouter>);
}

/** The HTML of one section, from its opening tag to the next section (or the end). */
function sectionHtml(html: string, labelId: string): string {
  const start = html.indexOf(`aria-labelledby="${labelId}"`);
  if (start < 0) return "";
  const next = html.indexOf("<section", start);
  return html.slice(start, next < 0 ? undefined : next);
}

const text = (html: string): string => html.replace(/<[^>]+>/g, "");

it("splits joined groups from discover groups with clear membership", () => {
  const viewerId = store.getActiveProfile()!.id;
  vi.spyOn(store, "listGroups").mockReturnValue([
    group("g-friends", "McGill Friday Night Crew", "friends", [viewerId, "p-a"]),
    group("g-city", "Montreal Movers", "city", ["p-a", "p-b"]),
    group("g-kpop", "K-pop Corner", "dance_type", ["p-a"]),
  ]);
  const html = renderGroups();
  const yours = sectionHtml(html, "groups-yours");
  const discover = sectionHtml(html, "groups-discover");

  expect(text(yours)).toContain("Your groups · 1");
  expect(yours).toContain("McGill Friday Night Crew");
  expect(yours).toContain("✓ Joined");
  expect(yours).toMatch(/<a class="btn btn-primary" href="\/groups\/g-friends"[^>]*>Open<\/a>/);
  expect(yours).toContain('aria-label="Leave McGill Friday Night Crew"');
  expect(yours).toContain("group-card-joined");

  expect(text(discover)).toContain("Discover groups · 2");
  expect(discover).toContain('aria-label="Join Montreal Movers"');
  expect(discover).toContain('aria-label="Join K-pop Corner"');
  expect(discover).not.toContain("✓ Joined");
  expect(discover).not.toContain("McGill Friday Night Crew");
  expect(discover.match(/group-card-discover/g)).toHaveLength(2);
  expect(discover).not.toContain("group-card-joined");
});

it("shows the empty lines when no groups or every group is joined", () => {
  const viewerId = store.getActiveProfile()!.id;
  const list = vi.spyOn(store, "listGroups");
  list.mockReturnValue([group("g-a", "Alpha", "city", ["p-a"])]);
  expect(renderGroups()).toContain("You haven&#x27;t joined a group here yet. Pick one below.");
  list.mockReturnValue([group("g-a", "Alpha", "city", [viewerId])]);
  expect(renderGroups()).toContain("You&#x27;re in every group here.");
});

it("shows every group in discover without actions when no one is signed in", () => {
  vi.spyOn(store, "getActiveProfile").mockReturnValue(null);
  vi.spyOn(store, "listGroups").mockReturnValue([
    group("g-a", "Alpha", "city", ["p-a"]),
    group("g-b", "Beta", "friends", ["p-b"]),
  ]);
  const html = renderGroups();
  expect(html).not.toContain("groups-yours");
  expect(text(sectionHtml(html, "groups-discover"))).toContain("Discover groups · 2");
  expect(html).not.toMatch(/aria-label="(Join|Leave) /);
});

it("sorts joined by name and discover by member count, then name, within the category", () => {
  const groups = [
    group("g-z", "Zed", "city", ["me"]),
    group("g-a", "Ace", "city", ["me", "p-1"]),
    group("g-small", "Small", "city", ["p-1"]),
    group("g-big-b", "Big B", "city", ["p-1", "p-2", "p-3"]),
    group("g-big-a", "Big A", "city", ["p-1", "p-2", "p-3"]),
    group("g-friends", "Friends", "friends", ["p-1", "p-2", "p-3", "p-4"]),
  ];
  const names = (list: Group[]): string[] => list.map(({ name }) => name);

  const all = splitGroups(groups, "me", "all");
  expect(names(all.joined)).toEqual(["Ace", "Zed"]);
  expect(names(all.discover)).toEqual(["Friends", "Big A", "Big B", "Small"]);

  const city = splitGroups(groups, "me", "city");
  expect(names(city.joined)).toEqual(["Ace", "Zed"]);
  expect(names(city.discover)).toEqual(["Big A", "Big B", "Small"]);

  expect(splitGroups(groups, "me", "dance_type")).toEqual({ joined: [], discover: [] });
  expect(splitGroups(groups, undefined, "city").joined).toEqual([]);
  expect(renderGroups()).toContain('aria-pressed="true">All</button>');
});

it("renders group leaderboard dance title and cover art when present, and falls back cleanly when absent", () => {
  const withArtistHtml = renderGroup("/groups/g-friends");
  expect(withArtistHtml).toContain(`<h3>${FAKE_DANCE.title} — ${FAKE_DANCE.artist}</h3>`);
  expect(withArtistHtml).not.toContain("<img");

  vi.spyOn(store, "getDance").mockReturnValue({ ...FAKE_DANCE, coverUrl: "/dances/dance2.jpg" });
  const withCoverHtml = renderGroup("/groups/g-friends");
  expect(withCoverHtml).toContain('src="/dances/dance2.jpg"');

  const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
  vi.mocked(store.getDance).mockReturnValue(noArtistDance);
  const withoutArtistHtml = renderGroup("/groups/g-friends");
  expect(withoutArtistHtml).toContain(`<h3>${FAKE_DANCE.title}</h3>`);
  expect(withoutArtistHtml).not.toContain("—");
  expect(withoutArtistHtml).not.toContain("undefined");
});
