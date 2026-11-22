/**
 * Owner: Ali
 * Added by: Toufic (#144)
 * Purpose: Workout labels for a dance, derived only from its file's difficulty and tempo (pure)
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
