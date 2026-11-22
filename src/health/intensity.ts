/**
 * Owner: Mohamed
 * Purpose: workout intensity level (Easy / Moderate / Hard / Max) from a session's heart-rate samples.
 * FRs: FR-29, FR-35
 * Pure: inputs are never mutated.
 */

import type { ScoreSample } from "../types/pulse";

export type IntensityZone = "easy" | "moderate" | "hard" | "max";

export const ZONE_ORDER: readonly IntensityZone[] = ["easy", "moderate", "hard", "max"];

export const ZONE_LABELS: Record<IntensityZone, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  max: "Max",
};

/** Share of HRmax where each zone starts: the standard %HRmax training zones. */
export const ZONE_BOUNDS = { moderate: 0.60, hard: 0.70, max: 0.85 } as const;

/** Share of measured seconds needed for each workout level (task 21 level rule). */
const LEVEL_SHARES = { max: 0.2, hard: 0.4, moderate: 0.5 } as const;

/** Below this many measured seconds there is too little data for a level. */
const MIN_MEASURED_SEC = 10;

export interface WorkoutIntensity {
  level: IntensityZone;
  secondsInZone: Record<IntensityZone, number>;
  measuredSec: number;          // seconds with hrSource "ble" and heartRate > 0
  avgBpm: number;               // rounded, over measured seconds
  peakBpm: number;
  activeMinutes: number;        // (moderate + hard + max seconds) / 60, 1 decimal
}

export function zoneFor(bpm: number, hrMax: number): IntensityZone {
  const share = bpm / hrMax;
  if (share >= ZONE_BOUNDS.max) return "max";
  if (share >= ZONE_BOUNDS.hard) return "hard";
  if (share >= ZONE_BOUNDS.moderate) return "moderate";
  return "easy";
}

/** null when hrMax <= 0 or fewer than 10 seconds were measured by a watch. */
export function workoutIntensity(samples: readonly ScoreSample[], hrMax: number): WorkoutIntensity | null {
  if (!(hrMax > 0)) return null;
  const measured = samples.filter((s) => s.hrSource === "ble" && s.heartRate > 0).map((s) => s.heartRate);
  if (measured.length < MIN_MEASURED_SEC) return null;

  const secondsInZone: Record<IntensityZone, number> = { easy: 0, moderate: 0, hard: 0, max: 0 };
  for (const bpm of measured) secondsInZone[zoneFor(bpm, hrMax)] += 1;

  const measuredSec = measured.length;
  const share = (sec: number): number => sec / measuredSec;
  const { moderate, hard, max } = secondsInZone;
  let level: IntensityZone = "easy";
  if (share(max) >= LEVEL_SHARES.max) level = "max";
  else if (share(hard + max) >= LEVEL_SHARES.hard) level = "hard";
  else if (share(moderate + hard + max) >= LEVEL_SHARES.moderate) level = "moderate";

  return {
    level,
    secondsInZone,
    measuredSec,
    avgBpm: Math.round(measured.reduce((sum, bpm) => sum + bpm, 0) / measuredSec),
    peakBpm: Math.max(...measured),
    activeMinutes: Math.round(((moderate + hard + max) / 60) * 10) / 10,
  };
}
