/**
 * Owner: Ali
 * Added by: Toufic (#141)
 * Purpose: Community leaderboard: toggle, estimated-calorie wording and privacy, pinned viewer row, Rankings tab route
 * FRs: FR-44, FR-35, FR-02, FR-38
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { store } from "../../data/store";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { FeedPost, PlayerProfile, SessionResult } from "../../types/pulse";
import Leaderboard from "./Leaderboard";

const render = (): string => renderToStaticMarkup(<MemoryRouter><Leaderboard /></MemoryRouter>);

function dancers(count: number): PlayerProfile[] {
  const demo = store.getActiveProfile()!;
  return Array.from({ length: count }, (_, i) => ({
    ...demo, id: `p${i + 1}`, handle: `dancer-${i + 1}`, displayName: `Dancer ${i + 1}`,
    age: 91, weightKg: 131.37, heightCm: 193.47, restingHr: 44, hrMaxOverride: 198,
  }));
}

function seed(profiles: PlayerProfile[], results: SessionResult[], posts: FeedPost[] = []): void {
  vi.spyOn(store, "listProfiles").mockReturnValue(profiles);
  vi.spyOn(store, "listResults").mockImplementation((playerId) => results.filter((r) => r.playerId === playerId));
  vi.spyOn(store, "listFeed").mockReturnValue(posts);
}

beforeEach(async () => {
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
});

afterEach(() => vi.restoreAllMocks());

describe("Community leaderboard", () => {
  it("ranks dancers by total points with a Points / Calories (est.) toggle and pins the viewer", () => {
    const profiles = dancers(7);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(profiles[6]);
    seed(profiles, profiles.map((p, i) => ({ ...FAKE_RESULT, id: `r${i}`, playerId: p.id, totalPoints: 7000 - i * 1000 })));
    const html = render();
    expect(html).toContain('<h1 id="leaderboard-title">Leaderboard</h1>');
    expect(html).toContain('<input type="radio" name="leaderboard-metric" checked="" value="points"/>');
    expect(html).toContain("Calories (est.)");
    expect(html).toContain("Total points from every finished dance, across all dancers.");
    expect(html.indexOf("@dancer-1")).toBeLessThan(html.indexOf("@dancer-2"));
    expect(html).toContain("7,000");
    expect(html).toContain('href="/u/p1"');
    expect(html).toContain('class="ranking-rank is-podium">1<');
    expect(html).toContain('class="ranking-rank">4<');
    expect(html).not.toContain("@dancer-6");
    expect(html).toMatch(/<tfoot>.*Your rank · <a[^>]*>@dancer-7<\/a>.*1,000.*<\/tfoot>/);
    for (const secret of ["131.37", "193.47", "198", ">91<", ">44<"]) expect(html).not.toContain(secret);
  });

  it("invites an unranked viewer and shows an encouraging empty state", () => {
    const profiles = dancers(1);
    seed(profiles, [{ ...FAKE_RESULT, id: "r1", playerId: "p1" }]);
    expect(render()).toContain("Finish a dance to join the leaderboard.");
    seed(profiles, [{ ...FAKE_RESULT, id: "r1", playerId: "p1", completed: false }]);
    expect(render()).toContain("No finished dances yet. Be the first on the board!");
  });
});

describe("Rankings tab", () => {
  it("is the third Feed segment at /leaderboard and keeps the Feed nav active", () => {
    const html = renderToStaticMarkup(<StaticRouter location="/leaderboard"><App /></StaticRouter>);
    const tabs = html.slice(html.indexOf('class="crew-tabs"'));
    expect(tabs.indexOf(">Feed<")).toBeLessThan(tabs.indexOf(">Groups<"));
    expect(tabs.indexOf(">Groups<")).toBeLessThan(tabs.indexOf(">Rankings<"));
    expect(html).toMatch(/<a[^>]*href="\/leaderboard"[^>]*>Rankings<\/a>/);
    expect(html).toMatch(/class="crew-tab active"[^>]*href="\/leaderboard"|href="\/leaderboard"[^>]*class="crew-tab active"/);
    expect(html).toMatch(/class="app-tab active"[^>]*href="\/feed"|href="\/feed"[^>]*class="app-tab active"/);
    expect(html).toContain("Leaderboard</h1>");
  });
});
