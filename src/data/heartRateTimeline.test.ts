/**
 * Owner: Ali
 * Written: Toufic (UI sprint, #142)
 * Purpose: unit tests for the Results heart-rate curve and accuracy fallback data.
 * FRs: FR-29, FR-35
 */

import { describe, expect, it } from "vitest";
import type { HeartRateSource, ScoreSample } from "../types/pulse";
import { accuracyTimeline, heartRateTimeline, toPolylinePoints, toY, zoneBands } from "./heartRateTimeline";

function sample(tSec: number, heartRate: number, hrSource: HeartRateSource = "ble", accuracy = 0.5): ScoreSample {
  return { tSec, heartRate, hrSource, effort: 0, accuracy, points: 0 };
}

describe("heartRateTimeline", () => {
  it("keeps only watch readings and splits the line where the watch dropped", () => {
    const samples = [
      sample(0, 100), sample(1, 110),
      sample(2, 0),                    // watch gave no reading
      sample(3, 120), sample(4, 130),
      sample(5, 125, "simulated"),     // not a watch reading
      sample(6, 140), sample(7, 150),
    ];
    const timeline = heartRateTimeline(samples, 8)!;
    expect(timeline.segments.map((seg) => seg.map((p) => p.tSec))).toEqual([[0, 1], [3, 4], [6, 7]]);
    expect(timeline.minValue).toBe(100);
    expect(timeline.maxValue).toBe(150);
    expect(timeline.peak).toEqual({ tSec: 7, value: 150 });
    expect(timeline.durationSec).toBe(8);
  });

  it("splits where seconds are missing", () => {
    const timeline = heartRateTimeline([sample(0, 100), sample(1, 101), sample(5, 120), sample(6, 121)], 10)!;
    expect(timeline.segments).toHaveLength(2);
  });

  it("widens a lone reading into a short visible line", () => {
    const timeline = heartRateTimeline([sample(0, 100), sample(1, 110), sample(2, 0), sample(3, 120)], 4)!;
    expect(timeline.segments[1]).toEqual([{ tSec: 2.5, value: 120 }, { tSec: 3.5, value: 120 }]);
  });

  it("returns null with fewer than two watch readings", () => {
    expect(heartRateTimeline([], 10)).toBeNull();
    expect(heartRateTimeline([sample(0, 120)], 10)).toBeNull();
    expect(heartRateTimeline([sample(0, 120, "simulated"), sample(1, 121, "simulated")], 10)).toBeNull();
    expect(heartRateTimeline([sample(0, 0, "none"), sample(1, 0, "none")], 10)).toBeNull();
  });

  it("pads a flat heart rate so the axis never collapses", () => {
    const timeline = heartRateTimeline([sample(0, 120), sample(1, 120), sample(2, 120)], 3)!;
    expect(timeline.minValue).toBe(115);
    expect(timeline.maxValue).toBe(125);
    const points = toPolylinePoints(timeline.segments[0], timeline, 320, 96);
    expect(points).toBe("0,48 106.67,48 213.33,48");
    expect(points).not.toContain("NaN");
  });
});

describe("accuracyTimeline", () => {
  it("plots accuracy as 0..100% on a fixed axis, including watch-less seconds", () => {
    const timeline = accuracyTimeline([sample(1, 0, "none", 0.5), sample(2, 0, "none", 0.9), sample(3, 0, "none", 0.7)], 3)!;
    expect(timeline.minValue).toBe(0);
    expect(timeline.maxValue).toBe(100);
    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].map((p) => p.value)).toEqual([50, 90, 70]);
    expect(timeline.peak).toEqual({ tSec: 2, value: 90 });
  });

  it("returns null with fewer than two samples", () => {
    expect(accuracyTimeline([], 10)).toBeNull();
    expect(accuracyTimeline([sample(0, 0, "none", 0.8)], 10)).toBeNull();
  });

  it("draws a flat accuracy line without NaN", () => {
    const timeline = accuracyTimeline([sample(0, 0, "none", 0.74), sample(1, 0, "none", 0.74)], 2)!;
    expect(toPolylinePoints(timeline.segments[0], timeline, 320, 100)).toBe("0,26 160,26");
  });
});

describe("zoneBands", () => {
  // hrMax 200: moderate from 120, hard from 140, max from 170 (intensity.ts bounds 0.60 / 0.70 / 0.85)
  const timeline = heartRateTimeline([sample(0, 110), sample(1, 150)], 2)!;

  it("clips the four effort zones to the axis and drops zones outside it", () => {
    expect(zoneBands(timeline, 200)).toEqual([
      { zone: "easy", fromValue: 110, toValue: 120 },
      { zone: "moderate", fromValue: 120, toValue: 140 },
      { zone: "hard", fromValue: 140, toValue: 150 },
    ]);
  });

  it("returns no bands without a usable HRmax", () => {
    expect(zoneBands(timeline, 0)).toEqual([]);
    expect(zoneBands(timeline, Number.NaN)).toEqual([]);
  });

  it("maps values to y with the top of the axis at 0", () => {
    expect(toY(150, timeline, 96)).toBe(0);
    expect(toY(110, timeline, 96)).toBe(96);
  });
});
