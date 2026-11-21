/**
 * Owner: Zaid
 * Purpose: Reject frames where the body center jumps (someone walking behind)
 * FRs: FR-22 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { CONFIG, LM } from "../config";
import type { BackgroundLock, LandmarkPoint } from "../types/pulse";

// Absorbs IEEE-754 rounding error at exact boundary shifts (e.g. 0.55 - 0.20 = 0.35000000000000003)
const JUMP_EPS = 1e-12;
const TORSO_INDICES = [LM.lHip, LM.rHip, LM.lShoulder, LM.rShoulder] as const;

function isUsable(pt: LandmarkPoint | undefined, minVis: number): pt is LandmarkPoint {
  return Boolean(pt && Number.isFinite(pt.x) && Number.isFinite(pt.v) && pt.v >= minVis);
}

function averageXWithMinVis(points: readonly LandmarkPoint[], minVis: number, inclusive: boolean): number | null {
  let sumX = 0;
  let count = 0;

  for (let i = 0; i < TORSO_INDICES.length; i++) {
    const pt = points[TORSO_INDICES[i]];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.v)) continue;
    if (inclusive ? pt.v >= minVis : pt.v > minVis) {
      sumX += pt.x;
      count++;
    }
  }

  return count > 0 ? sumX / count : null;
}

/** Computes normalized horizontal torso center using hips first, then seated-safe shoulder fallback. */
export function computeTorsoCenterX(points: readonly LandmarkPoint[]): number | null {
  const minVis = CONFIG.visibilityMin;

  const lHip = points[LM.lHip];
  const rHip = points[LM.rHip];
  if (isUsable(lHip, minVis) && isUsable(rHip, minVis)) {
    return (lHip.x + rHip.x) / 2;
  }

  const lShoulder = points[LM.lShoulder];
  const rShoulder = points[LM.rShoulder];
  if (isUsable(lShoulder, minVis) && isUsable(rShoulder, minVis)) {
    return (lShoulder.x + rShoulder.x) / 2;
  }

  const confidentAvg = averageXWithMinVis(points, minVis, true);
  if (confidentAvg !== null) {
    return confidentAvg;
  }

  return averageXWithMinVis(points, 0, false);
}

export function createBackgroundLock(maxJumpRatio: number = CONFIG.backgroundJump): BackgroundLock {
  let lastCenterX: number | null = null;

  return {
    accept(points: LandmarkPoint[]): boolean {
      const cx = computeTorsoCenterX(points);
      if (cx === null) {
        return true;
      }

      if (lastCenterX === null) {
        lastCenterX = cx;
        return true;
      }

      if (Math.abs(cx - lastCenterX) > maxJumpRatio + JUMP_EPS) {
        return false;
      }

      lastCenterX = cx;
      return true;
    },

    reset(): void {
      lastCenterX = null;
    },
  };
}
