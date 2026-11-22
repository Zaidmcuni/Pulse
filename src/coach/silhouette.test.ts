/**
 * Owner: Toufic
 * Purpose: unit tests for the coach figure: side assignment, link order, missing links, drawing calls
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { LM } from "../config";
import { parseDance } from "../contracts/validators";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { songMs, type LandmarkPoint, type SegmentId, type SegmentMap, type TemplateFrame, type Vec2 } from "../types/pulse";
import { createRecordingContext } from "./recordingContext";
import { sampleTemplate } from "./sampleTemplate";
import {
  buildSilhouette,
  buildSilhouetteFromLandmarks,
  computeStageTransform,
  drawCoach,
  type Limb,
  type Point,
  type Silhouette,
} from "./silhouette";

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

  it("draws no torso or head without a torso direction, while still rendering sculpted limb contour and endpoint joints", () => {
    const { ctx, calls } = createRecordingContext();
    drawCoach(ctx, W, H, { l_upper_arm: [1, 0] });
    // Single limb contour polygon fill (#38bdf8) without any torso/head fill (#0ea5e9)
    const fills = calls.filter((c) => c[0] === "fill");
    expect(fills.some((c) => c[1] === "#0ea5e9")).toBe(false);
    expect(fills.some((c) => c[1] === "#38bdf8")).toBe(true);
    // 3 strokes for the single limb: dark separator moat (#090f1f) + luminous rim (#e0f2fe) + inner axis highlight (#bae6fd)
    const strokes = calls.filter((c) => c[0] === "stroke");
    expect(strokes).toHaveLength(3);
    expect(strokes.map((c) => c[1])).toEqual(["#090f1f", "#e0f2fe", "#bae6fd"]);
    // 2 articulated endpoint joint nodes (lShoulder + lElbow), each with 3 concentric circles (halo + ring + core) = 6 arcs
    expect(calls.filter((c) => c[0] === "arc")).toHaveLength(6);
  });

  it("preserves stage translation across laterally (+0.25 x) and vertically (-0.15 y) shifted frames under a shared StageTransform", () => {
    const makeStandingLandmarks = (dx = 0, dy = 0): LandmarkPoint[] => [
      { x: 0.56 + dx, y: 0.30 + dy, v: 0.95 }, // 0: lShoulder (unmirrored: dancer's left is viewer's right)
      { x: 0.44 + dx, y: 0.30 + dy, v: 0.95 }, // 1: rShoulder
      { x: 0.64 + dx, y: 0.42 + dy, v: 0.95 }, // 2: lElbow
      { x: 0.36 + dx, y: 0.42 + dy, v: 0.95 }, // 3: rElbow
      { x: 0.70 + dx, y: 0.54 + dy, v: 0.95 }, // 4: lWrist
      { x: 0.30 + dx, y: 0.54 + dy, v: 0.95 }, // 5: rWrist
      { x: 0.54 + dx, y: 0.58 + dy, v: 0.95 }, // 6: lHip
      { x: 0.46 + dx, y: 0.58 + dy, v: 0.95 }, // 7: rHip
      { x: 0.55 + dx, y: 0.76 + dy, v: 0.95 }, // 8: lKnee
      { x: 0.45 + dx, y: 0.76 + dy, v: 0.95 }, // 9: rKnee
      { x: 0.56 + dx, y: 0.92 + dy, v: 0.95 }, // 10: lAnkle
      { x: 0.44 + dx, y: 0.92 + dy, v: 0.95 }, // 11: rAnkle
    ];

    const lmCenter = makeStandingLandmarks(0, 0);
    const lmShifted = makeStandingLandmarks(0.25, -0.15);
    const frames: TemplateFrame[] = [
      { tMs: songMs(0), segments: ASYM, landmarks: lmCenter },
      { tMs: songMs(500), segments: ASYM, landmarks: lmShifted },
    ];

    const stage = computeStageTransform(frames, W, H, 16 / 9);
    const sCenter = buildSilhouetteFromLandmarks(lmCenter, W, H, stage);
    const sShifted = buildSilhouetteFromLandmarks(lmShifted, W, H, stage);

    const dxPx = sShifted.torso!.headCenter.x - sCenter.torso!.headCenter.x;
    const dyPx = sShifted.torso!.headCenter.y - sCenter.torso!.headCenter.y;
    expect(dxPx).toBeCloseTo(0.25 * stage.srcAspect * stage.pxPerUnit, 5);
    expect(dyPx).toBeCloseTo(-0.15 * stage.pxPerUnit, 5);
    expect(dxPx).toBeGreaterThan(40);
    expect(dyPx).toBeLessThan(-20);
  });

  it("preserves 2D foreshortening when an arm points toward the camera instead of forcing fixed 2D limb lengths", () => {
    const lm: LandmarkPoint[] = [
      { x: 0.56, y: 0.30, v: 0.95 }, // lShoulder
      { x: 0.44, y: 0.30, v: 0.95 }, // rShoulder
      { x: 0.58, y: 0.31, v: 0.95 }, // lElbow (very close to shoulder in 2D due to foreshortening)
      { x: 0.28, y: 0.30, v: 0.95 }, // rElbow (fully extended laterally)
      { x: 0.59, y: 0.32, v: 0.95 }, // lWrist (foreshortened toward camera)
      { x: 0.14, y: 0.30, v: 0.95 }, // rWrist (fully extended laterally)
      { x: 0.54, y: 0.58, v: 0.95 },
      { x: 0.46, y: 0.58, v: 0.95 },
      { x: 0.55, y: 0.76, v: 0.95 },
      { x: 0.45, y: 0.76, v: 0.95 },
      { x: 0.56, y: 0.92, v: 0.95 },
      { x: 0.44, y: 0.92, v: 0.95 },
    ];
    const stage = computeStageTransform([{ tMs: songMs(0), segments: ASYM, landmarks: lm }], W, H, 16 / 9);
    const s = buildSilhouetteFromLandmarks(lm, W, H, stage);

    const lUpper = limb(s, "l_upper_arm");
    const lFore = limb(s, "l_forearm");
    const rUpper = limb(s, "r_upper_arm");
    const rFore = limb(s, "r_forearm");

    const leftTotalLen =
      Math.hypot(lUpper.to.x - lUpper.from.x, lUpper.to.y - lUpper.from.y) +
      Math.hypot(lFore.to.x - lFore.from.x, lFore.to.y - lFore.from.y);
    const rightTotalLen =
      Math.hypot(rUpper.to.x - rUpper.from.x, rUpper.to.y - rUpper.from.y) +
      Math.hypot(rFore.to.x - rFore.from.x, rFore.to.y - rFore.from.y);

    expect(leftTotalLen).toBeLessThan(rightTotalLen * 0.25);
  });

  it("paints in strict back-to-front depth order (legs -> torso/head -> right arm -> left arm) with contrast casing, left/right colors, and joint circles", () => {
    const lm: LandmarkPoint[] = [
      { x: 0.56, y: 0.30, v: 0.95 }, // lShoulder
      { x: 0.44, y: 0.30, v: 0.95 }, // rShoulder
      { x: 0.52, y: 0.42, v: 0.95 }, // lElbow crossing over chest
      { x: 0.48, y: 0.42, v: 0.95 }, // rElbow crossing over chest
      { x: 0.46, y: 0.44, v: 0.95 }, // lWrist crossing over chest
      { x: 0.54, y: 0.44, v: 0.95 }, // rWrist crossing over chest
      { x: 0.54, y: 0.58, v: 0.95 },
      { x: 0.46, y: 0.58, v: 0.95 },
      { x: 0.55, y: 0.76, v: 0.95 },
      { x: 0.45, y: 0.76, v: 0.95 },
      { x: 0.56, y: 0.92, v: 0.95 },
      { x: 0.44, y: 0.92, v: 0.95 },
    ];
    const stage = computeStageTransform([{ tMs: songMs(0), segments: ASYM, landmarks: lm }], W, H, 16 / 9);
    const { ctx, calls } = createRecordingContext();
    drawCoach(ctx, W, H, ASYM, lm, stage);

    // Find the last torso/neck/head fill (#0ea5e9) index
    const lastTorsoHeadFillIdx = calls
      .map((c, idx) => (c[0] === "fill" && c[1] === "#0ea5e9" ? idx : -1))
      .filter((i) => i >= 0)
      .at(-1)!;
    expect(lastTorsoHeadFillIdx).toBeGreaterThan(0);

    // After torso + neck + head (#0ea5e9), Right Arm (#e9d5ff axis / #f3e8ff rim) is painted before Left Arm (#bae6fd axis / #e0f2fe rim)
    const postTorsoStrokes = calls
      .map((c, idx) => ({ call: c, idx }))
      .filter(({ call, idx }) => idx > lastTorsoHeadFillIdx && call[0] === "stroke");

    const rightArmAxisIndices = postTorsoStrokes.filter(({ call }) => call[1] === "#e9d5ff").map(({ idx }) => idx);
    const leftArmAxisIndices = postTorsoStrokes.filter(({ call }) => call[1] === "#bae6fd").map(({ idx }) => idx);
    expect(rightArmAxisIndices).toHaveLength(2); // r_upper_arm + r_forearm
    expect(leftArmAxisIndices).toHaveLength(2);  // l_upper_arm + l_forearm
    expect(Math.max(...rightArmAxisIndices)).toBeLessThan(Math.min(...leftArmAxisIndices));

    // Each arm contour fill is preceded by a dark separator moat (#090f1f)
    for (const axisIdx of [...rightArmAxisIndices, ...leftArmAxisIndices]) {
      const priorStrokes = calls.slice(0, axisIdx).filter((c) => c[0] === "stroke");
      expect(priorStrokes.some((s) => s[1] === "#090f1f")).toBe(true);
    }

    // 12 tracked joints * 3 concentric circles each (halo + ring + core) + 1 head anchor arc = 37 arc calls
    const arcCalls = calls.filter((c) => c[0] === "arc");
    expect(arcCalls).toHaveLength(37);

    // Seated / occluded lower-body landmarks are omitted without drawing lines to (0, 0)
    const seatedLm = lm.map((p, idx) => (idx >= LM.lHip ? { x: 0, y: 0, v: 0 } : p));
    const recSeated = createRecordingContext();
    drawCoach(recSeated.ctx, W, H, ASYM, seatedLm, stage);
    for (const c of recSeated.calls) {
      if (c[0] === "moveTo" || c[0] === "lineTo" || c[0] === "arc") {
        expect(c[1] === 0 && c[2] === 0).toBe(false);
      }
    }
  });
});
