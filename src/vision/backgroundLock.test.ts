/**
 * Owner: Zaid
 * Purpose: Unit tests for backgroundLock (FR-22)
 */

import { describe, expect, it } from "vitest";
import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../config";
import type { LandmarkPoint } from "../types/pulse";
import { computeTorsoCenterX, createBackgroundLock } from "./backgroundLock";

function makeStandingPoints(centerX: number, v = 0.9): LandmarkPoint[] {
  return SCORED_LANDMARK_INDICES.map((_, i) => {
    const isLeft = i % 2 === 0;
    return { x: centerX + (isLeft ? 0.05 : -0.05), y: 0.4, v };
  });
}

function makeSeatedPoints(centerX: number, shoulderVis = 0.9): LandmarkPoint[] {
  const pts = makeStandingPoints(centerX, shoulderVis);
  // Occlude hips, knees, and ankles behind a desk
  for (let i = LM.lHip; i < pts.length; i++) {
    pts[i] = { x: 0, y: 0, v: 0 };
  }
  return pts;
}

function makeEmptyPoints(): LandmarkPoint[] {
  return SCORED_LANDMARK_INDICES.map(() => ({ x: 0, y: 0, v: 0 }));
}

describe("computeTorsoCenterX", () => {
  it("prioritizes hip midpoint, falls back to shoulders when seated, then partial/low-vis, and returns null when empty", () => {
    const standing = makeStandingPoints(0.4);
    standing[LM.lShoulder] = { x: 0.9, y: 0.2, v: 0.9 };
    standing[LM.rShoulder] = { x: 0.8, y: 0.2, v: 0.9 };
    // Hips at 0.45 and 0.35 -> midpoint 0.40 wins over shoulders
    expect(computeTorsoCenterX(standing)).toBeCloseTo(0.4, 6);

    const seated = makeSeatedPoints(0.62);
    expect(computeTorsoCenterX(seated)).toBeCloseTo(0.62, 6);

    // Only one shoulder confident (>= visibilityMin)
    const oneShoulder = makeEmptyPoints();
    oneShoulder[LM.lShoulder] = { x: 0.72, y: 0.3, v: CONFIG.visibilityMin };
    oneShoulder[LM.rShoulder] = { x: 0.10, y: 0.3, v: 0.2 };
    expect(computeTorsoCenterX(oneShoulder)).toBeCloseTo(0.72, 6);

    // Low visibility fallback (0 < v < visibilityMin)
    const dim = makeEmptyPoints();
    dim[LM.lHip] = { x: 0.3, y: 0.5, v: 0.2 };
    dim[LM.rShoulder] = { x: 0.5, y: 0.3, v: 0.3 };
    expect(computeTorsoCenterX(dim)).toBeCloseTo(0.4, 6);

    expect(computeTorsoCenterX(makeEmptyPoints())).toBeNull();
  });
});

