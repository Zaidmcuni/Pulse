/**
 * Owner: Toufic
 * Purpose: rebuild a fixed-proportion figure from a template SegmentMap and draw it as the coach silhouette
 * FRs: FR-26
 *
 * The template is NOT mirrored: it looks like the source video, so the dancer's own left is on the
 * viewer's right. Directions are pixel-space unit vectors with y down, drawn with equal x and y scales.
 */
import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../config";
import type { LandmarkPoint, SegmentId, SegmentMap, TemplateFrame, Vec2 } from "../types/pulse";

export interface Point {
  x: number;
  y: number;
}

export interface Limb {
  segment: SegmentId;
  from: Point;
  to: Point;
}

export interface SilhouetteJoint {
  index: number;
  point: Point;
  side: "left" | "right";
}

export interface Silhouette {
  pxPerUnit: number;
  /** Present when the sample has a torso direction (or visible shoulders in landmark mode). */
  torso?: {
    lShoulder: Point;
    rShoulder: Point;
    lHip: Point;
    rHip: Point;
    neckBase: Point;
    headCenter: Point;
    seatedBarOnly?: boolean;
  };
  limbs: Limb[];
  joints?: SilhouetteJoint[];
}

export interface StageTransform {
  originX: number;
  originY: number;
  pxPerUnit: number;
  srcAspect: number;
}

/** Body proportions in figure units (visual only; gameplay thresholds live in CONFIG). */
const BODY = {
  torso: 0.3,         // hip midpoint -> shoulder midpoint
  shoulderHalf: 0.1,  // shoulder midpoint -> each shoulder
  hipHalf: 0.065,     // hip midpoint -> each hip
  upperArm: 0.16,
  forearm: 0.15,
  thigh: 0.22,
  shin: 0.21,
  neck: 0.04,
  headRadius: 0.07,
  limbWidth: 0.075,
  torsoRounding: 0.06, // stroke width that rounds the torso's corners
  outline: 0.018,      // outline thickness around every shape
} as const;

const UPRIGHT: Vec2 = [0, -1]; // hips -> shoulders when standing straight

/** Farthest any drawn shape can reach from the hip midpoint, so every pose stays inside the canvas. */
const REACH =
  Math.max(
    Math.hypot(BODY.torso, BODY.shoulderHalf) + BODY.upperArm + BODY.forearm,
    BODY.hipHalf + BODY.thigh + BODY.shin,
    BODY.torso + BODY.neck + 2 * BODY.headRadius,
  ) +
  BODY.limbWidth / 2 +
  BODY.outline;

const SEPARATOR_COLOR = "#090f1f";   // dark contrast moat between overlapping parts
const OUTLINE_COLOR = "#f3f6fc";     // --pulse-text bright rim
const TORSO_COLOR = "#0ea5e9";       // deep PULSE cyan for torso & head
const LEFT_LIMB_COLOR = "#38bdf8";   // bright sky cyan for dancer's left limbs
const RIGHT_LIMB_COLOR = "#c084fc";  // luminous violet for dancer's right limbs
const LEFT_JOINT_COLOR = "#e0f2fe";  // bright cyan-tinted core for left joints
const RIGHT_JOINT_COLOR = "#f3e8ff"; // bright violet-tinted core for right joints

const CHAINS: readonly {
  anchor: "lShoulder" | "rShoulder" | "lHip" | "rHip";
  links: readonly [SegmentId, SegmentId];
  lengths: readonly [number, number];
  indices: readonly [number, number, number];
  side: "left" | "right";
}[] = [
  { anchor: "lShoulder", links: ["l_upper_arm", "l_forearm"], lengths: [BODY.upperArm, BODY.forearm], indices: [LM.lShoulder, LM.lElbow, LM.lWrist], side: "left" },
  { anchor: "rShoulder", links: ["r_upper_arm", "r_forearm"], lengths: [BODY.upperArm, BODY.forearm], indices: [LM.rShoulder, LM.rElbow, LM.rWrist], side: "right" },
  { anchor: "lHip", links: ["l_thigh", "l_shin"], lengths: [BODY.thigh, BODY.shin], indices: [LM.lHip, LM.lKnee, LM.lAnkle], side: "left" },
  { anchor: "rHip", links: ["r_thigh", "r_shin"], lengths: [BODY.thigh, BODY.shin], indices: [LM.rHip, LM.rKnee, LM.rAnkle], side: "right" },
];

