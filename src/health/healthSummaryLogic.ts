/**
 * Owner: Mohamed
 * Purpose: Today totals (estimated calories, active minutes, dances) and recent workouts for the Me page.
 * FRs: FR-32, FR-41, FR-02
 * Pure: inputs are never mutated.
 */

import { resultHasHeartRate } from "../scoring/session";
import type { SessionResult } from "../types/pulse";
import { workoutIntensity, type IntensityZone } from "./intensity";

/** Demo default daily goal, not user-set yet. */
export const DAILY_KCAL_GOAL = 300;

const DEFAULT_RECENT_LIMIT = 3;

export interface TodaySummary {
  kcal: number | null;        // sum of caloriesKcal of today's results that have heart rate; null if none of today's results do
  activeMinutes: number;      // sum of workoutIntensity(...).activeMinutes over today's results (0 when unknown), 1 decimal
  dances: number;             // today's results, completed or quit
  goalFraction: number;       // kcal / DAILY_KCAL_GOAL clamped 0..1 (0 when kcal is null)
}

export interface RecentWorkout {
  resultId: string; danceId: string; createdAtIso: string; durationSec: number;
  completed: boolean; points: number; kcal: number | null; intensity: IntensityZone | null;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "today" = same LOCAL calendar day as `now`, from createdAtIso. */
export function todaySummary(results: readonly SessionResult[], hrMax: number, now: Date = new Date()): TodaySummary {
  const today = results.filter((r) => sameLocalDay(new Date(r.createdAtIso), now));
  const withWatch = today.filter(resultHasHeartRate);
  const kcal = withWatch.length > 0 ? withWatch.reduce((sum, r) => sum + r.caloriesKcal, 0) : null;
  const activeSum = today.reduce((sum, r) => sum + (workoutIntensity(r.samples, hrMax)?.activeMinutes ?? 0), 0);
  return {
    kcal,
    activeMinutes: Math.round(activeSum * 10) / 10,
    dances: today.length,
    goalFraction: kcal === null ? 0 : Math.min(1, Math.max(0, kcal / DAILY_KCAL_GOAL)),
  };
}

/** Newest first by createdAtIso; kcal null without heart rate; intensity null when unknown. */
export function recentWorkouts(results: readonly SessionResult[], hrMax: number, limit: number = DEFAULT_RECENT_LIMIT): RecentWorkout[] {
  return [...results]
    .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
    .slice(0, limit)
    .map((r) => ({
      resultId: r.id,
      danceId: r.danceId,
      createdAtIso: r.createdAtIso,
      durationSec: r.durationSec,
      completed: r.completed,
      points: r.totalPoints,
      kcal: resultHasHeartRate(r) ? r.caloriesKcal : null,
      intensity: workoutIntensity(r.samples, hrMax)?.level ?? null,
    }));
}

/** Same day: "Today, 9:41 PM"; yesterday: "Yesterday, 6:02 PM"; else "Nov 20" (en-US). */
export function formatWorkoutDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameLocalDay(date, now)) return `Today, ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return `Yesterday, ${time}`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
