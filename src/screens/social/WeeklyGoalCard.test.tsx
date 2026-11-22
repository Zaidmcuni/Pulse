/**
 * Owner: Toufic (UI sprint lane D)
 * Purpose: "This week" card rendering, its place on /me, and its absence from the public profile.
 * FRs: FR-41, FR-02
 */

import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import { FAKE_RESULT } from "../../mocks/fakeSession";
import type { SessionResult } from "../../types/pulse";
import DancerProfile from "../profile/DancerProfile";
import ProfilePage from "./ProfilePage";
import { WeeklyGoalCard } from "./WeeklyGoalCard";

afterEach(() => vi.restoreAllMocks());

const now = new Date(2026, 10, 22, 12); // Sunday Nov 22, local time
const noWatch = FAKE_RESULT.samples.map((s) => ({ ...s, heartRate: 0, hrSource: "none" as const }));

function run(id: string, date: Date, extra: Partial<SessionResult> = {}): SessionResult {
  return { ...FAKE_RESULT, id, durationSec: 186, caloriesKcal: 24.5, createdAtIso: date.toISOString(), ...extra };
}

function card(results: SessionResult[]): string {
  return renderToStaticMarkup(<StaticRouter location="/me"><WeeklyGoalCard results={results} now={now} /></StaticRouter>);
}

const text = (html: string): string => html.replace(/<[^>]+>/g, "");

it("shows minutes vs the weekly goal, the Mon–Sun dots and the summary chips", () => {
  const html = card([run("mon", new Date(2026, 10, 16, 18)), run("sun", new Date(2026, 10, 22, 9))]);
  expect(html).toContain('<h2 id="weekly-title">This week</h2>');
  expect(text(html)).toContain("Nov 16 – Nov 22");
  expect(text(html)).toContain("6 min danced");
  expect(text(html)).toContain("Weekly movement goal · 150 min");
  expect(html).toContain('style="width:4%"');
  expect(html.match(/class="weekly-day[ "]/g)).toHaveLength(7);
  expect(html.match(/weekly-day is-active/g)).toHaveLength(2);
  expect(html).toContain('class="weekly-day is-active is-today">S</span>');
  expect(html).toContain('role="img" aria-label="Danced on 2 of 7 days this week: Monday, Sunday"');
  expect(text(html)).toContain("2 dances finished");
  expect(text(html)).toContain("1-day streak");
  expect(text(html)).toContain("49 kcal est.");
  expect(html).not.toContain("Weekly goal reached!");
});

it("welcomes an empty week with a link to the dances", () => {
  const html = card([run("quit", new Date(2026, 10, 22, 9), { completed: false })]);
  expect(text(html)).toContain("0 min danced");
  expect(html).toContain('style="width:0%"');
  expect(html).not.toContain("is-active");
  expect(html).toMatch(/A fresh week! <a href="\/dances"[^>]*>Pick a dance<\/a> to get moving\./);
  expect(html).toContain('aria-label="No dance days yet this week"');
});

it("shows no-watch calories as -- and invites a streak", () => {
  const html = card([run("fri", new Date(2026, 10, 20, 18), { samples: noWatch })]);
  expect(text(html)).toContain("1 dance finished");
  expect(text(html)).toContain("-- kcal · no watch");
  expect(text(html)).toContain("Dance today to start a streak");
  expect(text(html)).not.toContain("kcal est.");
});

it("celebrates a reached goal with a full bar", () => {
  const html = card([run("long", new Date(2026, 10, 18, 18), { durationSec: 151 * 60 })]);
  expect(html).toContain('class="weekly-bar-fill is-done" style="width:100%"');
  expect(text(html)).toContain("Weekly goal reached!");
});

it("sits right under Start Workout on /me and never on the public profile", () => {
  const me = renderToStaticMarkup(<StaticRouter location="/me"><ProfilePage /></StaticRouter>);
  expect(me.indexOf("profile-start-workout")).toBeLessThan(me.indexOf('id="weekly-title"'));
  expect(me.indexOf('id="weekly-title"')).toBeLessThan(me.indexOf("Recent workouts"));

  const viewer = store.getActiveProfile()!;
  const other = { ...viewer, id: "player-other", handle: "other" };
  vi.spyOn(store, "listProfiles").mockReturnValue([viewer, other]);
  vi.spyOn(store, "listResults").mockReturnValue([run("pub", new Date(), { playerId: other.id })]);
  const pub = renderToStaticMarkup(
    <StaticRouter location={`/u/${other.id}`}>
      <Routes><Route path="/u/:playerId" element={<DancerProfile />} /></Routes>
    </StaticRouter>,
  );
  expect(pub).toContain("@other");
  expect(pub).not.toMatch(/This week|Weekly movement goal|min danced|weekly-/);
});
