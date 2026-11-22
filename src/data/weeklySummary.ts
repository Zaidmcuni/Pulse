/**
 * Owner: Toufic (UI sprint lane D)
 * Purpose: "This week" summary for the Me page: minutes danced vs a weekly goal, Mon–Sun days danced,
 *          finished dances, estimated calories and the current day streak (pure).
 * FRs: FR-41, FR-02 (private: only the signed-in dancer's own /me page)
 * Pure: inputs are never mutated. Only completed results count toward the week (quit-early runs never do);
 *       resultsOnDay lists a day's runs, ended-early ones included, like Recent workouts.
 */

import { resultHasHeartRate } from "../scoring/session";
import type { SessionResult } from "../types/pulse";

/** #143: demo weekly movement target in minutes, not user-set (like DAILY_KCAL_GOAL). */
export const WEEKLY_MOVEMENT_GOAL_MIN = 150;

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface WeekDay {
  name: string;       // "Monday" … "Sunday"
  initial: string;    // "M" … "S"
  active: boolean;    // at least one completed dance that local day
  isToday: boolean;
  dayMs: number;      // local 00:00 of this day
  isFuture: boolean;  // after today (nothing to show yet)
}

export interface WeeklySummary {
  weekStartMs: number;       // local Monday 00:00 of `now`'s week
  minutes: number;           // whole minutes danced this week (durationSec, with or without a watch)
  goalFraction: number;      // minutes / WEEKLY_MOVEMENT_GOAL_MIN clamped 0..1
  days: WeekDay[];           // Monday first, always 7
  kcal: number | null;       // estimated kcal of this week's runs with heart rate; null when none had any
  dances: number;            // completed dances this week
  streakDays: number;        // consecutive local days with a completed dance, ending today (or yesterday)
}

/** Local calendar day start, same rule as data/badges.ts (On Fire streak). */
function localDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local Monday 00:00 to next Monday 00:00, same rule as data/leaderboard.ts. */
function weekRangeMs(now: Date): [number, number] {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const startMs = monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(startMs);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return [startMs, nextMonday.setHours(0, 0, 0, 0)];
}

export function computeWeeklySummary(results: readonly SessionResult[], now: Date = new Date()): WeeklySummary {
  const completed = results.filter((r) => r.completed && Number.isFinite(Date.parse(r.createdAtIso)));
  const [startMs, endMs] = weekRangeMs(now);
  const thisWeek = completed.filter((r) => {
    const createdMs = Date.parse(r.createdAtIso);
    return startMs <= createdMs && createdMs < endMs;
  });

  const minutes = Math.round(thisWeek.reduce((sum, r) => sum + Math.max(0, r.durationSec), 0) / 60);
  const withHeartRate = thisWeek.filter(resultHasHeartRate);
  const danced = new Set(completed.map((r) => localDay(new Date(r.createdAtIso))));
  const todayMs = localDay(now);

  const days = DAY_NAMES.map((name, index) => {
    const day = new Date(startMs);
    day.setDate(day.getDate() + index);
    const dayMs = localDay(day);
    return { name, initial: name[0], active: danced.has(dayMs), isToday: dayMs === todayMs, dayMs, isFuture: dayMs > todayMs };
  });

  const cursor = new Date(todayMs);
  if (!danced.has(todayMs)) cursor.setDate(cursor.getDate() - 1);
  let streakDays = 0;
  while (danced.has(localDay(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    weekStartMs: startMs,
    minutes,
    goalFraction: Math.min(1, Math.max(0, minutes / WEEKLY_MOVEMENT_GOAL_MIN)),
    days,
    kcal: withHeartRate.length > 0 ? withHeartRate.reduce((sum, r) => sum + r.caloriesKcal, 0) : null,
    dances: thisWeek.length,
    streakDays,
  };
}

/** #143: every run (completed or ended early) on the local day starting at `dayMs`, like Recent workouts. */
export function resultsOnDay(results: readonly SessionResult[], dayMs: number): SessionResult[] {
  return results.filter((r) => {
    const createdMs = Date.parse(r.createdAtIso);
    return Number.isFinite(createdMs) && localDay(new Date(createdMs)) === dayMs;
  });
}