const LANDMARK_LIMBS: readonly { segment: SegmentId; from: number; to: number }[] = [
  { segment: "l_upper_arm", from: LM.lShoulder, to: LM.lElbow },
  { segment: "l_forearm",   from: LM.lElbow,    to: LM.lWrist },
  { segment: "r_upper_arm", from: LM.rShoulder, to: LM.rElbow },
  { segment: "r_forearm",   from: LM.rElbow,    to: LM.rWrist },
  { segment: "l_thigh",     from: LM.lHip,      to: LM.lKnee },
  { segment: "l_shin",      from: LM.lKnee,     to: LM.lAnkle },
  { segment: "r_thigh",     from: LM.rHip,      to: LM.rKnee },
  { segment: "r_shin",      from: LM.rKnee,     to: LM.rAnkle },
];

function along(p: Point, dir: Vec2, length: number): Point {
  return { x: p.x + dir[0] * length, y: p.y + dir[1] * length };
}

function isVisibleLandmark(pt: LandmarkPoint | undefined): pt is LandmarkPoint {
  return Boolean(
    pt &&
      Number.isFinite(pt.x) &&
      Number.isFinite(pt.y) &&
      Number.isFinite(pt.v) &&
      pt.v >= CONFIG.visibilityMin,
  );
}

/**
 * Computes a single constant stage projection across all frames of a dance so full-body lateral
 * steps, jumps, and crouches translate faithfully on the canvas without clipping or camera-locking.
 */
export function computeStageTransform(
  frames: readonly TemplateFrame[],
  widthPx: number,
  heightPx: number,
  srcAspect = 16 / 9,
): StageTransform {
  const safeAspect = Number.isFinite(srcAspect) && srcAspect > 0 ? srcAspect : 16 / 9;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length !== SCORED_LANDMARK_INDICES.length) continue;
    for (const pt of frame.landmarks) {
      if (!isVisibleLandmark(pt)) continue;
      const u = (pt.x - 0.5) * safeAspect;
      const v = pt.y - 0.5;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      found = true;
    }
  }

  if (!found) {
    return {
      originX: widthPx / 2,
      originY: heightPx / 2,
      pxPerUnit: Math.min(heightPx * 0.85, widthPx / (safeAspect * 0.65)),
      srcAspect: safeAspect,
    };
  }

  const paddedMinU = minU - 0.1;
  const paddedMaxU = maxU + 0.1;
  const paddedMinV = minV - 0.14;
  const paddedMaxV = maxV + 0.1;
  const spanU = Math.max(0.45, paddedMaxU - paddedMinU);
  const spanV = Math.max(0.65, paddedMaxV - paddedMinV);
  const pxPerUnit = Math.min(widthPx / spanU, heightPx / spanV);
  const centerU = (paddedMinU + paddedMaxU) / 2;
  const centerV = (paddedMinV + paddedMaxV) / 2;

  return {
    originX: widthPx / 2 - centerU * pxPerUnit,
    originY: heightPx / 2 - centerV * pxPerUnit,
    pxPerUnit,
    srcAspect: safeAspect,
  };
}

