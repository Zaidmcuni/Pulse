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
import { WeekDayPanel, WeeklyGoalCard } from "./WeeklyGoalCard";

afterEach(() => vi.restoreAllMocks());

const now = new Date(2026, 10, 22, 12); // Sunday Nov 22, local time
const HR_MAX = 190;
const noWatch = FAKE_RESULT.samples.map((s) => ({ ...s, heartRate: 0, hrSource: "none" as const }));

function run(id: string, date: Date, extra: Partial<SessionResult> = {}): SessionResult {
  return { ...FAKE_RESULT, id, durationSec: 186, caloriesKcal: 24.5, createdAtIso: date.toISOString(), ...extra };
}

function card(results: SessionResult[]): string {
  return renderToStaticMarkup(<StaticRouter location="/me"><WeeklyGoalCard results={results} hrMax={HR_MAX} now={now} /></StaticRouter>);
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
  expect(html).toContain('class="weekly-day is-active is-today" aria-hidden="true">S</span>');
  expect(html).toContain('role="group" aria-label="Danced on 2 of 7 days this week: Monday, Sunday"');
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

it("turns each past or current day into a closed toggle button named with its date and dances", () => {
  const html = card([run("fri", new Date(2026, 10, 20, 18)), run("fri-quit", new Date(2026, 10, 20, 19), { completed: false })]);
  expect(html.match(/<button id="weekly-day-[0-9]+" type="button" class="weekly-day-btn"/g)).toHaveLength(7);
  expect(html).toContain('aria-label="Friday, Nov 20 — 2 dances" aria-expanded="false"');
  expect(html).toContain('aria-label="Monday, Nov 16 — 0 dances" aria-expanded="false"');
  expect(html).not.toContain("disabled");
  expect(html).not.toContain("weekly-day-panel");
  expect(html).not.toContain("is-selected");
});

it("disables the days still to come this week", () => {
  const wednesday = new Date(2026, 10, 18, 12);
  const html = renderToStaticMarkup(
    <StaticRouter location="/me"><WeeklyGoalCard results={[]} hrMax={HR_MAX} now={wednesday} /></StaticRouter>,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(4);
  expect(html).toContain('aria-label="Thursday, Nov 19" aria-expanded="false" disabled=""');
  expect(html).toContain('aria-label="Wednesday, Nov 18 — 0 dances" aria-expanded="false">');
});

it("keeps a running streak visible on a fresh week", () => {
  const monday = new Date(2026, 10, 23, 9);
  const html = renderToStaticMarkup(
    <StaticRouter location="/me"><WeeklyGoalCard results={[run("sun", new Date(2026, 10, 22, 9))]} hrMax={HR_MAX} now={monday} /></StaticRouter>,
  );
  expect(text(html)).toContain("A fresh week!");
  expect(text(html)).toContain("1-day streak");
  expect(text(html)).not.toContain("dances finished");
});

function panel(results: SessionResult[], dayMs: number): string {
  return renderToStaticMarkup(
    <StaticRouter location="/me"><WeekDayPanel results={results} hrMax={HR_MAX} dayMs={dayMs} now={now} /></StaticRouter>,
  );
}

it("opens a day with the Today ring, its share of the daily goal and a tile per workout", () => {
  const friday = new Date(2026, 10, 20).getTime();
  const html = panel([
    run("fri", new Date(2026, 10, 20, 18)),
    run("fri-quit", new Date(2026, 10, 20, 19), { completed: false }),
    run("sat", new Date(2026, 10, 21, 0, 0, 1)),
  ], friday);
  expect(html).toContain('id="weekly-day-panel" class="card weekly-day-panel" role="region" aria-label="Fri, Nov 20"');
  expect(html).toContain('class="health-ring"');
  expect(html).not.toMatch(/class="card[^"]*"[^>]*>\s*<div class="health-ring"/);
  expect(text(html)).toContain("49/ 300 kcal");
  expect(text(html)).toContain("Fri, Nov 20 ·");
  expect(text(html)).toContain("· 2 dances");
  expect(text(html)).toContain("16% of the daily goal");
  expect(text(html)).toContain("Calories are estimated.");
  expect(html.match(/class="health-tile"/g)).toHaveLength(2);
  expect(html).toContain('href="/results/fri"');
  expect(html).toContain('href="/results/fri-quit"');
  expect(html).not.toContain("/results/sat");
  expect(text(html)).toContain("Ended early");
});

it("shows -- without a watch, celebrates a reached goal and is kind about an empty day", () => {
  const friday = new Date(2026, 10, 20).getTime();
  const noWatchDay = panel([run("fri", new Date(2026, 10, 20, 18), { samples: noWatch })], friday);
  expect(text(noWatchDay)).toContain("--/ 300 kcal");
  expect(text(noWatchDay)).toContain("Connect a watch to track calories.");
  expect(text(noWatchDay)).not.toContain("of the daily goal");

  const big = panel([run("fri", new Date(2026, 10, 20, 18), { caloriesKcal: 320 })], friday);
  expect(text(big)).toContain("Daily goal reached!");

  const empty = panel([run("sat", new Date(2026, 10, 21, 9))], friday);
  expect(text(empty)).toContain("No dances this day.");
  expect(empty).not.toContain("health-tile");
});