describe("createBackgroundLock", () => {
  it("accepts the first valid frame and establishes the initial lock", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeStandingPoints(0.25))).toBe(true);
  });

  it("accepts normal shifts (0.05, 0.15, 0.34, exact 0.35) and allows gradual traversal across the screen", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeStandingPoints(0.10))).toBe(true);
    expect(lock.accept(makeStandingPoints(0.15))).toBe(true); // +0.05
    expect(lock.accept(makeStandingPoints(0.30))).toBe(true); // +0.15
    expect(lock.accept(makeStandingPoints(0.64))).toBe(true); // +0.34

    // Reset and test exact boundary 0.35 (including IEEE-754 0.55 - 0.20 case)
    lock.reset();
    expect(lock.accept(makeStandingPoints(0.20))).toBe(true);
    expect(lock.accept(makeStandingPoints(0.55))).toBe(true); // exact 0.35 boundary
    expect(lock.accept(makeStandingPoints(0.90))).toBe(true); // +0.35 again -> total +0.70 across screen
  });

  it("rejects passerby jumps (> 0.35) without overwriting the anchored dancer center", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeStandingPoints(0.25))).toBe(true);

    // Passerby walks through at x = 0.70 (dx = 0.45 > 0.35) for multiple consecutive frames
    expect(lock.accept(makeStandingPoints(0.70))).toBe(false);
    expect(lock.accept(makeStandingPoints(0.72))).toBe(false);
    expect(lock.accept(makeStandingPoints(0.68))).toBe(false);

    // Original dancer returns near 0.25 -> accepted immediately
    expect(lock.accept(makeStandingPoints(0.28))).toBe(true);
  });

  it("supports seated mode with occluded hips using shoulder midpoint", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeSeatedPoints(0.50))).toBe(true);
    expect(lock.accept(makeSeatedPoints(0.62))).toBe(true); // normal sway +0.12
    expect(lock.accept(makeSeatedPoints(0.15))).toBe(false); // jump 0.47 > 0.35
    expect(lock.accept(makeSeatedPoints(0.58))).toBe(true); // still locked on 0.62
  });

  it("accepts empty/no-person frames without poisoning lastCenterX to 0", () => {
    const lock = createBackgroundLock();
    // Establish lock at x = 0.60, lose tracking briefly, then reappear at x = 0.62
    expect(lock.accept(makeStandingPoints(0.60))).toBe(true);
    expect(lock.accept(makeEmptyPoints())).toBe(true);
    expect(lock.accept(makeEmptyPoints())).toBe(true);
    expect(lock.accept(makeStandingPoints(0.62))).toBe(true);

    // Also test empty frames BEFORE any person is seen, then dancer enters at x = 0.60
    lock.reset();
    expect(lock.accept(makeEmptyPoints())).toBe(true);
    expect(lock.accept(makeStandingPoints(0.60))).toBe(true);
  });

  it("clears the lock on reset() so a distant frame becomes the new baseline", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeStandingPoints(0.20))).toBe(true);
    expect(lock.accept(makeStandingPoints(0.85))).toBe(false);

    lock.reset();
    expect(lock.accept(makeStandingPoints(0.85))).toBe(true);
  });

  it("respects a custom maxJumpRatio override", () => {
    const lock = createBackgroundLock(0.2);
    expect(lock.accept(makeStandingPoints(0.40))).toBe(true);
    expect(lock.accept(makeStandingPoints(0.59))).toBe(true); // 0.19 <= 0.20
    expect(lock.accept(makeStandingPoints(0.80))).toBe(false); // 0.21 > 0.20 (would pass 0.35!)
  });

  it("#110: moves to a new spot after CONFIG.backgroundReacquireFrames consecutive frames that agree there", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeStandingPoints(0.20))).toBe(true);
    // The dancer leaves (empty frames) and comes back on the other side of the room.
    expect(lock.accept(makeEmptyPoints())).toBe(true);
    for (let i = 1; i < CONFIG.backgroundReacquireFrames; i++) {
      expect(lock.accept(makeStandingPoints(0.75 + (i % 2) * 0.02))).toBe(false);
    }
    expect(lock.accept(makeStandingPoints(0.75))).toBe(true);
    expect(lock.accept(makeStandingPoints(0.78))).toBe(true); // now locked on the new spot
    expect(lock.accept(makeStandingPoints(0.20))).toBe(false); // the old spot is now the jump
  });

  it("#110: a frame back at the anchor, or a candidate that keeps jumping, restarts the count", () => {
    const lock = createBackgroundLock();
    expect(lock.accept(makeStandingPoints(0.20))).toBe(true);
    for (let i = 1; i < CONFIG.backgroundReacquireFrames; i++) expect(lock.accept(makeStandingPoints(0.75))).toBe(false);
    expect(lock.accept(makeStandingPoints(0.22))).toBe(true); // the dancer is back: count cleared
    expect(lock.accept(makeStandingPoints(0.75))).toBe(false); // starts again from 1

    lock.reset();
    expect(lock.accept(makeStandingPoints(0.50))).toBe(true);
    // Alternating far spots never agree with each other, so they are never adopted.
    for (let i = 0; i < CONFIG.backgroundReacquireFrames * 2; i++) {
      expect(lock.accept(makeStandingPoints(i % 2 ? 0.05 : 0.95))).toBe(false);
    }
  });
});
