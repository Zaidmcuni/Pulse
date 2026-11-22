/**
 * Owner: Mohamed
 * Purpose: unit tests for workout intensity.
 * FRs: FR-29, FR-35
 */

import { describe, expect, it } from "vitest";
import type { HeartRateSource, ScoreSample } from "../types/pulse";
import { workoutIntensity, zoneFor } from "./intensity";

const HR_MAX = 194;

function sample(tSec: number, heartRate: number, hrSource: HeartRateSource = "ble"): ScoreSample {
  return { tSec, heartRate, hrSource, effort: 0, accuracy: 0.5, points: 0 };
}

function run(bpms: number[], hrSource: HeartRateSource = "ble"): ScoreSample[] {
  return bpms.map((bpm, i) => sample(i, bpm, hrSource));
}

describe("zoneFor", () => {
  it("uses the %HRmax boundaries with >=", () => {
    expect(zoneFor(116, HR_MAX)).toBe("easy");      // 59.8%
    expect(zoneFor(117, HR_MAX)).toBe("moderate");  // 60.3%
    expect(zoneFor(135, HR_MAX)).toBe("moderate");  // 69.6%
    expect(zoneFor(136, HR_MAX)).toBe("hard");      // 70.1%
    expect(zoneFor(164, HR_MAX)).toBe("hard");      // 84.5%
    expect(zoneFor(165, HR_MAX)).toBe("max");       // 85.1%
    expect(zoneFor(60, 100)).toBe("moderate");      // exactly 60%
    expect(zoneFor(70, 100)).toBe("hard");          // exactly 70%
    expect(zoneFor(85, 100)).toBe("max");           // exactly 85%
  });
});

describe("workoutIntensity", () => {
  it("rates a steady 60 s at 150 bpm as hard", () => {
    const samples = run(Array<number>(60).fill(150));
    const before = structuredClone(samples);
    expect(workoutIntensity(samples, HR_MAX)).toEqual({
      level: "hard",
      secondsInZone: { easy: 0, moderate: 0, hard: 60, max: 0 },
      measuredSec: 60,
      avgBpm: 150,
      peakBpm: 150,
      activeMinutes: 1.0,
    });
    expect(samples).toEqual(before);
  });

  it("rates 30 s easy + 30 s max as max", () => {
    const result = workoutIntensity(run([...Array<number>(30).fill(100), ...Array<number>(30).fill(180)]), HR_MAX);
    expect(result?.level).toBe("max");
    expect(result?.secondsInZone).toEqual({ easy: 30, moderate: 0, hard: 0, max: 30 });
    expect(result?.avgBpm).toBe(140);
    expect(result?.peakBpm).toBe(180);
    expect(result?.activeMinutes).toBe(0.5);
  });

  it("applies the level rule in order", () => {
    // 10% max, 30% hard: hard + max = 40% -> hard
    expect(workoutIntensity(run([...Array<number>(6).fill(100), ...Array<number>(3).fill(150), 180]), HR_MAX)?.level).toBe("hard");
    // 50% moderate -> moderate
    expect(workoutIntensity(run([...Array<number>(5).fill(100), ...Array<number>(5).fill(125)]), HR_MAX)?.level).toBe("moderate");
    // 40% moderate -> easy
    expect(workoutIntensity(run([...Array<number>(6).fill(100), ...Array<number>(4).fill(125)]), HR_MAX)?.level).toBe("easy");
  });

  it("is null without a watch", () => {
    expect(workoutIntensity(run(Array<number>(60).fill(0), "none"), HR_MAX)).toBeNull();
  });

  it("is null with fewer than 10 measured seconds", () => {
    expect(workoutIntensity(run(Array<number>(9).fill(150)), HR_MAX)).toBeNull();
    expect(workoutIntensity(run(Array<number>(10).fill(150)), HR_MAX)).not.toBeNull();
  });

  it("does not count watch seconds with heartRate 0", () => {
    const samples = [...run(Array<number>(9).fill(150)), ...run(Array<number>(20).fill(0))];
    expect(workoutIntensity(samples, HR_MAX)).toBeNull();
    const result = workoutIntensity([...samples, sample(99, 150)], HR_MAX);
    expect(result?.measuredSec).toBe(10);
    expect(result?.avgBpm).toBe(150);
  });

  it("is null when hrMax <= 0", () => {
    expect(workoutIntensity(run(Array<number>(60).fill(150)), 0)).toBeNull();
  });
});
