/**
 * Owner: Ali
 * Added by: Toufic (#144)
 * Purpose: Intensity tier from difficulty and tempo; rough calorie range from length and tier
 * FRs: FR-09
 */

import { describe, expect, it } from "vitest";
import { danceIntensity, estimatedKcalRange, FAST_TEMPO_BPM, formatKcalRange, INTENSITY_LABELS } from "./danceWorkoutMeta";

describe("danceIntensity", () => {
  it("maps difficulty to a tier at an everyday tempo", () => {
    expect(danceIntensity({ difficulty: "easy", bpm: 98 })).toBe("light");
    expect(danceIntensity({ difficulty: "medium", bpm: 99 })).toBe("steady");
    expect(danceIntensity({ difficulty: "hard", bpm: 100 })).toBe("high");
  });

  it("moves a fast song up one tier, capped at high", () => {
    expect(danceIntensity({ difficulty: "easy", bpm: FAST_TEMPO_BPM })).toBe("steady");
    expect(danceIntensity({ difficulty: "medium", bpm: 130 })).toBe("high");
    expect(danceIntensity({ difficulty: "hard", bpm: 129 })).toBe("high");
  });

  it("ignores a missing or broken tempo", () => {
    for (const bpm of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(danceIntensity({ difficulty: "easy", bpm })).toBe("light");
    }
  });

  it("labels tiers without zone or difficulty words", () => {
    expect(Object.values(INTENSITY_LABELS)).toEqual(["Light cardio", "Steady cardio", "High-energy cardio"]);
  });
});

describe("estimatedKcalRange", () => {
  it("gives a rough range for the real songs", () => {
    expect(estimatedKcalRange({ difficulty: "easy", bpm: 98, lengthSec: 186.36 })).toEqual({ minKcal: 16, maxKcal: 25 });
    expect(estimatedKcalRange({ difficulty: "medium", bpm: 130, lengthSec: 269.25 })).toEqual({ minKcal: 40, maxKcal: 54 });
  });

  it("scales with length and keeps min at or below max", () => {
    const short = estimatedKcalRange({ difficulty: "medium", bpm: 99, lengthSec: 60 })!;
    const long = estimatedKcalRange({ difficulty: "medium", bpm: 99, lengthSec: 240 })!;
    expect(long.minKcal).toBeGreaterThan(short.minKcal);
    for (const range of [short, long]) expect(range.minKcal).toBeLessThanOrEqual(range.maxKcal);
  });

  it("never shows zero for a very short song", () => {
    const range = estimatedKcalRange({ difficulty: "easy", bpm: 90, lengthSec: 5 })!;
    expect(range.minKcal).toBeGreaterThanOrEqual(1);
    expect(range.minKcal).toBeLessThanOrEqual(range.maxKcal);
  });

  it("returns null for a missing or broken length", () => {
    for (const lengthSec of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(estimatedKcalRange({ difficulty: "easy", bpm: 98, lengthSec })).toBeNull();
    }
  });

  it("labels the range as an estimate", () => {
    expect(formatKcalRange({ minKcal: 16, maxKcal: 25 })).toBe("~16–25 kcal est.");
    expect(formatKcalRange({ minKcal: 1, maxKcal: 1 })).toBe("~1 kcal est.");
  });
});
