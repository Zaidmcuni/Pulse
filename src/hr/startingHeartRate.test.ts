/**
 * Owner: Mohamed
 * Purpose: unit tests for the pure starting heart rate state logic (useStartingHeartRate.ts)
 * FRs: FR-29, FR-06
 */
import { describe, expect, it } from "vitest";
import { perfMs, type HeartRateStatus, type HrReading, type PlayerProfile } from "../types/pulse";
import { canStartDance, finalBaseline, startingHrState } from "./useStartingHeartRate";

const p: PlayerProfile = {
  id: "p1", handle: "@t", displayName: "T", age: 20, sex: "male", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};

/** One reading per second at fromSec, fromSec + 1, … (in ms). */
const everySecond = (fromSec: number, bpms: number[]): HrReading[] =>
  bpms.map((bpm, i) => ({ bpm, source: "ble", atMs: perfMs((fromSec + i) * 1000) }));

const state = (monitorStatus: HeartRateStatus | null, readings: HrReading[], nowMs: number) =>
  startingHrState({ monitorStatus, readings, openedAtMs: 0, nowMs, profile: p });

describe("startingHrState (FR-29)", () => {
  it("no monitor, disconnected or simulated at open -> no-watch; can start; no baseline", () => {
    for (const status of [null, "disconnected", "simulated"] as const) {
      const s = state(status, [], 1000);
      expect(s).toEqual({ kind: "no-watch" });
      expect(canStartDance(s)).toBe(true);
      expect(finalBaseline(s, [], 1000, p)).toBeNull();
    }
  });

  it("live, first reading 3 s ago -> measuring with 7 s left and the newest bpm", () => {
    const s = state("live", everySecond(1, [80, 82, 84, 86]), 4000); // first at 1 s, now 4 s
    expect(s).toEqual({ kind: "measuring", secondsLeft: 7, latestBpm: 86 });
    expect(canStartDance(s)).toBe(false);
  });

  it("live, before any reading -> measuring with 10 s left and no bpm", () => {
    expect(state("live", [], 2000)).toEqual({ kind: "measuring", secondsLeft: 10, latestBpm: null });
  });

  it("live, a reading every second for 10 s -> ready with the median of the last 10 s", () => {
    const r = everySecond(1, [70, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89]); // 1..11 s
    const s = state("live", r, 11_000); // window [1 s, 11 s]
    expect(s.kind).toBe("ready");
    if (s.kind !== "ready") return;
    expect(s.baseline).toEqual({ bpm: 84, source: "measured", readings: 11 });
    expect(canStartDance(s)).toBe(true);
  });

  it("only 2 readings after 10 s -> measuring until a 3rd arrives, or fallback once 15 s have passed", () => {
    const two: HrReading[] = [
      { bpm: 80, source: "ble", atMs: perfMs(2000) },
      { bpm: 82, source: "ble", atMs: perfMs(10_000) },
    ]; // first reading 10 s before 12 s, both inside [2 s, 12 s]
    expect(state("live", two, 12_000).kind).toBe("measuring");
    const three = [...two, { bpm: 84, source: "ble" as const, atMs: perfMs(12_000) }];
    expect(state("live", three, 12_000).kind).toBe("ready");
    const s = state("live", two, 15_000); // only the 10 s reading is in [5 s, 15 s]
    expect(s).toEqual({ kind: "fallback", baseline: { bpm: 65, source: "profile", readings: 1 } });
    expect(canStartDance(s)).toBe(true);
  });

  it("no reading at all for 15 s -> fallback with the profile value", () => {
    expect(state("live", [], 14_999).kind).toBe("measuring");
    const s = state("live", [], 15_000);
    expect(s).toEqual({ kind: "fallback", baseline: { bpm: 65, source: "profile", readings: 0 } });
    expect(finalBaseline(s, [], 15_000, p)).toEqual({ bpm: 65, source: "profile", readings: 0 });
  });

  it("watch drops while measuring -> no-watch (the dance will score moves only)", () => {
    const s = state("disconnected", everySecond(1, [80, 81, 82]), 4000);
    expect(s.kind).toBe("no-watch");
    expect(canStartDance(s)).toBe(true);
  });

  it("a monitor turning live later -> measuring", () => {
    expect(state(null, [], 2000).kind).toBe("no-watch");
    const later = startingHrState({ monitorStatus: "live", readings: [], openedAtMs: 20_000, nowMs: 21_000, profile: p });
    expect(later).toEqual({ kind: "measuring", secondsLeft: 10, latestBpm: null });
  });

  it("finalBaseline after waiting 30 s uses only the last 10 s", () => {
    // 1..19 s at 140 (just arrived, out of breath), 20..30 s at 90.
    const r = [...everySecond(1, Array(19).fill(140)), ...everySecond(20, Array(11).fill(90))];
    const s = state("live", r, 30_000);
    expect(s.kind).toBe("ready");
    expect(finalBaseline(s, r, 30_000, p)).toEqual({ bpm: 90, source: "measured", readings: 11 });
  });
});
