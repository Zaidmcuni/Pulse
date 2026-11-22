/**
 * Owner: Mohamed
 * Purpose: Starting heart rate (pre-dance baseline) from the readings taken on the get-ready screen (pure)
 * FRs: FR-29, FR-06, FR-08
 */

import type { HrReading, PlayerProfile } from "../types/pulse";
import { maxHeartRate } from "../scoring/effort";

// Demo tuning, decided on 2026-11-21; not in CONFIG to avoid a shared-file change.
export const BASELINE_WINDOW_SEC = 10;    // rolling window of readings on the get-ready screen
export const BASELINE_TIMEOUT_SEC = 15;   // no usable readings this long after opening -> profile value
export const BASELINE_MIN_READINGS = 3;
export const BASELINE_MIN_BPM = 40;
export const BASELINE_HEADROOM_BPM = 30;  // baseline <= HRmax - 30

export type BaselineSource = "measured" | "profile";
export interface Baseline { bpm: number; source: BaselineSource; readings: number }

/** Median of readings with startMs <= atMs <= endMs; clamped; profile.restingHr if fewer than 3. */
export function computeBaseline(
  readings: readonly HrReading[], startMs: number, endMs: number, profile: PlayerProfile,
): Baseline {
  const bpms = readings
    .filter((r) => r.atMs >= startMs && r.atMs <= endMs && Number.isFinite(r.bpm) && r.bpm > 0)
    .map((r) => r.bpm)
    .sort((a, b) => a - b);
  const n = bpms.length;
  if (n < BASELINE_MIN_READINGS) return { bpm: profile.restingHr, source: "profile", readings: n };

  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? bpms[mid] : Math.round((bpms[mid - 1] + bpms[mid]) / 2);
  // Headroom keeps effort able to rise even if the dancer arrives out of breath.
  const hi = Math.max(BASELINE_MIN_BPM, maxHeartRate(profile) - BASELINE_HEADROOM_BPM);
  const bpm = Math.min(hi, Math.max(BASELINE_MIN_BPM, median));
  return { bpm, source: "measured", readings: n };
}