/** Joint positions in canvas pixels for one pose, hips centred in a widthPx x heightPx canvas. */
export function buildSilhouette(segments: SegmentMap, widthPx: number, heightPx: number): Silhouette {
  const pxPerUnit = Math.min(widthPx, heightPx) / (2 * REACH);
  const hipMid: Point = { x: widthPx / 2, y: heightPx / 2 };
  const up = segments.torso ?? UPRIGHT;
  // Perpendicular toward the dancer's own left: (1, 0) (viewer's right) when upright, and it turns with the torso.
  const left: Vec2 = [-up[1], up[0]];
  const shoulderMid = along(hipMid, up, BODY.torso * pxPerUnit);
  const anchors = {
    lShoulder: along(shoulderMid, left, BODY.shoulderHalf * pxPerUnit),
    rShoulder: along(shoulderMid, left, -BODY.shoulderHalf * pxPerUnit),
    lHip: along(hipMid, left, BODY.hipHalf * pxPerUnit),
    rHip: along(hipMid, left, -BODY.hipHalf * pxPerUnit),
  };

  const jointMap = new Map<number, SilhouetteJoint>();
  if (segments.torso) {
    jointMap.set(LM.lShoulder, { index: LM.lShoulder, point: anchors.lShoulder, side: "left" });
    jointMap.set(LM.rShoulder, { index: LM.rShoulder, point: anchors.rShoulder, side: "right" });
    jointMap.set(LM.lHip, { index: LM.lHip, point: anchors.lHip, side: "left" });
    jointMap.set(LM.rHip, { index: LM.rHip, point: anchors.rHip, side: "right" });
  }

  const limbs: Limb[] = [];
  for (const chain of CHAINS) {
    let joint = anchors[chain.anchor];
    for (let i = 0; i < chain.links.length; i++) {
      const dir = segments[chain.links[i]];
      if (!dir) break; // nothing to attach the next link to
      const next = along(joint, dir, chain.lengths[i] * pxPerUnit);
      limbs.push({ segment: chain.links[i], from: joint, to: next });
      const fromIdx = chain.indices[i];
      const toIdx = chain.indices[i + 1];
      if (!jointMap.has(fromIdx)) {
        jointMap.set(fromIdx, { index: fromIdx, point: joint, side: chain.side });
      }
      jointMap.set(toIdx, { index: toIdx, point: next, side: chain.side });
      joint = next;
    }
  }

  const joints = [...jointMap.values()];
  if (!segments.torso) return { pxPerUnit, limbs, joints };
  const neckBase = along(shoulderMid, up, BODY.neck * pxPerUnit);
  const headCenter = along(neckBase, up, BODY.headRadius * pxPerUnit);
  return { pxPerUnit, limbs, joints, torso: { ...anchors, neckBase, headCenter } };
}

/**
 * Builds a stage-accurate silhouette directly from 12 tracked landmarks and a fixed `StageTransform`.
 * Preserves full-body translation across the floor and 2D foreshortening when limbs reach toward the camera.
 */
export function buildSilhouetteFromLandmarks(
  landmarks: readonly LandmarkPoint[],
  widthPx: number,
  heightPx: number,
  stage?: StageTransform,
): Silhouette {
  const st = stage ?? computeStageTransform([], widthPx, heightPx);
  const projected: Array<Point | undefined> = new Array<Point | undefined>(SCORED_LANDMARK_INDICES.length);
  const joints: SilhouetteJoint[] = [];

  for (let i = 0; i < SCORED_LANDMARK_INDICES.length; i++) {
    const pt = landmarks[i];
    if (!isVisibleLandmark(pt)) continue;
    const p: Point = {
      x: st.originX + (pt.x - 0.5) * st.srcAspect * st.pxPerUnit,
      y: st.originY + (pt.y - 0.5) * st.pxPerUnit,
    };
    projected[i] = p;
    joints.push({ index: i, point: p, side: i % 2 === 0 ? "left" : "right" });
  }

  const limbs: Limb[] = [];
  for (const spec of LANDMARK_LIMBS) {
    const from = projected[spec.from];
    const to = projected[spec.to];
    if (from && to) {
      limbs.push({ segment: spec.segment, from, to });
    }
  }

  const lS = projected[LM.lShoulder];
  const rS = projected[LM.rShoulder];
  const lH = projected[LM.lHip];
  const rH = projected[LM.rHip];

  const trackedShoulderSpan = lS && rS ? Math.hypot(rS.x - lS.x, rS.y - lS.y) : 0;
  const trackedTorsoLen =
    lS && rS && lH && rH
      ? Math.hypot((lS.x + rS.x - (lH.x + rH.x)) / 2, (lS.y + rS.y - (lH.y + rH.y)) / 2)
      : 0;

  const rawBodyScale = Math.max(trackedShoulderSpan, trackedTorsoLen * 0.65, st.pxPerUnit * 0.16);
  const clampedBodyScale = Math.min(st.pxPerUnit * 0.32, Math.max(st.pxPerUnit * 0.14, rawBodyScale));
  const pxPerUnit = clampedBodyScale / (2 * BODY.shoulderHalf);

  if (lS && rS && lH && rH) {
    const shoulderMid: Point = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
    const hipMid: Point = { x: (lH.x + rH.x) / 2, y: (lH.y + rH.y) / 2 };
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y;
    const len = Math.hypot(dx, dy);
    const up: Vec2 = len > 1e-3 ? [dx / len, dy / len] : UPRIGHT;
    const neckBase = along(shoulderMid, up, BODY.neck * pxPerUnit);
    const headCenter = along(neckBase, up, BODY.headRadius * pxPerUnit);
    return {
      pxPerUnit,
      limbs,
      joints,
      torso: { lShoulder: lS, rShoulder: rS, lHip: lH, rHip: rH, neckBase, headCenter },
    };
  }

  if (lS && rS) {
    const shoulderMid: Point = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
    const neckBase = along(shoulderMid, UPRIGHT, BODY.neck * pxPerUnit);
    const headCenter = along(neckBase, UPRIGHT, BODY.headRadius * pxPerUnit);
    return {
      pxPerUnit,
      limbs,
      joints,
      torso: {
        lShoulder: lS,
        rShoulder: rS,
        lHip: lS,
        rHip: rS,
        neckBase,
        headCenter,
        seatedBarOnly: true,
      },
    };
  }

  return { pxPerUnit, limbs, joints };
}

