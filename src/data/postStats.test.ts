/**
 * Owner: Ali
 * Purpose: Average heart rate helper tests.
 * FRs: FR-38, FR-39
 * Edited: Toufic (#140)
 */
import { describe, expect, it } from "vitest";
import type { HeartRateSource, ScoreSample } from "../types/pulse";
import { computeAvgBpm } from "./postStats";

function sample(heartRate: number, hrSource: HeartRateSource = "ble"): ScoreSample {
  return { tSec: 0, heartRate, hrSource, effort: 0, accuracy: 0.8, points: 0 };
}

describe("computeAvgBpm", () => {
  it("rounds the mean of watch-measured seconds", () => {
    expect(computeAvgBpm({ samples: [sample(100), sample(101)] })).toBe(101);
    expect(computeAvgBpm({ samples: [sample(120), sample(130), sample(141)] })).toBe(130);
  });

  it("ignores simulated and no-watch seconds", () => {
    expect(computeAvgBpm({ samples: [sample(100), sample(180, "simulated"), sample(0, "none")] })).toBe(100);
    expect(computeAvgBpm({ samples: [sample(150, "simulated")] })).toBeNull();
  });

  it("ignores zero, negative and non-finite readings", () => {
    const samples = [sample(0), sample(-5), sample(NaN), sample(Infinity), sample(140)];
    expect(computeAvgBpm({ samples })).toBe(140);
    expect(computeAvgBpm({ samples: samples.slice(0, 4) })).toBeNull();
  });

  it("returns null for an empty session and leaves the input untouched", () => {
    expect(computeAvgBpm({ samples: [] })).toBeNull();
    const samples = [sample(110), sample(120)];
    const copy = structuredClone(samples);
    computeAvgBpm({ samples });
    expect(samples).toEqual(copy);
  });
});
