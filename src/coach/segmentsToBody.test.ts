/**
 * Owner: Toufic
 * Purpose: flat body track from 2D template segments (#97, in-game coach before re-extraction)
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { parseDance } from "../contracts/validators";
import type { SegmentMap } from "../types/pulse";
import { BT, buildFigure, stageCamera } from "./coach3d";
import { bodyFromSegments } from "./segmentsToBody";

const UP = [0, -1] as const;
const DOWN = [0, 1] as const;
const standing: SegmentMap = {
  torso: UP, l_upper_arm: [1, 0], l_forearm: [0, -1], r_upper_arm: DOWN, r_forearm: DOWN,
  l_thigh: DOWN, l_shin: DOWN, r_thigh: DOWN, r_shin: DOWN,
};

describe("bodyFromSegments", () => {
  it("returns null for an empty sample", () => {
    expect(bodyFromSegments({})).toBeNull();
  });

  it("puts the dancer's left on the image right (unmirrored) and the shoulders above the hips", () => {
    const w = bodyFromSegments(standing)!.world;
    expect(w[BT.lShoulder][0]).toBeGreaterThan(w[BT.rShoulder][0]);
    expect(w[BT.lShoulder][1]).toBeLessThan(w[BT.lHip][1]);
  });

  it("follows each segment's direction", () => {
    const w = bodyFromSegments(standing)!.world;
    const upper = [w[BT.lElbow][0] - w[BT.lShoulder][0], w[BT.lElbow][1] - w[BT.lShoulder][1]];
    expect(upper[0]).toBeCloseTo(0.28);
    expect(upper[1]).toBeCloseTo(0);
    expect(w[BT.lWrist][1]).toBeLessThan(w[BT.lElbow][1]); // forearm points up
  });

  it("guesses missing limbs at low visibility instead of dropping them", () => {
    const { r_forearm: _drop, ...rest } = standing;
    const pose = bodyFromSegments(rest)!;
    expect(pose.v[BT.rWrist]).toBeLessThan(CONFIG.visibilityMin);
    expect(pose.v[BT.rElbow]).toBe(1);
    expect(pose.world[BT.rWrist].every(Number.isFinite)).toBe(true);
  });

  it("stands on the floor at the home spot", () => {
    const pose = bodyFromSegments(standing)!;
    expect(pose.root[1]).toBeCloseTo(Math.max(...pose.world.map((p) => p[1])));
  });

  it("builds a drawable figure for every frame of a real-shaped dance", () => {
    const cam = stageCamera(360, 480);
    for (const f of parseDance(FAKE_DANCE).frames) {
      const pose = bodyFromSegments(f.segments);
      if (!pose) continue;
      const parts = buildFigure(pose, cam);
      expect(parts.length).toBeGreaterThan(10);
      for (const p of parts) expect(Number.isFinite(p.depth)).toBe(true);
    }
  });
});