/** The canvas calls drawCoach uses (a recording fake implements these in tests). */
export type CoachDrawContext = Pick<
  CanvasRenderingContext2D,
  "clearRect" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "arc" | "fill" | "stroke"
  | "fillStyle" | "strokeStyle" | "lineWidth" | "lineCap" | "lineJoin"
>;

export function traceLine(
  ctx: Pick<CoachDrawContext, "beginPath" | "moveTo" | "lineTo">,
  from: Point,
  to: Point,
): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
}

export function traceTorso(
  ctx: Pick<CoachDrawContext, "beginPath" | "moveTo" | "lineTo" | "closePath">,
  leftShoulder: Point,
  rightShoulder: Point,
  rightHip: Point,
  leftHip: Point,
): void {
  ctx.beginPath();
  ctx.moveTo(leftShoulder.x, leftShoulder.y);
  ctx.lineTo(rightShoulder.x, rightShoulder.y);
  ctx.lineTo(rightHip.x, rightHip.y);
  ctx.lineTo(leftHip.x, leftHip.y);
  ctx.closePath();
}

export function traceCircle(ctx: Pick<CoachDrawContext, "beginPath" | "arc">, center: Point, radius: number): void {
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
}

/**
 * Clears the canvas, then draws the pose in strict back-to-front painter's order
 * (Legs -> Torso/Head -> Right Arm -> Left Arm) with per-part dark contrast separator casing,
 * distinct left/right limb colors, and articulated circular joint nodes.
 * Empty pose = clear canvas.
 */
