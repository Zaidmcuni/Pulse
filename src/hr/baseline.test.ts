/**
 * Owner: Mohamed
 * Purpose: unit tests for baseline.ts (starting heart rate)
 * FRs: FR-29, FR-06, FR-08
 */
import { describe, expect, it } from "vitest";
import { perfMs, type HrReading, type PlayerProfile } from "../types/pulse";
import { computeBaseline } from "./baseline";

// Age 20 -> HRmax 194.
const p: PlayerProfile = {
  id: "p1", handle: "@t", displayName: "T", age: 20, sex: "male", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};

/** One reading per second starting at 1000 ms. */
const readings = (...bpms: number[]): HrReading[] =>
  bpms.map((bpm, i) => ({ bpm, source: "ble", atMs: perfMs(1000 + i * 1000) }));

describe("computeBaseline (FR-29)", () => {
  it("takes the median, robust to a spike", () => {
    expect(computeBaseline(readings(80, 82, 81, 120, 79), 0, 10_000, p))
      .toEqual({ bpm: 81, source: "measured", readings: 5 });
  });

  it("averages the two middle values for an even count", () => {
    expect(computeBaseline(readings(78, 80, 84, 90), 0, 10_000, p).bpm).toBe(82);
    expect(computeBaseline(readings(78, 80, 83, 90), 0, 10_000, p).bpm).toBe(82); // 81.5 rounded
  });

  it("ignores readings outside [startMs, endMs]", () => {
    // atMs 1000..7000; window [2000, 4000] keeps 70, 72, 74.
    const r = readings(150, 70, 72, 74, 150, 150, 150);
    expect(computeBaseline(r, 2000, 4000, p)).toEqual({ bpm: 72, source: "measured", readings: 3 });
  });

  it("falls back to the profile with fewer than 3 valid readings; NaN, 0 and negative don't count", () => {
    expect(computeBaseline(readings(80, NaN, 0, -5, 82), 0, 10_000, p))
      .toEqual({ bpm: 65, source: "profile", readings: 2 });
    expect(computeBaseline([], 0, 10_000, p)).toEqual({ bpm: 65, source: "profile", readings: 0 });
  });

  it("clamps to [40, HRmax - 30]", () => {
    expect(computeBaseline(readings(30, 30, 30), 0, 10_000, p).bpm).toBe(40);
    expect(computeBaseline(readings(180, 180, 180), 0, 10_000, p).bpm).toBe(164);
    // Absurd profile: upper bound below 40 -> 40.
    expect(computeBaseline(readings(80, 80, 80), 0, 10_000, { ...p, hrMaxOverride: 50 }).bpm).toBe(40);
  });

  it("does not mutate its inputs", () => {
    const r = readings(90, 70, 80);
    const before = JSON.parse(JSON.stringify(r));
    const profileBefore = { ...p };
    computeBaseline(r, 0, 10_000, p);
    expect(r).toEqual(before);
    expect(p).toEqual(profileBefore);
  });
});
