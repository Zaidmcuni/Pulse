/**
 * Owner: Toufic
 * Purpose: Unit tests for best highlight window selection (FR-48)
 */

import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import type { ScoreSample } from "../types/pulse";
import { findBestWindowStartSec } from "./bestWindow";

function makeSample(tSec: number, points: number): ScoreSample {
  return {
    tSec,
    heartRate: 120,
    hrSource: "simulated",
    effort: 0.7,
    accuracy: 0.8,
    points,
  };
}

describe("findBestWindowStartSec", () => {
  it("returns 0 when samples is empty", () => {
    expect(findBestWindowStartSec([])).toBe(0);
  });

  it("finds the highest-scoring 15s peak window in a 30s dance using CONFIG.clipLengthSec", () => {
    const samples = Array.from({ length: 30 }, (_, t) => {
      const inPeak = t >= 10 && t < 25;
      return makeSample(t, inPeak ? 50 : 10);
    });

    expect(CONFIG.clipLengthSec).toBe(15);
    expect(findBestWindowStartSec(samples)).toBe(10);
  });

  it("uses half-open [start, start + windowSec) bounds so t = 15 is excluded from t = 0..14", () => {
    // Window [0, 15) has 15 * 10 = 150; window [1, 16) has 14 * 10 + 25 = 165.
    const samples = Array.from({ length: 16 }, (_, t) => makeSample(t, t === 15 ? 25 : 10));
    expect(findBestWindowStartSec(samples)).toBe(1);

    // Conversely, if t = 0 has 30 and t = 15 has 25: [0, 15) = 170 vs [1, 16) = 165.
    const frontLoaded = Array.from({ length: 16 }, (_, t) => {
      if (t === 0) return makeSample(t, 30);
      if (t === 15) return makeSample(t, 25);
      return makeSample(t, 10);
    });
    expect(findBestWindowStartSec(frontLoaded)).toBe(0);
  });

  it("breaks exact ties by returning the earliest start second, even with decimal floating-point points", () => {
    const integerTie = Array.from({ length: 40 }, (_, t) => {
      const peakA = t >= 2 && t < 17;
      const peakB = t >= 22 && t < 37;
      return makeSample(t, peakA || peakB ? 40 : 5);
    });
    expect(findBestWindowStartSec(integerTie)).toBe(2);

    // Classic IEEE-754 drift case: 0.3 + 0.2 + 0.1 === 0.6 vs 0.1 + 0.2 + 0.3 === 0.6000000000000001.
    const decimalTie = [
      makeSample(0, 0.3),
      makeSample(1, 0.2),
      makeSample(2, 0.1),
      makeSample(3, 0.05),
      makeSample(4, 0.05),
      makeSample(5, 0.1),
      makeSample(6, 0.2),
      makeSample(7, 0.3),
    ];
    expect(findBestWindowStartSec(decimalTie, 3)).toBe(0);
  });

  it("returns the first sample timestamp for short dances shorter than windowSec", () => {
    const shortFromZero = Array.from({ length: 8 }, (_, t) => makeSample(t, t === 7 ? 100 : 10));
    expect(findBestWindowStartSec(shortFromZero)).toBe(0);

    const shortOffset = [makeSample(4, 15), makeSample(5, 20), makeSample(6, 25)];
    expect(findBestWindowStartSec(shortOffset)).toBe(4);
  });

  it("handles unsorted input without mutating the caller array", () => {
    const unsorted = [
      makeSample(20, 5),
      makeSample(5, 20),
      makeSample(0, 5),
      makeSample(10, 50),
      makeSample(15, 50),
      makeSample(2, 5),
    ];
    const snapshot = unsorted.map((s) => ({ ...s }));

    expect(findBestWindowStartSec(unsorted, 10)).toBe(10);
    expect(unsorted).toEqual(snapshot);
  });

  it("uses actual tSec timestamps across gaps (e.g., pause) rather than array indices", () => {
    // Index-wise [0..4] looks like 5 samples, but tSec has a gap from t=2 to t=20.
    // Under windowSec=10: [0, 10) has 20+20+20 = 60; [20, 30) has 35+35+35 = 105.
    const gapped = [
      makeSample(0, 20),
      makeSample(1, 20),
      makeSample(2, 20),
      makeSample(20, 35),
      makeSample(21, 35),
      makeSample(22, 35),
    ];

    expect(findBestWindowStartSec(gapped, 10)).toBe(20);
  });

  it("supports custom windowSec overrides, treats non-finite points as 0, and handles invalid windowSec", () => {
    const samples = [
      makeSample(0, 10),
      makeSample(1, Number.NaN),
      makeSample(2, Number.POSITIVE_INFINITY),
      makeSample(3, 25),
      makeSample(4, 25),
      makeSample(5, 10),
    ];

    expect(findBestWindowStartSec(samples, 2)).toBe(3);
    expect(findBestWindowStartSec(samples, 0)).toBe(0);
    expect(findBestWindowStartSec(samples, -5)).toBe(0);
    expect(findBestWindowStartSec(samples, Number.NaN)).toBe(0);
  });
});
