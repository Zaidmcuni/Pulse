/**
 * Owner: Toufic
 * Purpose: Select the highest-scoring highlight window (FR-48).
 * Contract: signature below is locked.
 */

import type { ScoreSample } from "../types/pulse";
import { CONFIG } from "../config";

/**
 * ScoreSample timestamps label the end of each elapsed second in a live session.
 * A series starting at tSec=0 already labels interval starts.
 */
export function findBestWindowStartSec(
  samples: ScoreSample[],
  windowSec: number = CONFIG.clipLengthSec,
): number {
  const ordered = samples.filter(({ tSec }) => Number.isSafeInteger(tSec) && tSec >= 0).sort((a, b) => a.tSec - b.tSec);
  if (ordered.length === 0) return 0;

  const firstStart = ordered[0].tSec;
  const offset = firstStart === 0 ? 0 : 1;
  if (!Number.isFinite(windowSec) || windowSec <= 0) return firstStart - offset;
  const endSec = ordered[ordered.length - 1].tSec + 1;
  const lastStart = Math.floor(endSec - windowSec);

  // A window's sum changes only when a sample enters or leaves it.
  const starts = new Set([firstStart]);
  for (const { tSec } of ordered) {
    for (const boundary of [Math.floor(tSec - windowSec) + 1, tSec + 1]) {
      if (boundary > firstStart && boundary <= lastStart) starts.add(boundary);
    }
  }
  let left = 0;
  let right = 0;
  let sum = 0;
  let bestSum = -Infinity;
  let bestStart = firstStart;
  const points = ({ points }: ScoreSample): number => Number.isFinite(points) ? points : 0;

  for (const start of [...starts].sort((a, b) => a - b)) {
    while (right < ordered.length && ordered[right].tSec < start + windowSec) {
      sum += points(ordered[right++]);
    }
    while (left < right && ordered[left].tSec < start) {
      sum -= points(ordered[left++]);
    }

    // Points are fractional. Preserve the earlier start when sums differ only by rounding.
    const tolerance = Number.EPSILON * ordered.length * Math.max(1, Math.abs(sum), Math.abs(bestSum));
    if (bestSum === -Infinity || sum - bestSum > tolerance) {
      bestStart = start;
      bestSum = sum;
    }
  }

  return bestStart - offset;
}
