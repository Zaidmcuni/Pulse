/**
 * Owner: Zaid
 * Purpose: Unit tests for downsampled torso-centered poseRecorder (FR-47)
 */

import { describe, expect, it } from "vitest";
import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../config";
import { assertLandmarks } from "../contracts/validators";
import { perfMs, songMs, type LandmarkPoint, type PoseFrame } from "../types/pulse";
import { createPoseRecorder } from "./poseRecorder";

function makeStandingPoints(
  opts?: { dx?: number; dy?: number; scale?: number; v?: number },
): LandmarkPoint[] {
  const dx = opts?.dx ?? 0;
  const dy = opts?.dy ?? 0;
  const s = opts?.scale ?? 1;
  const v = opts?.v ?? 0.92;

  const base: Array<[number, number]> = [
    [0.4, 0.3], // 0: lShoulder
    [0.6, 0.3], // 1: rShoulder
    [0.32, 0.42], // 2: lElbow
    [0.68, 0.42], // 3: rElbow
    [0.28, 0.55], // 4: lWrist
    [0.72, 0.55], // 5: rWrist
    [0.45, 0.7], // 6: lHip
    [0.55, 0.7], // 7: rHip
    [0.44, 0.85], // 8: lKnee
    [0.56, 0.85], // 9: rKnee
    [0.43, 0.98], // 10: lAnkle
    [0.57, 0.98], // 11: rAnkle
  ];

  // Scale around (0.5, 0.5), then translate by (dx, dy)
  return base.map(([bx, by]) => ({
    x: 0.5 + (bx - 0.5) * s + dx,
    y: 0.5 + (by - 0.5) * s + dy,
    v,
  }));
}

function makePoseFrame(points: LandmarkPoint[], tMs = 1000): PoseFrame {
  return {
    tFrameMs: perfMs(tMs),
    segments: {},
    usableRatio: 1,
    tracking: "ok",
    points,
  };
}

