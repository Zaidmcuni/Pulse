/**
 * Owner: Mohamed
 * Purpose: TRIMP effort, points, Keytel calories (pure functions)
 * FRs: FR-29, FR-30, FR-32
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { PlayerProfile } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

/** p.hrMaxOverride ?? 208 - 0.7 * age */
export function maxHeartRate(p: PlayerProfile): number {
  void p;
  return todo("maxHeartRate");
}

/** x = clamp((bpm - restingHr) / (HRmax - restingHr), 0, 1); TRIMP: male x*0.64*e^(1.92x), female x*0.86*e^(1.67x), other = average of coefficients. */
export function effortPerSecond(bpm: number, p: PlayerProfile): number {
  void bpm; void p;
  return todo("effortPerSecond");
}

/** CONFIG.pointsScale * effort * (CONFIG.pointsAccFloor + (1 - CONFIG.pointsAccFloor) * acc) */
export function pointsDelta(effort: number, acc: number): number {
  void effort; void acc;
  return todo("pointsDelta");
}

/** Keytel kcal/min; "other" = average of male and female. */
export function kcalPerMinute(bpm: number, p: PlayerProfile): number {
  void bpm; void p;
  return todo("kcalPerMinute");
}
