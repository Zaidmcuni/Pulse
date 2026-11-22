/**
 * Owner: Mohamed
 * Purpose: TRIMP effort, points, Keytel calories (pure functions)
 * FRs: FR-29, FR-30, FR-32
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { PlayerProfile, Sex } from "../types/pulse";
import { CONFIG } from "../config";

// Published physiology formulas, not tuning numbers (so not in CONFIG).

// Tanaka et al. age-predicted HRmax: 208 - 0.7 × age.
const HRMAX_INTERCEPT_BPM = 208;
const HRMAX_AGE_SLOPE = 0.7;

// Banister TRIMP weighting coefficients (a, b): a * x * e^(b * x). "other" = average.
const TRIMP_COEFFS: Record<Sex, { a: number; b: number }> = {
  male: { a: 0.64, b: 1.92 },
  female: { a: 0.86, b: 1.67 },
  other: { a: (0.64 + 0.86) / 2, b: (1.92 + 1.67) / 2 },
};

// Keytel et al. 2005 energy expenditure without VO2max (kJ/min), divided by kJ per kcal.
const KEYTEL_MALE = { intercept: -55.0969, hr: 0.6309, weightKg: 0.1988, age: 0.2017 };
const KEYTEL_FEMALE = { intercept: -20.4022, hr: 0.4472, weightKg: -0.1263, age: 0.074 };
const KJ_PER_KCAL = 4.184;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** p.hrMaxOverride ?? 208 - 0.7 * age */
export function maxHeartRate(p: PlayerProfile): number {
  return p.hrMaxOverride ?? HRMAX_INTERCEPT_BPM - HRMAX_AGE_SLOPE * p.age;
}

/** x = clamp((bpm - restingHr) / (HRmax - restingHr), 0, 1); TRIMP: male x*0.64*e^(1.92x), female x*0.86*e^(1.67x), other = average of coefficients. */
export function effortPerSecond(bpm: number, p: PlayerProfile): number {
  const rangeBpm = maxHeartRate(p) - p.restingHr;
  if (!(rangeBpm > 0)) return 0;
  // Non-finite or negative bpm counts as resting (FR-29).
  if (!Number.isFinite(bpm) || bpm < 0) return 0;
  const x = clamp((bpm - p.restingHr) / rangeBpm, 0, 1);
  const { a, b } = TRIMP_COEFFS[p.sex];
  return x * a * Math.exp(b * x);
}

/** CONFIG.pointsScale * effort * (CONFIG.pointsAccFloor + (1 - CONFIG.pointsAccFloor) * acc) */
export function pointsDelta(effort: number, acc: number): number {
  // #112: accuracy ramp (same as accuracyRamp in accuracy.ts), so points separate good moves from random ones.
  const { from, to } = CONFIG.pointsAccRamp;
  const accFactor = CONFIG.pointsAccFloor + (1 - CONFIG.pointsAccFloor) * clamp((acc - from) / (to - from), 0, 1);
  return CONFIG.pointsScale * effort * accFactor;
}

function keytel(c: typeof KEYTEL_MALE, bpm: number, p: PlayerProfile): number {
  return (c.intercept + c.hr * bpm + c.weightKg * p.weightKg + c.age * p.age) / KJ_PER_KCAL;
}

/** Keytel kcal/min; "other" = average of male and female. */
export function kcalPerMinute(bpm: number, p: PlayerProfile): number {
  const male = keytel(KEYTEL_MALE, bpm, p);
  const female = keytel(KEYTEL_FEMALE, bpm, p);
  const kcal = p.sex === "male" ? male : p.sex === "female" ? female : (male + female) / 2;
  // Low heart rates give negative values (FR-32).
  return Math.max(0, kcal);
}