describe("createPoseRecorder", () => {
  it("downsamples 60 FPS and 30 FPS inputs to ~10-12 FPS and skips duplicate/paused timestamps", () => {
    const rec60 = createPoseRecorder();
    const frame = makePoseFrame(makeStandingPoints());

    for (let i = 0; i < 1800; i++) {
      rec60.push(frame, songMs((i * 1000) / 60));
    }
    const samples60 = rec60.getSamples();
    expect(samples60.length).toBeGreaterThanOrEqual(300);
    expect(samples60.length).toBeLessThanOrEqual(361);
    expect(samples60.length).toBe(360);

    const rec30 = createPoseRecorder();
    for (let i = 0; i < 900; i++) {
      rec30.push(frame, songMs((i * 1000) / 30));
    }
    const samples30 = rec30.getSamples();
    expect(samples30.length).toBe(300);

    const minInterval = 1000 / CONFIG.clipFps;
    for (let i = 1; i < samples60.length; i++) {
      expect(Number(samples60[i].tSongMs) - Number(samples60[i - 1].tSongMs)).toBeGreaterThanOrEqual(
        Math.floor(minInterval) - 1,
      );
    }

    // Duplicate / paused or backward timestamps must not append extra samples
    const recPause = createPoseRecorder(10);
    recPause.push(frame, songMs(100));
    recPause.push(frame, songMs(100));
    recPause.push(frame, songMs(95));
    recPause.push(frame, songMs(150));
    expect(recPause.getSamples()).toHaveLength(1);
  });

  it("centers on the torso (0, 0), scales by shoulder width (1.0), and is translation- and scale-invariant", () => {
    const recBase = createPoseRecorder();
    recBase.push(makePoseFrame(makeStandingPoints()), songMs(0));
    const baseSample = recBase.getSamples()[0];
    assertLandmarks(baseSample.points, "baseSample");

    const pts = baseSample.points;
    const torsoMidX = (pts[LM.lShoulder].x + pts[LM.rShoulder].x + pts[LM.lHip].x + pts[LM.rHip].x) / 4;
    const torsoMidY = (pts[LM.lShoulder].y + pts[LM.rShoulder].y + pts[LM.lHip].y + pts[LM.rHip].y) / 4;
    expect(torsoMidX).toBeCloseTo(0, 3);
    expect(torsoMidY).toBeCloseTo(0, 3);

    const shoulderDist = Math.hypot(
      pts[LM.rShoulder].x - pts[LM.lShoulder].x,
      pts[LM.rShoulder].y - pts[LM.lShoulder].y,
    );
    expect(shoulderDist).toBeCloseTo(1.0, 3);

    // Translation invariance (+0.2, -0.1)
    const recShifted = createPoseRecorder();
    recShifted.push(makePoseFrame(makeStandingPoints({ dx: 0.2, dy: -0.1 })), songMs(0));
    const shiftedPts = recShifted.getSamples()[0].points;
    shiftedPts.forEach((p, idx) => {
      expect(p.x).toBeCloseTo(pts[idx].x, 3);
      expect(p.y).toBeCloseTo(pts[idx].y, 3);
    });

    // Scale invariance (0.5x)
    const recScaled = createPoseRecorder();
    recScaled.push(makePoseFrame(makeStandingPoints({ scale: 0.5 })), songMs(0));
    const scaledPts = recScaled.getSamples()[0].points;
    scaledPts.forEach((p, idx) => {
      expect(p.x).toBeCloseTo(pts[idx].x, 3);
      expect(p.y).toBeCloseTo(pts[idx].y, 3);
    });
  });

  it("handles seated mode with occluded hips using shoulder midpoint and keeps occluded legs at zero", () => {
    const seatedPts = makeStandingPoints().map((p, idx) =>
      idx >= LM.lHip ? { x: 0, y: 0, v: 0 } : p,
    );
    const rec = createPoseRecorder();
    rec.push(makePoseFrame(seatedPts), songMs(0));

    const sample = rec.getSamples()[0];
    assertLandmarks(sample.points, "seatedSample");

    const shoulderMidX = (sample.points[LM.lShoulder].x + sample.points[LM.rShoulder].x) / 2;
    const shoulderMidY = (sample.points[LM.lShoulder].y + sample.points[LM.rShoulder].y) / 2;
    expect(shoulderMidX).toBeCloseTo(0, 3);
    expect(shoulderMidY).toBeCloseTo(0, 3);

    const shoulderDist = Math.hypot(
      sample.points[LM.rShoulder].x - sample.points[LM.lShoulder].x,
      sample.points[LM.rShoulder].y - sample.points[LM.lShoulder].y,
    );
    expect(shoulderDist).toBeCloseTo(1.0, 3);

    for (let i = LM.lHip; i < SCORED_LANDMARK_INDICES.length; i++) {
      expect(sample.points[i]).toEqual({ x: 0, y: 0, v: 0 });
    }
  });

  it("guards against sideways turns / collapsed shoulder width using lastValidScale", () => {
    const rec = createPoseRecorder();
    // Establish initial valid shoulder scale of 0.2
    rec.push(makePoseFrame(makeStandingPoints()), songMs(0));

    // Sideways turn: shoulders overlap to dist = 0.001 < 0.02
    const sidewaysPts = makeStandingPoints();
    sidewaysPts[LM.lShoulder] = { x: 0.5, y: 0.3, v: 0.9 };
    sidewaysPts[LM.rShoulder] = { x: 0.501, y: 0.3, v: 0.9 };

    rec.push(makePoseFrame(sidewaysPts), songMs(200));
    const sample = rec.getSamples()[1];
    assertLandmarks(sample.points, "sidewaysSample");

    for (const pt of sample.points) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
      expect(Math.abs(pt.x)).toBeLessThan(50);
      expect(Math.abs(pt.y)).toBeLessThan(50);
    }
  });

  it("keeps 30 s clip quantized and compact (measured JSON and binary sizes)", () => {
    const rec = createPoseRecorder();
    const pts = makeStandingPoints({ dx: 0.031234567, dy: -0.021987654 });
    const frame = makePoseFrame(pts);

    for (let i = 0; i < 900; i++) {
      rec.push(frame, songMs((i * 1000) / 30));
    }

    const samples = rec.getSamples();
    expect(samples).toHaveLength(300);

    // Check quantization (at most 3 decimals for x/y, 2 decimals for v)
    for (const pt of samples[0].points) {
      expect(Math.round(pt.x * 1000) / 1000).toBe(pt.x);
      expect(Math.round(pt.y * 1000) / 1000).toBe(pt.y);
      expect(Math.round(pt.v * 100) / 100).toBe(pt.v);
    }

    const jsonByteLength = new TextEncoder().encode(JSON.stringify(samples)).byteLength;
    const compactInt16ByteLength = samples.length * 12 * 4; // 12 points * (Int16 x, Int16 y) = 48 B/frame
    expect(compactInt16ByteLength).toBe(14_400);
    expect(compactInt16ByteLength).toBeLessThan(20_000);
    // Verbose {x,y,v} JSON for 300 frames stays bounded (much smaller than unquantized 17-digit floats)
    expect(jsonByteLength).toBeLessThan(120_000);
  });

  it("returns an immutable copy from getSamples() and resets state cleanly on clear()", () => {
    const rec = createPoseRecorder();
    const frame = makePoseFrame(makeStandingPoints());

    rec.push(frame, songMs(1000));
    const snapshot = rec.getSamples();
    expect(snapshot).toHaveLength(1);

    snapshot.pop();
    expect(rec.getSamples()).toHaveLength(1);

    rec.clear();
    expect(rec.getSamples()).toHaveLength(0);

    // Recording at tSongMs = 0 after clear() succeeds immediately
    rec.push(frame, songMs(0));
    expect(rec.getSamples()).toHaveLength(1);
    expect(Number(rec.getSamples()[0].tSongMs)).toBe(0);
  });
});
