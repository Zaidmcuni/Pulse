/**
 * Owner: Ali
 * Added by: Toufic (#144, song page)
 * Purpose: Workout labels and a rough calorie range for a dance, derived only from its file's difficulty, tempo and length (pure)
 * FRs: FR-09
 */

import type { Dance, Difficulty } from "../types/pulse";

/** A song at or above this tempo reads one intensity tier higher than its difficulty alone. */
export const FAST_TEMPO_BPM = 120;

export type IntensityTier = "light" | "steady" | "high";

const TIERS: readonly IntensityTier[] = ["light", "steady", "high"];

/** Deliberately not the heart-rate zone words (Easy/Moderate/Hard/Max) or the difficulty words. */
export const INTENSITY_LABELS: Record<IntensityTier, string> = {
  light: "Light cardio",
  steady: "Steady cardio",
  high: "High-energy cardio",
};

const BASE_TIER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

export function danceIntensity(dance: Pick<Dance, "difficulty" | "bpm">): IntensityTier {
  const fast = Number.isFinite(dance.bpm) && dance.bpm >= FAST_TEMPO_BPM;
  return TIERS[Math.min(BASE_TIER[dance.difficulty] + (fast ? 1 : 0), TIERS.length - 1)];
}

/**
 * Rough kcal per minute by tier, roughly Keytel at typical dancing heart rates for an average adult.
 * A guide only: a dancer's real estimate comes from their watch and profile (Description.md section 5).
 */
export const KCAL_PER_MIN_RANGE: Record<IntensityTier, readonly [number, number]> = {
  light: [5, 8],
  steady: [7, 10],
  high: [9, 12],
};

export interface KcalRange { minKcal: number; maxKcal: number }

/** Null when the length is missing or broken, so no "NaN kcal" ever reaches the screen. */
export function estimatedKcalRange(dance: Pick<Dance, "difficulty" | "bpm" | "lengthSec">): KcalRange | null {
  if (!Number.isFinite(dance.lengthSec) || dance.lengthSec <= 0) return null;
  const minutes = dance.lengthSec / 60;
  const [low, high] = KCAL_PER_MIN_RANGE[danceIntensity(dance)];
  const minKcal = Math.max(1, Math.round(low * minutes));
  return { minKcal, maxKcal: Math.max(minKcal, Math.round(high * minutes)) };
}

export function formatKcalRange({ minKcal, maxKcal }: KcalRange): string {
  return minKcal === maxKcal ? `~${minKcal} kcal est.` : `~${minKcal}–${maxKcal} kcal est.`;
}
