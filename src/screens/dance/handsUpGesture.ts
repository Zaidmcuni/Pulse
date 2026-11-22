/**
 * Owner: Mohamed
 * Purpose: hands-free start on Get Ready: detect "both hands above the head" and how long it's held
 * FRs: FR-23 (start when ready), NFR-07 (usable from 2–3 m, keyboard out of reach)
 */

import { CONFIG, LM } from "../../config";
import type { LandmarkPoint } from "../../types/pulse";

// UI gesture timing, not a scoring threshold: how long both hands stay up to start the dance.
export const HANDS_UP_START_MS = 1500;
// Wrists must clear the shoulders by this share of the shoulder width (roughly the head's height),
// so ordinary arm raises at shoulder level don't count.
const OVERHEAD_MARGIN_OF_SHOULDER_SPAN = 0.75;

/**
 * True when both wrists are clearly above both shoulders. `points` are the 12 scored landmarks
 * (normalized 0..1, y down); `aspect` is video width / height so x and y distances compare in pixels.
 */
export function handsOverhead(points: readonly LandmarkPoint[], aspect: number): boolean {
  const ls = points[LM.lShoulder];
  const rs = points[LM.rShoulder];
  const lw = points[LM.lWrist];
  const rw = points[LM.rWrist];
  if (!ls || !rs || !lw || !rw) return false;
  if ([ls, rs, lw, rw].some((p) => p.v < CONFIG.visibilityMin)) return false;
  const spanInHeights = Math.abs(ls.x - rs.x) * aspect;
  if (spanInHeights <= 0) return false;
  const shoulderTop = Math.min(ls.y, rs.y);
  const margin = OVERHEAD_MARGIN_OF_SHOULDER_SPAN * spanInHeights;
  return lw.y < shoulderTop - margin && rw.y < shoulderTop - margin;
}

/** When the current hold started: kept while active, started now when it begins, cleared when it stops. */
export function holdSince(since: number | null, active: boolean, nowMs: number): number | null {
  if (!active) return null;
  return since ?? nowMs;
}

/** 0..1 progress of a hold. */
export function holdFraction(since: number | null, nowMs: number, holdMs: number = HANDS_UP_START_MS): number {
  if (since === null) return 0;
  return Math.min(1, Math.max(0, (nowMs - since) / holdMs));
}
