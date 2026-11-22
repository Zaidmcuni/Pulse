/**
 * Owner: Ali
 * Added by: Toufic (#144)
 * Purpose: Intensity tier from difficulty and tempo
 * FRs: FR-09
 */

import { describe, expect, it } from "vitest";
import { danceIntensity, FAST_TEMPO_BPM, INTENSITY_LABELS } from "./danceWorkoutMeta";

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
