/**
 * Owner: Ali
 * Purpose: Shareable workout stats derived from a saved result (pure).
 * FRs: FR-38, FR-39
 * Edited: Toufic (#140, average heart rate for opt-in posts; also used by Results)
 */

import type { SessionResult } from "../types/pulse";

/**
 * Rounded mean BPM over the seconds a watch measured (hrSource "ble", finite heartRate > 0).
 * null when no second was measured, so callers never show "0 bpm".
 * Same filter and rounding as workoutIntensity().avgBpm, without its 10 s minimum.
 */
export function computeAvgBpm(result: Pick<SessionResult, "samples">): number | null {
  const measured = result.samples
    .filter((s) => s.hrSource === "ble" && Number.isFinite(s.heartRate) && s.heartRate > 0)
    .map((s) => s.heartRate);
  if (measured.length === 0) return null;
  return Math.round(measured.reduce((sum, bpm) => sum + bpm, 0) / measured.length);
}
