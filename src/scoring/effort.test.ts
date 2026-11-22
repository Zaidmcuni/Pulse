/**
 * Owner: Mohamed
 * Purpose: unit tests for effort.ts. Contract goldens live in src/contracts/contracts.test.ts; add your own cases here.
 */
import { describe, expect, it } from "vitest";
import type { PlayerProfile, Sex } from "../types/pulse";
import { CONFIG } from "../config";
import { effortPerSecond, kcalPerMinute, maxHeartRate, pointsDelta } from "./effort";

const base: PlayerProfile = {
  id: "t", handle: "t", displayName: "T", age: 20, sex: "male", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};
const withSex = (sex: Sex, extra: Partial<PlayerProfile> = {}): PlayerProfile => ({ ...base, sex, ...extra });

describe("maxHeartRate (FR-29)", () => {
  it("uses 208 - 0.7 × age", () => {
    expect(maxHeartRate(base)).toBeCloseTo(194, 5);
  });
  it("uses the override, including 0 (??, not ||)", () => {
    expect(maxHeartRate({ ...base, hrMaxOverride: 190 })).toBe(190);
    expect(maxHeartRate({ ...base, hrMaxOverride: 0 })).toBe(0);
  });
});

describe("effortPerSecond (FR-29)", () => {
  it("at x = 0.5 per sex", () => {
    expect(effortPerSecond(129.5, withSex("male"))).toBeCloseTo(0.835743, 5);
    expect(effortPerSecond(129.5, withSex("female"))).toBeCloseTo(0.99107, 5);
    expect(effortPerSecond(129.5, withSex("other"))).toBeCloseTo(0.920048, 5);
  });
  it("caps at HRmax", () => {
    for (const bpm of [194, 220]) {
      expect(effortPerSecond(bpm, withSex("male"))).toBeCloseTo(4.365413, 5);
      expect(effortPerSecond(bpm, withSex("female"))).toBeCloseTo(4.568464, 5);
    }
  });
  it("is 0 at or below resting and for NaN", () => {
    expect(effortPerSecond(65, base)).toBe(0);
    expect(effortPerSecond(50, base)).toBe(0);
    expect(effortPerSecond(Number.NaN, base)).toBe(0);
  });
  it("is 0 when HRmax <= resting", () => {
    const e = effortPerSecond(120, { ...base, hrMaxOverride: 60 });
    expect(e).toBe(0);
    expect(Number.isFinite(e)).toBe(true);
  });
  it("is monotonic in bpm for each sex", () => {
    for (const sex of ["male", "female", "other"] as const) {
      const p = withSex(sex);
      expect(effortPerSecond(100, p)).toBeLessThan(effortPerSecond(130, p));
      expect(effortPerSecond(130, p)).toBeLessThan(effortPerSecond(160, p));
    }
  });
});

describe("pointsDelta (FR-30)", () => {
  it("scales effort between the floor and 1 along the accuracy ramp (#112)", () => {
    // Halfway along the ramp: ramp = 0.5 -> scale x effort x (floor + (1 - floor) x 0.5)
    const { pointsScale: scale, pointsAccFloor: floor, pointsAccRamp: { from, to } } = CONFIG;
    expect(pointsDelta(0.5, (from + to) / 2)).toBeCloseTo(scale * 0.5 * (floor + (1 - floor) * 0.5), 5);
    expect(pointsDelta(1, from)).toBeCloseTo(scale * floor, 5);
    expect(pointsDelta(1, to)).toBeCloseTo(scale, 5);
    expect(pointsDelta(0, 1)).toBeCloseTo(0, 5);
  });
  it("clamps accuracy to 0..1", () => {
    expect(pointsDelta(1, 1.5)).toBeCloseTo(pointsDelta(1, 1), 5);
    expect(pointsDelta(1, -1)).toBeCloseTo(pointsDelta(1, 0), 5);
  });
});

describe("kcalPerMinute (FR-32)", () => {
  it("Keytel per sex at 150 bpm, age 20", () => {
    expect(kcalPerMinute(150, withSex("male"))).toBeCloseTo(13.739986, 5);
    expect(kcalPerMinute(150, withSex("female", { weightKg: 60 }))).toBeCloseTo(9.698805, 5);
    expect(kcalPerMinute(150, withSex("other"))).toBeCloseTo(11.568463, 5);
  });
  it("clamps negative results to 0", () => {
    expect(kcalPerMinute(40, withSex("female", { weightKg: 90 }))).toBe(0);
  });
});

it("does not mutate the profile", () => {
  const p = withSex("other", { hrMaxOverride: 185 });
  const before = structuredClone(p);
  maxHeartRate(p);
  effortPerSecond(140, p);
  kcalPerMinute(140, p);
  expect(p).toEqual(before);
});
