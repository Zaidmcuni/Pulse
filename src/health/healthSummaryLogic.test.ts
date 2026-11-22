/**
 * Owner: Mohamed
 * Purpose: unit tests for the Me page Today summary, recent workouts and workout dates.
 * FRs: FR-32, FR-41, FR-02
 */

import { describe, expect, it } from "vitest";
import { FAKE_RESULT } from "../mocks/fakeSession";
import type { HeartRateSource, SessionResult } from "../types/pulse";
import { DAILY_KCAL_GOAL, formatWorkoutDate, recentWorkouts, todaySummary } from "./healthSummaryLogic";

const HR_MAX = 194;
const NOW = new Date(2026, 10, 22, 21, 0); // Sun Nov 22 2026 21:00 local

/** Local time -> ISO, so "today" means the same thing in every timezone. */
const iso = (day: number, hour: number, minute = 0): string => new Date(2026, 10, day, hour, minute).toISOString();

function result(id: string, createdAtIso: string, caloriesKcal: number, opts: { hrSource?: HeartRateSource; bpm?: number; completed?: boolean } = {}): SessionResult {
  const { hrSource = "ble", bpm = 150, completed = true } = opts;
  return {
    ...FAKE_RESULT,
    id,
    completed,
    createdAtIso,
    caloriesKcal,
    samples: Array.from({ length: 60 }, (_, tSec) => ({
      tSec, heartRate: hrSource === "none" ? 0 : bpm, hrSource, effort: 0, accuracy: 0.78, points: 0,
    })),
  };
}

describe("todaySummary", () => {
  it("sums today's calories and dances, ignoring other days", () => {
    const results = [result("a", iso(22, 9), 120), result("b", iso(22, 18), 80), result("c", iso(21, 20), 500)];
    const s = todaySummary(results, HR_MAX, NOW);
    expect(s.kcal).toBe(200);
    expect(s.dances).toBe(2);
    expect(s.goalFraction).toBeCloseTo(0.667, 3);
    expect(s.activeMinutes).toBe(2); // 60 s at 150 bpm (hard) in each of the two today runs
  });

  it("counts a no-watch run in dances but not in kcal", () => {
    const results = [result("a", iso(22, 9), 120), result("b", iso(22, 10), 999, { hrSource: "none" })];
    const s = todaySummary(results, HR_MAX, NOW);
    expect(s.kcal).toBe(120);
    expect(s.dances).toBe(2);
    expect(s.activeMinutes).toBe(1);
  });

  it("gives null kcal and an empty goal when no today run had a watch", () => {
    const results = [result("a", iso(22, 9), 50, { hrSource: "none" }), result("c", iso(21, 20), 500)];
    expect(todaySummary(results, HR_MAX, NOW)).toEqual({ kcal: null, activeMinutes: 0, dances: 1, goalFraction: 0 });
  });

  it("clamps the goal at 1", () => {
    expect(DAILY_KCAL_GOAL).toBe(300);
    expect(todaySummary([result("a", iso(22, 9), 400)], HR_MAX, NOW).goalFraction).toBe(1);
  });

  it("is zero with no results", () => {
    expect(todaySummary([], HR_MAX, NOW)).toEqual({ kcal: null, activeMinutes: 0, dances: 0, goalFraction: 0 });
  });
});

describe("recentWorkouts", () => {
  const results = [
    result("old", iso(18, 12), 90),
    result("quit", iso(22, 20), 40, { completed: false }),
    result("nowatch", iso(21, 18), 70, { hrSource: "none" }),
    result("mid", iso(20, 12), 110, { bpm: 100 }),
  ];

  it("returns the newest 3, quit runs included, with no-watch runs as null", () => {
    const copy = structuredClone(results);
    const recent = recentWorkouts(results, HR_MAX);
    expect(recent.map((w) => w.resultId)).toEqual(["quit", "nowatch", "mid"]);
    expect(recent[0]).toMatchObject({ completed: false, kcal: 40, intensity: "hard", durationSec: FAKE_RESULT.durationSec });
    expect(recent[1]).toMatchObject({ completed: true, kcal: null, intensity: null });
    expect(recent[2]).toMatchObject({ kcal: 110, intensity: "easy", danceId: FAKE_RESULT.danceId });
    expect(results).toEqual(copy);
  });

  it("honours a custom limit", () => {
    expect(recentWorkouts(results, HR_MAX, 1).map((w) => w.resultId)).toEqual(["quit"]);
  });
});

describe("formatWorkoutDate", () => {
  it("formats today, yesterday and older dates", () => {
    const now = new Date(NOW);
    expect(formatWorkoutDate(iso(22, 21, 41), now)).toBe("Today, 9:41 PM");
    expect(formatWorkoutDate(iso(21, 18, 2), now)).toBe("Yesterday, 6:02 PM");
    expect(formatWorkoutDate(iso(20, 10), now)).toBe("Nov 20");
    expect(now.getTime()).toBe(NOW.getTime());
  });

  it("handles yesterday across a month boundary", () => {
    const now = new Date(2026, 11, 1, 8, 0);
    expect(formatWorkoutDate(new Date(2026, 10, 30, 7, 5).toISOString(), now)).toBe("Yesterday, 7:05 AM");
  });
});
