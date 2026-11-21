/**
 * Owner: Toufic
 * Purpose: unit tests for the coach figure: side assignment, link order, missing links, drawing calls
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { parseDance } from "../contracts/validators";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { songMs, type SegmentId, type SegmentMap, type Vec2 } from "../types/pulse";
import { createRecordingContext } from "./recordingContext";
import { sampleTemplate } from "./sampleTemplate";
import { buildSilhouette, drawCoach, type Limb, type Point, type Silhouette } from "./silhouette";

const W = 360;
const H = 480;

function limb(s: Silhouette, id: SegmentId): Limb {
  const found = s.limbs.find((l) => l.segment === id);
  expect(found, id).toBeDefined();
  return found!;
}

function direction(l: Limb): Vec2 {
  const len = Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y);
  return [(l.to.x - l.from.x) / len, (l.to.y - l.from.y) / len];
}

function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

// Asymmetric pose: every limb in a different direction, so a side swap or horizontal flip changes the result.
const ASYM: SegmentMap = {
  torso: [0, -1],
  l_upper_arm: [1, 0],      // dancer's left arm out to the viewer's right...
  l_forearm: [0, -1],       // ...forearm up
  r_upper_arm: [0, 1],      // right arm hanging down...
  r_forearm: [0.6, 0.8],    // ...forearm angled down-right
  l_thigh: [0.6, 0.8],
  l_shin: [0, 1],
  r_thigh: [0, 1],
  r_shin: [-0.6, 0.8],
};

describe("buildSilhouette geometry", () => {
  it("puts the dancer's own left on the viewer's right when upright", () => {
    const s = buildSilhouette(ASYM, W, H);
    expect(s.torso!.lShoulder.x).toBeGreaterThan(W / 2);
    expect(s.torso!.rShoulder.x).toBeLessThan(W / 2);
    expect(s.torso!.lHip.x).toBeGreaterThan(W / 2);
    expect(s.torso!.rHip.x).toBeLessThan(W / 2);
    expect(s.torso!.headCenter.y).toBeLessThan(s.torso!.lShoulder.y);
  });

  it("chains each limb from its own anchor in shoulder→elbow→wrist and hip→knee→ankle order", () => {
    const s = buildSilhouette(ASYM, W, H);
    expectPoint(limb(s, "l_upper_arm").from, s.torso!.lShoulder);
    expectPoint(limb(s, "r_upper_arm").from, s.torso!.rShoulder);
    expectPoint(limb(s, "l_thigh").from, s.torso!.lHip);
    expectPoint(limb(s, "r_thigh").from, s.torso!.rHip);
    expectPoint(limb(s, "l_forearm").from, limb(s, "l_upper_arm").to);
    expectPoint(limb(s, "r_forearm").from, limb(s, "r_upper_arm").to);
    expectPoint(limb(s, "l_shin").from, limb(s, "l_thigh").to);
    expectPoint(limb(s, "r_shin").from, limb(s, "r_thigh").to);
  });

  it("draws every link in its stored direction (no mirroring, equal x/y scale)", () => {
    const s = buildSilhouette(ASYM, W, H);
    for (const [id, v] of Object.entries(ASYM) as [SegmentId, Vec2][]) {
      if (id === "torso") continue;
      const d = direction(limb(s, id));
      expect(d[0], id).toBeCloseTo(v[0], 9);
      expect(d[1], id).toBeCloseTo(v[1], 9);
    }
  });

  it("keeps side assignment as the torso tilts", () => {
    // Torso pointing to the viewer's right = figure rotated 90° clockwise: its left side now faces down.
    const s = buildSilhouette({ torso: [1, 0] }, W, H);
    expect(s.torso!.lShoulder.y).toBeGreaterThan(s.torso!.rShoulder.y);
    expect(s.torso!.lHip.y).toBeGreaterThan(s.torso!.rHip.y);
    expect(s.torso!.headCenter.x).toBeGreaterThan(W / 2);
  });

  it("omits a distal link whose proximal link is missing, other chains still render", () => {
    const { l_upper_arm: _a, r_thigh: _b, ...rest } = ASYM;
    const s = buildSilhouette(rest, W, H);
    const ids = s.limbs.map((l) => l.segment).sort();
    expect(ids).toEqual(["l_shin", "l_thigh", "r_forearm", "r_upper_arm"]);
  });

  it("without a torso, anchors limbs at the upright positions and draws no torso", () => {
    const { torso: _t, ...noTorso } = ASYM;
    const s = buildSilhouette(noTorso, W, H);
    const upright = buildSilhouette({ ...noTorso, torso: [0, -1] }, W, H);
    expect(s.torso).toBeUndefined();
    expect(s.limbs).toEqual(upright.limbs);
  });

  it("returns nothing drawable for an empty map", () => {
    const s = buildSilhouette({}, W, H);
    expect(s.torso).toBeUndefined();
    expect(s.limbs).toEqual([]);
  });

  it("keeps fully extended limbs inside the canvas in any direction", () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const r = (deg * Math.PI) / 180;
      const v: Vec2 = [Math.cos(r), Math.sin(r)];
      const all = Object.fromEntries(Object.keys(ASYM).map((k) => [k, v])) as SegmentMap;
      for (const [w, h] of [[W, H], [H, W], [300, 300]]) {
        const s = buildSilhouette(all, w, h);
        const pts = [...s.limbs.flatMap((l) => [l.from, l.to]), s.torso!.headCenter];
        for (const p of pts) {
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(w);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(h);
        }
      }
    }
  });

  it("fake dance: arms rise overhead at 0 ms and extend outward at 500 ms", () => {
    const dance = parseDance(FAKE_DANCE);
    const up = buildSilhouette(sampleTemplate(dance.frames, songMs(0)), W, H);
    const out = buildSilhouette(sampleTemplate(dance.frames, songMs(500)), W, H);
    for (const id of ["l_forearm", "r_forearm"] as const) expect(limb(up, id).to.y).toBeLessThan(up.torso!.headCenter.y);
    expect(limb(out, "l_forearm").to.x).toBeGreaterThan(out.torso!.lShoulder.x);
    expect(limb(out, "r_forearm").to.x).toBeLessThan(out.torso!.rShoulder.x);
    expect(limb(out, "l_forearm").to.y).toBeCloseTo(out.torso!.lShoulder.y, 9);
  });
});

describe("drawCoach", () => {
  it("clears the whole canvas before drawing", () => {
    const { ctx, calls } = createRecordingContext();
    drawCoach(ctx, W, H, ASYM);
    expect(calls[0]).toEqual(["clearRect", 0, 0, W, H]);
    expect(calls.filter((c) => c[0] === "clearRect")).toHaveLength(1);
    expect(calls.some((c) => c[0] === "stroke")).toBe(true);
    expect(calls.some((c) => c[0] === "arc")).toBe(true);
  });

  it("only clears for an empty map", () => {
    const { ctx, calls } = createRecordingContext();
    drawCoach(ctx, W, H, {});
    expect(calls).toEqual([["clearRect", 0, 0, W, H]]);
  });

  it("draws no torso or head without a torso direction", () => {
    const { ctx, calls } = createRecordingContext();
    drawCoach(ctx, W, H, { l_upper_arm: [1, 0] });
    expect(calls.some((c) => c[0] === "arc" || c[0] === "fill")).toBe(false);
    expect(calls.filter((c) => c[0] === "stroke")).toHaveLength(2); // outline + body for one limb
  });
});