export function drawCoach(
  ctx: CoachDrawContext,
  widthPx: number,
  heightPx: number,
  segments: SegmentMap,
  landmarks?: readonly LandmarkPoint[],
  stage?: StageTransform,
): void {
  ctx.clearRect(0, 0, widthPx, heightPx);
  const s =
    landmarks && landmarks.length === SCORED_LANDMARK_INDICES.length
      ? buildSilhouetteFromLandmarks(landmarks, widthPx, heightPx, stage)
      : buildSilhouette(segments, widthPx, heightPx);

  if (!s.torso && s.limbs.length === 0 && (!s.joints || s.joints.length === 0)) {
    return;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const px = s.pxPerUnit;
  const limbById = new Map<SegmentId, Limb>();
  for (const limb of s.limbs) {
    limbById.set(limb.segment, limb);
  }
  const jointByIndex = new Map<number, SilhouetteJoint>();
  if (s.joints) {
    for (const j of s.joints) {
      jointByIndex.set(j.index, j);
    }
  }

  const paintLimbSegment = (id: SegmentId, fillColor: string): void => {
    const limb = limbById.get(id);
    if (!limb) return;
    paintCasedLine(ctx, limb.from, limb.to, BODY.limbWidth, fillColor, px);
  };

  const paintJointNode = (idx: number): void => {
    const j = jointByIndex.get(idx);
    if (!j) return;
    const coreRadius = BODY.limbWidth * 0.34 * px;
    const sepRadius = (BODY.limbWidth * 0.34 + BODY.outline * 0.9) * px;
    ctx.fillStyle = SEPARATOR_COLOR;
    traceCircle(ctx, j.point, sepRadius);
    ctx.fill();
    ctx.fillStyle = j.side === "left" ? LEFT_JOINT_COLOR : RIGHT_JOINT_COLOR;
    traceCircle(ctx, j.point, coreRadius);
    ctx.fill();
  };

  // 1. Back layer: Legs (Left leg -> Right leg)
  if (!s.torso) paintJointNode(LM.lHip);
  paintLimbSegment("l_thigh", LEFT_LIMB_COLOR);
  paintLimbSegment("l_shin", LEFT_LIMB_COLOR);
  paintJointNode(LM.lKnee);
  paintJointNode(LM.lAnkle);

  if (!s.torso) paintJointNode(LM.rHip);
  paintLimbSegment("r_thigh", RIGHT_LIMB_COLOR);
  paintLimbSegment("r_shin", RIGHT_LIMB_COLOR);
  paintJointNode(LM.rKnee);
  paintJointNode(LM.rAnkle);

  // 2. Middle layer: Torso + shoulder/hip joints + neck + head
  if (s.torso) {
    const t = s.torso;
    if (t.seatedBarOnly) {
      paintCasedLine(ctx, t.lShoulder, t.rShoulder, BODY.limbWidth * 1.15, TORSO_COLOR, px);
    } else {
      paintTorsoLayer(ctx, t, SEPARATOR_COLOR, 2 * BODY.outline, px);
      paintTorsoLayer(ctx, t, OUTLINE_COLOR, BODY.outline, px);
      paintTorsoLayer(ctx, t, TORSO_COLOR, 0, px);
      paintJointNode(LM.lHip);
      paintJointNode(LM.rHip);
    }

    paintJointNode(LM.lShoulder);
    paintJointNode(LM.rShoulder);

    const shoulderMid: Point = {
      x: (t.lShoulder.x + t.rShoulder.x) / 2,
      y: (t.lShoulder.y + t.rShoulder.y) / 2,
    };
    paintCasedLine(ctx, shoulderMid, t.neckBase, BODY.limbWidth * 0.85, TORSO_COLOR, px);

    ctx.fillStyle = SEPARATOR_COLOR;
    traceCircle(ctx, t.headCenter, (BODY.headRadius + 2 * BODY.outline) * px);
    ctx.fill();

    ctx.fillStyle = OUTLINE_COLOR;
    traceCircle(ctx, t.headCenter, (BODY.headRadius + BODY.outline) * px);
    ctx.fill();

    ctx.fillStyle = TORSO_COLOR;
    traceCircle(ctx, t.headCenter, BODY.headRadius * px);
    ctx.fill();
  }

  // 3. Front-mid layer: Right Arm
  if (!s.torso) paintJointNode(LM.rShoulder);
  paintLimbSegment("r_upper_arm", RIGHT_LIMB_COLOR);
  paintLimbSegment("r_forearm", RIGHT_LIMB_COLOR);
  paintJointNode(LM.rElbow);
  paintJointNode(LM.rWrist);

  // 4. Top layer: Left Arm
  if (!s.torso) paintJointNode(LM.lShoulder);
  paintLimbSegment("l_upper_arm", LEFT_LIMB_COLOR);
  paintLimbSegment("l_forearm", LEFT_LIMB_COLOR);
  paintJointNode(LM.lElbow);
  paintJointNode(LM.lWrist);
}

function paintCasedLine(
  ctx: CoachDrawContext,
  from: Point,
  to: Point,
  baseWidthUnits: number,
  fillColor: string,
  px: number,
): void {
  ctx.strokeStyle = SEPARATOR_COLOR;
  ctx.lineWidth = (baseWidthUnits + 4 * BODY.outline) * px;
  traceLine(ctx, from, to);
  ctx.stroke();

  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = (baseWidthUnits + 2 * BODY.outline) * px;
  traceLine(ctx, from, to);
  ctx.stroke();

  ctx.strokeStyle = fillColor;
  ctx.lineWidth = baseWidthUnits * px;
  traceLine(ctx, from, to);
  ctx.stroke();
}

function paintTorsoLayer(
  ctx: CoachDrawContext,
  t: NonNullable<Silhouette["torso"]>,
  color: string,
  growUnits: number,
  px: number,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = (BODY.torsoRounding + 2 * growUnits) * px;
  traceTorso(ctx, t.lShoulder, t.rShoulder, t.rHip, t.lHip);
  ctx.fill();
  ctx.stroke();
}
