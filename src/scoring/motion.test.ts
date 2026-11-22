/**
 * Owner: Mohamed
 * Purpose: unit tests for motion.ts (#112 still detection).
 * FRs: FR-28, FR-30, FR-31
 */
import { describe, expect, it } from "vitest";
import type { Dance, LandmarkPoint } from "../types/pulse";
import { songMs } from "../types/pulse";
import { LM } from "../config";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { STANDING_STILL } from "../screens/dev/scoringCheck";
import { coachMotion, dancerMotion } from "./motion";

const ASPECT = 16 / 9;
/** STANDING_STILL's shoulder width in pixel-space units (x * aspect). */
const SW = (STANDING_STILL[LM.lShoulder].x - STANDING_STILL[LM.rShoulder].x) * ASPECT;

/** 11 frames over 1 s; pose(i) gives the points of frame i. */
function frames(pose: (i: number) => LandmarkPoint[]) {
  return Array.from({ length: 11 }, (_, i) => ({ tMs: i * 100, points: pose(i) }));
}

/** Both wrists moved right by `dxPx` pixel-space units over 1 s (linearly). */
function wristsMoving(base: LandmarkPoint[], dxPx: number) {
  return frames((i) => base.map((p, j) =>
    j === LM.lWrist || j === LM.rWrist ? { ...p, x: p.x + (dxPx / ASPECT) * (i / 10) } : p));
}

/** Zoom out around the image centre: the body looks half the size (camera twice as far). */
const halfSize = (pts: LandmarkPoint[]) => pts.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) / 2, y: 0.5 + (p.y - 0.5) / 2 }));

describe("dancerMotion (#112)", () => {
  it("a still pose moves ~0 shoulder widths per second", () => {
    expect(dancerMotion(frames(() => STANDING_STILL), ASPECT)).toBeCloseTo(0, 9);
  });

  it("both wrists moving 1 shoulder width in 1 s -> 2 of 8 joints at 1 SW/s = 0.25", () => {
    expect(dancerMotion(wristsMoving(STANDING_STILL, SW), ASPECT)).toBeCloseTo(0.25, 9);
  });

  it("is the same when the dancer stands twice as far from the camera", () => {
    const near = dancerMotion(wristsMoving(STANDING_STILL, SW), ASPECT)!;
    const far = dancerMotion(wristsMoving(halfSize(STANDING_STILL), SW / 2), ASPECT)!;
    expect(far).toBeCloseTo(near, 9);
  });

  it("ignores invisible points", () => {
    // Wrists invisible: their jumps don't count, leaving 6 still joints.
    const hidden = frames((i) => STANDING_STILL.map((p, j) =>
      j === LM.lWrist || j === LM.rWrist ? { ...p, x: i % 2 ? 0.1 : 0.9, v: 0.1 } : p));
    expect(dancerMotion(hidden, ASPECT)).toBeCloseTo(0, 9);
  });

  it("is null with fewer than 2 usable frames (shoulders unseen)", () => {
    expect(dancerMotion([], ASPECT)).toBeNull();
    expect(dancerMotion([{ tMs: 0, points: STANDING_STILL }], ASPECT)).toBeNull();
    const noShoulders = frames(() => STANDING_STILL.map((p, j) => (j <= LM.rShoulder ? { ...p, v: 0 } : p)));
    expect(dancerMotion(noShoulders, ASPECT)).toBeNull();
  });
});

describe("coachMotion (#112)", () => {
  it("is 0 for a constant template", () => {
    const constant: Dance = { ...FAKE_DANCE, frames: FAKE_DANCE.frames.map((f) => ({ ...f, segments: FAKE_DANCE.frames[0].segments })) };
    expect(coachMotion(constant, 0, 1000, "standing")).toBe(0);
  });

  it("is > 0 for the fake dance's arm switches", () => {
    // 4 arm segments turn 90° at 500 ms; torso and legs don't move.
    expect(coachMotion(FAKE_DANCE, 0, 1000, "standing")).toBeGreaterThan(30);
  });

  it("is 0 with fewer than 2 frames in the window", () => {
    expect(coachMotion(FAKE_DANCE, songMs(100), songMs(110), "standing")).toBe(0);
  });
});
