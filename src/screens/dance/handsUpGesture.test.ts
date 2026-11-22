/**
 * Owner: Mohamed
 * Purpose: unit tests for the hands-overhead start gesture
 * FRs: FR-23, NFR-07
 */

import { describe, expect, it } from "vitest";
import { LM } from "../../config";
import type { LandmarkPoint } from "../../types/pulse";
import { handsOverhead, holdFraction, holdSince, HANDS_UP_START_MS } from "./handsUpGesture";

const ASPECT = 16 / 9;

function pose(wristY: number, v = 1): LandmarkPoint[] {
  const points: LandmarkPoint[] = Array.from({ length: 12 }, () => ({ x: 0.5, y: 0.8, v: 1 }));
  points[LM.lShoulder] = { x: 0.55, y: 0.4, v: 1 };
  points[LM.rShoulder] = { x: 0.45, y: 0.4, v: 1 };
  points[LM.lWrist] = { x: 0.6, y: wristY, v };
  points[LM.rWrist] = { x: 0.4, y: wristY, v };
  return points;
}

describe("handsOverhead", () => {
  // Shoulder span 0.1 wide = 0.178 frame heights; margin = 0.133, so wrists must be above y = 0.267.
  it("is true when both wrists are well above the shoulders", () => {
    expect(handsOverhead(pose(0.2), ASPECT)).toBe(true);
  });

  it("ignores arms raised only to shoulder or face level", () => {
    expect(handsOverhead(pose(0.38), ASPECT)).toBe(false);
    expect(handsOverhead(pose(0.3), ASPECT)).toBe(false);
  });

  it("needs both hands", () => {
    const points = pose(0.2);
    points[LM.rWrist] = { x: 0.4, y: 0.6, v: 1 };
    expect(handsOverhead(points, ASPECT)).toBe(false);
  });

  it("never fires on low-visibility landmarks (tracking loss)", () => {
    expect(handsOverhead(pose(0.2, 0.1), ASPECT)).toBe(false);
    expect(handsOverhead([], ASPECT)).toBe(false);
  });
});

describe("hold timing", () => {
  it("starts, keeps and clears the hold start", () => {
    expect(holdSince(null, true, 100)).toBe(100);
    expect(holdSince(100, true, 900)).toBe(100);
    expect(holdSince(100, false, 900)).toBeNull();
  });

  it("reports progress and caps at 1", () => {
    expect(holdFraction(null, 500)).toBe(0);
    expect(holdFraction(0, HANDS_UP_START_MS / 2)).toBe(0.5);
    expect(holdFraction(0, HANDS_UP_START_MS * 3)).toBe(1);
  });
});
