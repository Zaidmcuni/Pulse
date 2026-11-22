/**
 * Owner: Toufic
 * Purpose: Unit tests for sculpted human contour polygon builders and degenerate/foreshortening edge cases
 * FRs: FR-26, FR-49
 */

import { describe, expect, it } from "vitest";
import { createRecordingContext } from "./recordingContext";
import {
  FOREARM_PROFILE,
  SHIN_PROFILE,
  THIGH_PROFILE,
  UPPER_ARM_PROFILE,
  buildFootContour,
  buildHandContour,
  buildHeadContour,
  buildLimbContour,
  buildNeckContour,
  buildSeatedTorsoContour,
  buildTorsoContour,
  tracePolygon,
  type ContourPoint,
} from "./humanContours";

function assertFinitePolygon(pts: readonly ContourPoint[], minVertices = 8): void {
  expect(pts.length).toBeGreaterThanOrEqual(minVertices);
  for (const pt of pts) {
    expect(Number.isFinite(pt.x)).toBe(true);
    expect(Number.isFinite(pt.y)).toBe(true);
  }
}

function spanAtY(pts: readonly ContourPoint[], targetY: number, tolerance: number): number {
  const band = pts.filter((p) => Math.abs(p.y - targetY) <= tolerance);
  expect(band.length).toBeGreaterThanOrEqual(2);
  const xs = band.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
}

describe("buildLimbContour", () => {
  it("builds finite closed polygons with anatomical taper (deltoid > elbow > wrist; thigh > knee > ankle)", () => {
    const bodyScale = 100;
    const upperArm = buildLimbContour({ x: 100, y: 100 }, { x: 100, y: 200 }, UPPER_ARM_PROFILE, bodyScale);
    const forearm = buildLimbContour({ x: 100, y: 200 }, { x: 100, y: 300 }, FOREARM_PROFILE, bodyScale);
    const thigh = buildLimbContour({ x: 100, y: 300 }, { x: 100, y: 420 }, THIGH_PROFILE, bodyScale);
    const shin = buildLimbContour({ x: 100, y: 420 }, { x: 100, y: 540 }, SHIN_PROFILE, bodyScale);

    assertFinitePolygon(upperArm, 24);
    assertFinitePolygon(forearm, 24);
    assertFinitePolygon(thigh, 24);
    assertFinitePolygon(shin, 24);

    // Upper arm tapers from deltoid (y = 100) to elbow (y = 200)
    const deltoidWidth = spanAtY(upperArm, 100, 2);
    const elbowWidth = spanAtY(upperArm, 200, 2);
    const wristWidth = spanAtY(forearm, 300, 2);
    expect(deltoidWidth).toBeGreaterThan(elbowWidth);
    expect(elbowWidth).toBeGreaterThan(wristWidth);

    // Leg tapers from upper thigh (y = 300) to knee (y = 420) to ankle (y = 540)
    const hipQuadWidth = spanAtY(thigh, 300, 2);
    const kneeWidth = spanAtY(thigh, 420, 2);
    const ankleWidth = spanAtY(shin, 540, 2);
    expect(hipQuadWidth).toBeGreaterThan(kneeWidth);
    expect(kneeWidth).toBeGreaterThan(ankleWidth);
  });

  it("returns a clean 16-vertex circular cap without NaNs on extreme foreshortening (from === to)", () => {
    const pt = { x: 180, y: 220 };
    const foreshortened = buildLimbContour(pt, pt, FOREARM_PROFILE, 90);
    expect(foreshortened).toHaveLength(16);
    assertFinitePolygon(foreshortened, 16);

    const expectedRadius = 0.094 * 90;
    for (const v of foreshortened) {
      expect(Math.hypot(v.x - pt.x, v.y - pt.y)).toBeCloseTo(expectedRadius, 5);
    }
  });
});

describe("buildTorsoContour & buildSeatedTorsoContour", () => {
  it("produces an athletic waist taper narrower than the shoulders and hips", () => {
    const bodyScale = 100;
    const lShoulder = { x: 230, y: 150 };
    const rShoulder = { x: 130, y: 150 };
    const lHip = { x: 215, y: 300 };
    const rHip = { x: 145, y: 300 };

    const torso = buildTorsoContour(lShoulder, rShoulder, lHip, rHip, bodyScale);
    assertFinitePolygon(torso, 28);

    const shoulderWidth = spanAtY(torso, 170, 12);
    const waistWidth = spanAtY(torso, 240, 10); // 60% down from y=150 to y=300 is y=240
    const hipWidth = spanAtY(torso, 290, 12);

    expect(waistWidth).toBeLessThan(shoulderWidth);
    expect(waistWidth).toBeLessThan(hipWidth);
  });

  it("stays non-degenerate and finite during a 90-degree sideways turn (lShoulder.x === rShoulder.x)", () => {
    const bodyScale = 100;
    const sideways = buildTorsoContour(
      { x: 180, y: 150 },
      { x: 180, y: 150 },
      { x: 180, y: 300 },
      { x: 180, y: 300 },
      bodyScale,
    );
    assertFinitePolygon(sideways, 28);
    const xs = sideways.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(bodyScale * 0.4);
  });

  it("builds a finite upper-torso bust for seated mode without hip coordinates", () => {
    const bust = buildSeatedTorsoContour({ x: 230, y: 160 }, { x: 130, y: 160 }, 100);
    assertFinitePolygon(bust, 28);
    const ys = bust.map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(230);
  });
});

describe("buildNeckContour, buildHeadContour, buildHandContour, buildFootContour, and tracePolygon", () => {
  it("builds finite neck, oval head (tapered chin), hand, and foot contours and traces closed paths", () => {
    const scale = 100;
    const neck = buildNeckContour({ x: 180, y: 150 }, [0, -1], scale);
    const head = buildHeadContour({ x: 180, y: 105 }, [0, -1], scale);
    const hand = buildHandContour({ x: 180, y: 200 }, { x: 180, y: 280 }, scale);
    const footL = buildFootContour({ x: 200, y: 350 }, { x: 200, y: 450 }, scale, 1);
    const footR = buildFootContour({ x: 160, y: 350 }, { x: 160, y: 450 }, scale, -1);

    assertFinitePolygon(neck, 10);
    assertFinitePolygon(head, 24);
    assertFinitePolygon(hand, 16);
    assertFinitePolygon(footL, 16);
    assertFinitePolygon(footR, 16);

    // Oval head chin width is narrower than mid-cranium width
    const craniumWidth = spanAtY(head, 105, 4);
    const jawWidth = spanAtY(head, 128, 5);
    expect(jawWidth).toBeLessThan(craniumWidth);

    // Degenerate zero-length forearm/shin returns empty hand/foot contour safely
    expect(buildHandContour({ x: 10, y: 10 }, { x: 10, y: 10 }, scale)).toEqual([]);
    expect(buildFootContour({ x: 10, y: 10 }, { x: 10, y: 10 }, scale, 1)).toEqual([]);

    const { ctx, calls } = createRecordingContext();
    tracePolygon(ctx, head);
    expect(calls[0]).toEqual(["beginPath"]);
    expect(calls[1][0]).toBe("moveTo");
    expect(calls.at(-1)).toEqual(["closePath"]);
  });
});
