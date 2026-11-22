/**
 * Owner: Ali
 * Added by: Toufic (song page, part of #144)
 * Purpose: Song page: details, Start link, rough calorie range, this song's leaderboard and the not-found state
 * FRs: FR-09, FR-44, FR-35
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, StaticRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { accounts, DEMO_PASSWORD } from "../../auth/accounts";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { PlayerProfile, SessionResult } from "../../types/pulse";
import SongPage from "./SongPage";

const DANCE = { ...FAKE_DANCE, id: "tip", title: "Tip Toe", artist: "Jason Derulo", genre: "Pop / R&B", difficulty: "easy" as const, bpm: 98, lengthSec: 186.36 };

function render(id = DANCE.id): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/dances/${id}`]}>
      <Routes><Route path="/dances/:id" element={<SongPage />} /></Routes>
    </MemoryRouter>,
  );
}

function dancers(count: number): PlayerProfile[] {
  const demo = store.getActiveProfile()!;
  return Array.from({ length: count }, (_, i) => ({
    ...demo, id: `p${i + 1}`, handle: `dancer-${i + 1}`, displayName: `Dancer ${i + 1}`,
    age: 91, weightKg: 131.37, heightCm: 193.47, restingHr: 44, hrMaxOverride: 198,
  }));
}

function withResults(profiles: PlayerProfile[], results: SessionResult[]): void {
  vi.spyOn(store, "listProfiles").mockReturnValue(profiles);
  vi.spyOn(store, "listResults").mockImplementation((playerId) => results.filter((r) => r.playerId === playerId));
}

function run(id: string, playerId: string, totalPoints: number, extra: Partial<SessionResult> = {}): SessionResult {
  return { ...FAKE_RESULT, id, playerId, danceId: DANCE.id, totalPoints, ...extra };
}

beforeEach(async () => {
  await accounts.logIn("demo@pulse.demo", DEMO_PASSWORD);
  vi.spyOn(store, "getDance").mockImplementation((id) => (id === DANCE.id ? DANCE : undefined));
});

afterEach(() => vi.restoreAllMocks());

describe("Song page", () => {
  it("shows the song details, then Start, calories and the leaderboard in that order", () => {
    withResults([], []);
    const html = render();
    expect(html).toContain("← All songs");
    expect(html).toContain("<h1 id=\"song-title\">Tip Toe</h1>");
    expect(html).toContain("Jason Derulo");
    expect(html).toContain("Pop / R&amp;B · 3:06 · 98 BPM");
    expect(html).toContain(">Light cardio<");
    expect(html).toContain('href="/dance/tip/ready"');
    expect(html).toContain(">Start dance<");
    expect(html).toContain("~16–25 kcal est.");
    expect(html).toContain("A rough guide for this song. Your real estimate uses your watch and profile.");
    const start = html.indexOf("Start dance");
    expect(start).toBeLessThan(html.indexOf("Estimated calories"));
    expect(html.indexOf("Estimated calories")).toBeLessThan(html.indexOf("Leaderboard"));
    expect(html).toContain("No scores yet. Be the first!");
  });

  it("names the dancer's mode under Start", () => {
    withResults([], []);
    const profile = store.getActiveProfile()!;
    store.saveProfile({ ...profile, mode: "seated" });
    expect(render()).toContain("You&#x27;ll dance seated, upper body only. Change it on the song list.");
    store.saveProfile({ ...profile, mode: "standing" });
    expect(render()).toContain("You&#x27;ll dance standing. Change it on the song list.");
  });

  it("ranks each dancer's best finished run and pins the viewer below the top five", () => {
    const profiles = dancers(7);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(profiles[6]);
    withResults(profiles, [
      ...profiles.map((p, i) => run(`r${i}`, p.id, 1000 - i * 100)),
      run("better", "p2", 5000),
      run("quit", "p7", 9999, { completed: false }),
      run("other-song", "p7", 9999, { danceId: "other" }),
    ]);
    const html = render();
    expect(html.indexOf("@dancer-2")).toBeLessThan(html.indexOf("@dancer-1"));
    expect(html).toContain("5,000");
    expect(html).toContain('href="/u/p1"');
    expect(html).not.toContain("@dancer-6");
    expect(html).toMatch(/<tfoot>.*Your rank · <a[^>]*>@dancer-7<\/a>.*400.*<\/tfoot>/);
    expect(html).not.toContain("9,999");
    for (const secret of ["131.37", "193.47", "198", ">91<", ">44<"]) expect(html).not.toContain(secret);
  });

  it("does not pin the viewer when they are already in the top five", () => {
    const profiles = dancers(3);
    vi.spyOn(store, "getActiveProfile").mockReturnValue(profiles[0]);
    withResults(profiles, profiles.map((p, i) => run(`r${i}`, p.id, 100 + i)));
    expect(render()).not.toContain("<tfoot>");
  });

  it("shows a friendly message for an unknown song", () => {
    const html = render("nope");
    expect(html).toContain("Song not found");
    expect(html).toContain('href="/dances"');
    expect(html).not.toContain("Start dance");
  });

  it("is routed at /dances/:id with the Dance tab active", () => {
    const html = renderToStaticMarkup(<StaticRouter location="/dances/tip"><App /></StaticRouter>);
    expect(html).toContain("Start dance");
    expect(html).toMatch(/<a[^>]*class="app-tab active"[^>]*href="\/dances"|<a[^>]*href="\/dances"[^>]*class="app-tab active"/);
  });
});
