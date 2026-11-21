/**
 * Owner: Toufic
 * Purpose: Start second of the best-scoring window
 * FRs: FR-48 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ScoreSample } from "../types/pulse";
import { CONFIG } from "../config";

function safePoints(sample: ScoreSample): number {
  return Number.isFinite(sample.points) ? sample.points : 0;
}

function sumRange(ordered: readonly ScoreSample[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i += 1) {
    total += safePoints(ordered[i]);
  }
  return total;
}

/**
 * Finds the start timestamp (`tSec`) of the contiguous `[start, start + windowSec)`
 * scoring window with the highest total points, breaking ties by earliest timestamp.
 */
export function findBestWindowStartSec(
  samples: ScoreSample[],
  windowSec: number = CONFIG.clipLengthSec,
): number {
  if (samples.length === 0) {
    return 0;
  }

  let isSorted = true;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].tSec < samples[i - 1].tSec) {
      isSorted = false;
      break;
    }
  }
  const ordered = isSorted ? samples : [...samples].sort((a, b) => a.tSec - b.tSec);

  if (!Number.isFinite(windowSec) || windowSec <= 0) {
    return ordered[0].tSec;
  }

  let right = 0;
  let currentSum = 0;
  let bestSum = -Infinity;
  let bestStart = ordered[0].tSec;
  let bestLeft = 0;
  let bestRight = 0;

  for (let left = 0; left < ordered.length; left += 1) {
    if (right < left) {
      right = left;
      currentSum = 0;
    }

    const startT = ordered[left].tSec;
    const windowEnd = startT + windowSec;
    while (right < ordered.length && ordered[right].tSec < windowEnd) {
      currentSum += safePoints(ordered[right]);
      right += 1;
    }

    if (bestSum === -Infinity) {
      bestSum = currentSum;
      bestStart = startT;
      bestLeft = left;
      bestRight = right;
    } else if (currentSum > bestSum) {
      // Re-verify near-ties directly so floating-point subtraction drift cannot invert a tie.
      const verifyTol = 1e-9 * Math.max(1, Math.abs(bestSum), Math.abs(currentSum));
      if (currentSum - bestSum <= verifyTol) {
        const exactCurrent = sumRange(ordered, left, right);
        const exactBest = sumRange(ordered, bestLeft, bestRight);
        const tieTol = 1e-12 * Math.max(1, Math.abs(exactBest), Math.abs(exactCurrent));
        currentSum = exactCurrent;
        bestSum = exactBest;
        if (exactCurrent > exactBest + tieTol) {
          bestSum = exactCurrent;
          bestStart = startT;
          bestLeft = left;
          bestRight = right;
        }
      } else {
        bestSum = currentSum;
        bestStart = startT;
        bestLeft = left;
        bestRight = right;
      }
    }

    if (left + 1 >= right) {
      currentSum = 0;
      right = left + 1;
    } else {
      currentSum -= safePoints(ordered[left]);
    }
  }

  return bestStart;
}
