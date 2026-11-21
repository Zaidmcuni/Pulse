/**
 * Owner: Zaid
 * Purpose: Unit tests for One Euro landmark smoothing (FR-18)
 */

import { describe, expect, it } from "vitest";
import { CONFIG, SCORED_LANDMARK_INDICES } from "../config";
import { assertLandmarks } from "../contracts/validators";
import { perfMs, type LandmarkPoint } from "../types/pulse";
import { createOneEuroSmoother } from "./oneEuroFilter";

function make12(fill: (index: number) => LandmarkPoint): LandmarkPoint[] {
  return SCORED_LANDMARK_INDICES.map((_, i) => fill(i));
}

function variance(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

describe("createOneEuroSmoother", () => {
  it("passes the first frame through unmodified and satisfies assertLandmarks", () => {
    const smoother = createOneEuroSmoother();
    const first = make12((i) => ({ x: 0.2 + i * 0.05, y: 0.3 + i * 0.03, v: 0.9 }));

    const out = smoother.smooth(first, perfMs(1000));
    assertLandmarks(out, "firstFrame");
    expect(out).toEqual(first);
  });

  it("reduces stationary jitter variance substantially at 30 FPS", () => {
    const smoother = createOneEuroSmoother(CONFIG.oneEuro.minCutoffHz, CONFIG.oneEuro.beta);
    const rawXs: number[] = [];
    const smoothXs: number[] = [];

    for (let i = 0; i < 90; i++) {
      // Deterministic pseudo-jitter +/- 0.02 around 0.5
      const noise = ((i % 2 === 0 ? 1 : -1) * 0.015) + Math.sin(i * 1.7) * 0.005;
      const rawX = 0.5 + noise;
      rawXs.push(rawX);

      const frame = make12(() => ({ x: rawX, y: 0.5 - noise, v: 0.95 }));
      const out = smoother.smooth(frame, perfMs(1000 + i * (1000 / 30)));
      smoothXs.push(out[0].x);
    }

    // Measure after initial settle (frames 15..89)
    const rawVar = variance(rawXs.slice(15));
    const smoothVar = variance(smoothXs.slice(15));
    expect(smoothVar).toBeLessThan(rawVar * 0.25);
  });

  it("tracks fast motion with lower lag when beta = 0.03 compared to beta = 0", () => {
    const reactive = createOneEuroSmoother(1.0, 0.03);
    const fixedCutoff = createOneEuroSmoother(1.0, 0);

    // Warm up at x = 0.2, then ramp quickly toward x = 0.8
    let t = 0;
    for (let i = 0; i < 15; i++) {
      t += 33.33;
      const pt = make12(() => ({ x: 0.2, y: 0.5, v: 1 }));
      reactive.smooth(pt, perfMs(t));
      fixedCutoff.smooth(pt, perfMs(t));
    }

    let reactiveAtEnd = 0;
    let fixedAtEnd = 0;
    for (let i = 1; i <= 10; i++) {
      t += 33.33;
      const targetX = 0.2 + i * 0.06; // 0.26 .. 0.80 fast sweep
      const pt = make12(() => ({ x: targetX, y: 0.5, v: 1 }));
      reactiveAtEnd = reactive.smooth(pt, perfMs(t))[0].x;
      fixedAtEnd = fixedCutoff.smooth(pt, perfMs(t))[0].x;
    }

    // Target is 0.80; beta = 0.03 raises cutoff on fast motion so lag is smaller
    expect(0.8 - reactiveAtEnd).toBeLessThan(0.8 - fixedAtEnd);
  });

  it("guards against duplicate (dt=0), negative dt, and pause gaps (> 0.5s) without NaN", () => {
    const smoother = createOneEuroSmoother();
    const a = make12(() => ({ x: 0.3, y: 0.4, v: 0.9 }));
    const b = make12(() => ({ x: 0.4, y: 0.6, v: 0.9 }));
    const c = make12(() => ({ x: 0.9, y: 0.1, v: 0.9 }));

    const out1 = smoother.smooth(a, perfMs(1000));
    const dup = smoother.smooth(b, perfMs(1000));
    const neg = smoother.smooth(b, perfMs(990));

    expect(dup[0].x).toBe(out1[0].x);
    expect(neg[0].x).toBe(out1[0].x);
    expect(Number.isFinite(dup[0].x)).toBe(true);
    expect(Number.isFinite(neg[0].x)).toBe(true);

    // Pause > 0.5 s resets filter so re-entry snaps cleanly to c without smearing from 0.3
    const afterPause = smoother.smooth(c, perfMs(1700));
    expect(afterPause[0].x).toBeCloseTo(0.9, 6);
    expect(afterPause[0].y).toBeCloseTo(0.1, 6);
  });

  it("preserves visibility verbatim and resets zero-visibility landmarks so (0, 0) never pollutes re-entry", () => {
    const smoother = createOneEuroSmoother();
    const visible = make12(() => ({ x: 0.6, y: 0.4, v: 0.87 }));
    const hidden = make12(() => ({ x: 0, y: 0, v: 0 }));
    const reentered = make12(() => ({ x: 0.75, y: 0.25, v: 0.72 }));

    const f1 = smoother.smooth(visible, perfMs(100));
    expect(f1[0].v).toBe(0.87);

    const f2 = smoother.smooth(hidden, perfMs(133));
    expect(f2[0]).toEqual({ x: 0, y: 0, v: 0 });

    // Re-entry right after hidden frame (within 33ms) must NOT lerp from (0, 0)
    const f3 = smoother.smooth(reentered, perfMs(166));
    assertLandmarks(f3, "reentered");
    expect(f3[0].x).toBeCloseTo(0.75, 6);
    expect(f3[0].y).toBeCloseTo(0.25, 6);
    expect(f3[0].v).toBe(0.72);
  });

  it("maintains independent state per landmark and per axis, and reset() clears all channels", () => {
    const smoother = createOneEuroSmoother();
    const frame1 = make12((i) => ({ x: i === 0 ? 0.1 : 0.9, y: 0.2, v: 0.9 }));
    const frame2 = make12((i) => ({ x: i === 0 ? 0.9 : 0.9, y: 0.2, v: 0.9 }));

    smoother.smooth(frame1, perfMs(100));
    const out2 = smoother.smooth(frame2, perfMs(133));

    // Landmark 0 moved so it is smoothed (< 0.9), while landmark 1 stayed at 0.9 and y stayed at 0.2
    expect(out2[0].x).toBeLessThan(0.9);
    expect(out2[0].y).toBeCloseTo(0.2, 6);
    expect(out2[1].x).toBeCloseTo(0.9, 6);

    smoother.reset();
    const afterReset = smoother.smooth(frame2, perfMs(166));
    expect(afterReset[0].x).toBeCloseTo(0.9, 6);
  });
});
