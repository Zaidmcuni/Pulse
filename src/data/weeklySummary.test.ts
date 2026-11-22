/**
 * Owner: Toufic (UI sprint lane D)
 * Purpose: "This week" summary tests: Mon–Sun window, day dots, streak, quit-early and no-watch rules.
 * FRs: FR-41, FR-02
 */

import { expect, it } from "vitest";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { SessionResult } from "../types/pulse";
import { computeWeeklySummary, resultsOnDay, WEEKLY_MOVEMENT_GOAL_MIN } from "./weeklySummary";

const now = new Date(2026, 10, 22, 12); // Sunday Nov 22, local time

function run(id: string, date: Date, extra: Partial<SessionResult> = {}): SessionResult {
  return { ...FAKE_RESULT, id, durationSec: 180, caloriesKcal: 20, createdAtIso: date.toISOString(), ...extra };
}

const noWatch = FAKE_RESULT.samples.map((s) => ({ ...s, heartRate: 0, hrSource: "none" as const }));

it("counts only the local Monday-to-Sunday week, both edges included", () => {
  const monday = new Date(2026, 10, 16);
  const nextMonday = new Date(2026, 10, 23);
  const results = [
    run("in-start", monday),
    run("in-end", new Date(nextMonday.getTime() - 1)),
    run("before", new Date(monday.getTime() - 1)),
    run("after", nextMonday),
  ];
  const summary = computeWeeklySummary(results, now);
  expect(summary.weekStartMs).toBe(monday.getTime());
  expect(summary.dances).toBe(2);
  expect(summary.minutes).toBe(6);
  expect(summary.kcal).toBe(40);
  expect(summary.days.map((d) => d.initial).join("")).toBe("MTWTFSS");
  expect(summary.days.map((d) => d.active)).toEqual([true, false, false, false, false, false, true]);
  expect(summary.days.map((d) => d.isToday)).toEqual([false, false, false, false, false, false, true]);
});

it("keeps seven local days across a daylight-saving change", () => {
  const sunday = new Date(2026, 10, 1, 20); // North American DST ends this Sunday
  const summary = computeWeeklySummary([run("mon", new Date(2026, 9, 26, 9)), run("sun", sunday)], sunday);
  expect(summary.weekStartMs).toBe(new Date(2026, 9, 26).getTime());
  expect(summary.days).toHaveLength(7);
  expect(summary.days[0].active && summary.days[6].active && summary.days[6].isToday).toBe(true);
  expect(summary.dances).toBe(2);
});

it("counts a streak ending today or yesterday, across a month boundary, once per day", () => {
  const nov2 = new Date(2026, 10, 2, 18);
  const results = [
    run("oct30", new Date(2026, 9, 30, 10)),
    run("oct31a", new Date(2026, 9, 31, 9)),
    run("oct31b", new Date(2026, 9, 31, 21)),
    run("nov1", new Date(2026, 10, 1, 12)),
  ];
  expect(computeWeeklySummary([...results, run("nov2", nov2)], nov2).streakDays).toBe(4);
  expect(computeWeeklySummary(results, nov2).streakDays).toBe(3); // nothing yet today: still counts to yesterday
  expect(computeWeeklySummary(results, new Date(2026, 10, 3, 9)).streakDays).toBe(0); // a missed day resets
});

it("ignores quit-early runs everywhere", () => {
  const quit = run("quit", new Date(2026, 10, 22, 9), { completed: false });
  const summary = computeWeeklySummary([quit], now);
  expect(summary).toMatchObject({ minutes: 0, dances: 0, kcal: null, streakDays: 0, goalFraction: 0 });
  expect(summary.days.some((d) => d.active)).toBe(false);
});

it("counts no-watch runs for minutes, days, dances and streak but not for calories", () => {
  const plain = run("plain", new Date(2026, 10, 22, 9), { samples: noWatch, caloriesKcal: 99 });
  const summary = computeWeeklySummary([plain], now);
  expect(summary).toMatchObject({ minutes: 3, dances: 1, kcal: null, streakDays: 1 });
  expect(summary.days[6].active).toBe(true);

  const withWatch = run("watch", new Date(2026, 10, 21, 9), { caloriesKcal: 25.5 });
  expect(computeWeeklySummary([plain, withWatch], now).kcal).toBe(25.5);
});

it("is empty with no runs and clamps the goal at 1 without mutating inputs", () => {
  const empty = computeWeeklySummary([], now);
  expect(empty).toMatchObject({ minutes: 0, dances: 0, kcal: null, streakDays: 0, goalFraction: 0 });
  expect(empty.days.every((d) => !d.active)).toBe(true);

  const long = [run("long", new Date(2026, 10, 20, 9), { durationSec: (WEEKLY_MOVEMENT_GOAL_MIN + 10) * 60 })];
  const copy = structuredClone(long);
  expect(computeWeeklySummary(long, now)).toMatchObject({ minutes: 160, goalFraction: 1 });
  expect(long).toEqual(copy);
});

it("gives each day its local midnight and marks the days still to come", () => {
  const wednesday = new Date(2026, 10, 18, 12);
  const summary = computeWeeklySummary([], wednesday);
  expect(summary.days.map((d) => d.dayMs)).toEqual([16, 17, 18, 19, 20, 21, 22].map((d) => new Date(2026, 10, d).getTime()));
  expect(summary.days.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
});

it("lists one local day's runs, ended-early ones included, edges exact", () => {
  const friday = new Date(2026, 10, 20).getTime();
  const results = [
    run("start", new Date(friday)),
    run("quit", new Date(2026, 10, 20, 12), { completed: false }),
    run("end", new Date(new Date(2026, 10, 21).getTime() - 1)),
    run("before", new Date(friday - 1)),
    run("after", new Date(2026, 10, 21)),
    run("bad", new Date(friday), { createdAtIso: "not a date" }),
  ];
  const input = [...results];
  expect(resultsOnDay(results, friday).map((r) => r.id)).toEqual(["start", "quit", "end"]);
  expect(results).toEqual(input);
});
