/**
 * Owner: Toufic
 * Purpose: 9:16 silhouette replay of recorded samples, interpolated to 60 FPS
 * FRs: FR-49 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../config";
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
  type LimbProfileStation,
} from "../coach/humanContours";
import { traceCircle, traceLine } from "../coach/silhouette";
import { songMs, type LandmarkPoint, type RecordedPoseSample, type Vec2 } from "../types/pulse";

export const CLIP_WIDTH_PX = 540;
export const CLIP_HEIGHT_PX = 960;

const VIS_FADE_START = 0.2;
const ALPHA_THRESHOLD = 0.01;
// Allow a missed sample before treating an interval as tracking loss.
const POSE_FADE_MS = 2_000 / CONFIG.clipFps;

const SEPARATOR_COLOR = "#070b18";
const TORSO_COLOR = "#0ea5e9";
const LEFT_LIMB_COLOR = "#38bdf8";
const RIGHT_LIMB_COLOR = "#c084fc";
const LEFT_RIM_COLOR = "#e0f2fe";
const RIGHT_RIM_COLOR = "#f3e8ff";
const LEFT_AXIS_COLOR = "#bae6fd";
const RIGHT_AXIS_COLOR = "#e9d5ff";
const JOINT_CORE_COLOR = "#f8fafc";

export interface ClipStageTransform {
  centerX: number;
  centerY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export type ClipGradient = Pick<CanvasGradient, "addColorStop">;

/** Minimal 2D canvas drawing surface used by renderClipFrame (satisfied by CanvasRenderingContext2D). */
export type ClipDrawContext = Pick<
  CanvasRenderingContext2D,
  | "fillRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "arc"
  | "fill"
  | "stroke"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "lineJoin"
  | "globalAlpha"
  | "shadowColor"
  | "shadowBlur"
> & {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): ClipGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): ClipGradient;
};

export interface ClipFrameScheduler {
  request(cb: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

const BROWSER_SCHEDULER: ClipFrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Computes smooth limb opacity from joint visibilities:
 * 0 at minV <= 0.2, ramping smoothly to 1 at minV >= CONFIG.visibilityMin.
 */
export function computeLimbAlpha(vA: number, vB: number): number {
  if (!Number.isFinite(vA) || !Number.isFinite(vB)) {
    return 0;
  }
  const minV = Math.min(vA, vB);
  if (minV <= VIS_FADE_START) {
    return 0;
  }
  if (minV >= CONFIG.visibilityMin) {
    return 1;
  }
  return clamp01((minV - VIS_FADE_START) / (CONFIG.visibilityMin - VIS_FADE_START));
}

function reliableLandmark(point: LandmarkPoint | undefined): point is LandmarkPoint {
  return point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Number.isFinite(point.v) && point.v >= CONFIG.visibilityMin;
}

function fadePose(sample: RecordedPoseSample, targetMs: number): RecordedPoseSample {
  const opacity = clamp01(1 - Math.abs(targetMs - sample.tSongMs) / POSE_FADE_MS);
  return {
    tSongMs: songMs(targetMs),
    points: sample.points.map((point) => ({
      ...point,
      v: reliableLandmark(point) ? point.v * opacity : 0,
    })),
  };
}

function interpolateLandmark(p: LandmarkPoint | undefined, n: LandmarkPoint | undefined, alpha: number): LandmarkPoint {
  const prevValid = reliableLandmark(p);
  const nextValid = reliableLandmark(n);
  const prevV = prevValid ? clamp01(p.v) : 0;
  const nextV = nextValid ? clamp01(n.v) : 0;
  const v = prevV + (nextV - prevV) * alpha;

  if (prevValid && nextValid) {
    return {
      x: p.x + (n.x - p.x) * alpha,
      y: p.y + (n.y - p.y) * alpha,
      v,
    };
  }
  if (prevValid) {
    // Hold last valid joint coordinates while fading visibility out to avoid snapping toward (0, 0).
    return { x: p.x, y: p.y, v };
  }
  if (nextValid) {
    // Hold incoming valid joint coordinates while fading visibility in from (0, 0).
    return { x: n.x, y: n.y, v };
  }
  return { x: 0, y: 0, v: 0 };
}

/**
 * Samples and interpolates recorded pose frames at `targetMs` using binary search.
 * Expects `samples` to be ordered by ascending `tSongMs`.
 */
export function interpolateRecordedPose(
  samples: readonly RecordedPoseSample[],
  targetMs: number,
): RecordedPoseSample | null {
  if (samples.length === 0 || !Number.isFinite(targetMs)) {
    return null;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (targetMs <= first.tSongMs) {
    return fadePose(first, targetMs);
  }
  if (targetMs >= last.tSongMs) {
    return fadePose(last, targetMs);
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tSongMs <= targetMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const prev = samples[lo];
  const next = samples[hi];
  const gapMs = next.tSongMs - prev.tSongMs;
  if (gapMs <= 0) {
    return prev;
  }
  if (gapMs > POSE_FADE_MS * 2) {
    const nearest = targetMs - prev.tSongMs <= next.tSongMs - targetMs ? prev : next;
    return fadePose(nearest, targetMs);
  }

  const alpha = clamp01((targetMs - prev.tSongMs) / gapMs);
  const count = Math.max(prev.points.length, next.points.length);
  const points: LandmarkPoint[] = new Array<LandmarkPoint>(count);
  for (let i = 0; i < count; i += 1) {
    points[i] = interpolateLandmark(prev.points[i], next.points[i], alpha);
  }

  return {
    tSongMs: songMs(targetMs),
    points,
  };
}

function drawBackdrop(
  ctx: ClipDrawContext,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
): void {
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#070b18");
  bgGrad.addColorStop(0.55, "#0d1630");
  bgGrad.addColorStop(1, "#070b18");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const glowRadius = Math.max(width, height) * 0.48;
  const glowGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
  glowGrad.addColorStop(0, "rgba(56, 189, 248, 0.20)");
  glowGrad.addColorStop(0.55, "rgba(56, 189, 248, 0.06)");
  glowGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Computes a single constant 9:16 stage transform across the `[startSec, startSec + durationSec]`
 * clip window so full-body lateral stepping, jumping, and crouching stay framed without
 * re-centering per frame.
 */
export function computeClipStageTransform(
  samples: readonly RecordedPoseSample[],
  startSec: number,
  durationSec: number = CONFIG.clipLengthSec,
  width: number = CLIP_WIDTH_PX,
  height: number = CLIP_HEIGHT_PX,
): ClipStageTransform {
  const centerX = width * 0.5;
  const centerY = height * 0.46;
  const defaultScale = width * 0.24;
  const minScale = width * 0.14;
  const maxScale = width * 0.28;

  const startMs = Number.isFinite(startSec) ? startSec * 1000 : 0;
  const durMs = (Number.isFinite(durationSec) && durationSec > 0 ? durationSec : CONFIG.clipLengthSec) * 1000;
  const endMs = startMs + durMs;

  const inWindow = samples.filter((s) => s.tSongMs >= startMs && s.tSongMs <= endMs);
  const activeSamples = inWindow.length > 0 ? inWindow : samples;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasPoints = false;

  let minAnchorX = Number.POSITIVE_INFINITY;
  let maxAnchorX = Number.NEGATIVE_INFINITY;
  let minAnchorY = Number.POSITIVE_INFINITY;
  let maxAnchorY = Number.NEGATIVE_INFINITY;
  let hasAnchors = false;

  const isVisible = (pt: LandmarkPoint | undefined): pt is LandmarkPoint =>
    Boolean(pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.v) && pt.v > VIS_FADE_START);

  for (const sample of activeSamples) {
    const pts = sample.points;
    for (const pt of pts) {
      if (!isVisible(pt)) continue;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
      hasPoints = true;
    }

    const lS = pts[LM.lShoulder];
    const rS = pts[LM.rShoulder];
    const lH = pts[LM.lHip];
    const rH = pts[LM.rHip];
    let ax: number | null = null;
    let ay: number | null = null;
    if (isVisible(lS) && isVisible(rS) && isVisible(lH) && isVisible(rH)) {
      ax = (lS.x + rS.x + lH.x + rH.x) / 4;
      ay = (lS.y + rS.y + lH.y + rH.y) / 4;
    } else if (isVisible(lS) && isVisible(rS)) {
      ax = (lS.x + rS.x) / 2;
      ay = (lS.y + rS.y) / 2;
    } else if (isVisible(lH) && isVisible(rH)) {
      ax = (lH.x + rH.x) / 2;
      ay = (lH.y + rH.y) / 2;
    }
    if (ax !== null && ay !== null) {
      if (ax < minAnchorX) minAnchorX = ax;
      if (ax > maxAnchorX) maxAnchorX = ax;
      if (ay < minAnchorY) minAnchorY = ay;
      if (ay > maxAnchorY) maxAnchorY = ay;
      hasAnchors = true;
    }
  }

  if (!hasPoints) {
    return { centerX, centerY, scale: defaultScale, offsetX: 0, offsetY: 0 };
  }

  const rawOffsetX = hasAnchors ? (minAnchorX + maxAnchorX) / 2 : (minX + maxX) / 2;
  const rawOffsetY = hasAnchors ? (minAnchorY + maxAnchorY) / 2 : (minY + maxY) / 2;
  const offsetX = Math.abs(rawOffsetX) < 1e-6 ? 0 : rawOffsetX;
  const offsetY = Math.abs(rawOffsetY) < 1e-6 ? 0 : rawOffsetY;

  const halfExtentX = Math.max(1.8, Math.abs(minX - offsetX) + 0.25, Math.abs(maxX - offsetX) + 0.25);
  const topReach = Math.max(1.35, -(minY - 0.75 - offsetY));
  const bottomReach = Math.max(2.35, maxY + 0.25 - offsetY);

  const fitScale = Math.min(
    defaultScale,
    (width * 0.44) / Math.max(0.5, halfExtentX),
    (centerY * 0.88) / topReach,
    ((height - centerY) * 0.9) / bottomReach,
  );
  const scale = Math.max(minScale, Math.min(maxScale, fitScale));

  return { centerX, centerY, scale, offsetX, offsetY };
}

function jointHierarchyRadius(idx: number, bodyScale: number): number {
  if (idx === LM.lShoulder || idx === LM.rShoulder || idx === LM.lHip || idx === LM.rHip) {
    return Math.max(2.5, bodyScale * 0.054);
  }
  if (idx === LM.lElbow || idx === LM.rElbow || idx === LM.lKnee || idx === LM.rKnee) {
    return Math.max(2.2, bodyScale * 0.048);
  }
  return Math.max(2.0, bodyScale * 0.042);
}

/**
 * Draws one 9:16 silhouette frame from normalized `RecordedPoseSample` points.
 * `poseRecorder` normalizes `PoseFrame.points`, which `computePoseFrame` already mirrored
 * (`x -> 1 - x` and left/right swapped), so `centerX + (nx - offsetX) * scale` preserves mirror alignment.
 * Paints in strict back-to-front order (Legs -> Torso/Neck/Head -> Right Arm -> Left Arm) using sculpted
 * human contour polygons, dark separation moats, distinct left/right colors, subtle axis highlights,
 * and hierarchical precision landmark nodes.
 */
export function renderClipFrame(
  ctx: ClipDrawContext,
  pose: RecordedPoseSample | null,
  width: number = CLIP_WIDTH_PX,
  height: number = CLIP_HEIGHT_PX,
  stage?: ClipStageTransform,
): void {
  const st: ClipStageTransform = stage ?? {
    centerX: width * 0.5,
    centerY: height * 0.46,
    scale: width * 0.24,
    offsetX: 0,
    offsetY: 0,
  };
  const { centerX, centerY, scale, offsetX, offsetY } = st;
  const bodyScale = scale;

  const project = (pt: LandmarkPoint): { x: number; y: number } => ({
    x: centerX + (pt.x - offsetX) * scale,
    y: centerY + (pt.y - offsetY) * scale,
  });

  const paintContour = (
    pts: readonly ContourPoint[],
    fillColor: string,
    rimColor: string,
    alpha: number,
  ): void => {
    if (pts.length < 3 || alpha <= ALPHA_THRESHOLD) return;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 1. Dark separation moat
    ctx.shadowBlur = 0;
    ctx.strokeStyle = SEPARATOR_COLOR;
    ctx.lineWidth = Math.max(2, bodyScale * 0.042);
    tracePolygon(ctx, pts);
    ctx.stroke();

    // 2. Sculpted human body fill (with restrained outer neon glow) + crisp luminous rim
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = bodyScale * 0.14;
    ctx.fillStyle = fillColor;
    tracePolygon(ctx, pts);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = Math.max(1, bodyScale * 0.018);
    ctx.stroke();
  };

  try {
    drawBackdrop(ctx, width, height, centerX, centerY);

    if (pose === null || pose.points.length !== SCORED_LANDMARK_INDICES.length) {
      return;
    }

    const pts = pose.points;

    const paintSculptedLimb = (
      idxA: number,
      idxB: number,
      stations: readonly LimbProfileStation[],
      fillColor: string,
      rimColor: string,
      axisColor: string,
      extremity?: "hand" | "footLeft" | "footRight",
    ): void => {
      const a = pts[idxA];
      const b = pts[idxB];
      const alpha = computeLimbAlpha(a.v, b.v);
      if (
        alpha <= ALPHA_THRESHOLD ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y)
      ) {
        return;
      }
      const pa = project(a);
      const pb = project(b);
      const contour = buildLimbContour(pa, pb, stations, bodyScale);
      paintContour(contour, fillColor, rimColor, alpha);

      if (extremity === "hand") {
        const hand = buildHandContour(pa, pb, bodyScale);
        paintContour(hand, fillColor, rimColor, alpha);
      } else if (extremity === "footLeft" || extremity === "footRight") {
        const foot = buildFootContour(pa, pb, bodyScale, extremity === "footLeft" ? 1 : -1);
        paintContour(foot, fillColor, rimColor, alpha);
      }

      // Subtle internal bone-axis highlight
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = Math.max(1, bodyScale * 0.022);
      traceLine(ctx, pa, pb);
      ctx.stroke();
    };

    const drawJointNode = (idx: number, ringColor: string): void => {
      const pt = pts[idx];
      const alpha = computeLimbAlpha(pt.v, pt.v);
      if (alpha <= ALPHA_THRESHOLD || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        return;
      }
      const p = project(pt);
      const r = jointHierarchyRadius(idx, bodyScale);
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 0;
      // 1. Dark contrast halo
      ctx.fillStyle = SEPARATOR_COLOR;
      traceCircle(ctx, p, r * 1.42);
      ctx.fill();
      // 2. Side-coded luminous ring
      ctx.fillStyle = ringColor;
      traceCircle(ctx, p, r * 1.05);
      ctx.fill();
      // 3. Bright precision core
      ctx.fillStyle = JOINT_CORE_COLOR;
      traceCircle(ctx, p, r * 0.56);
      ctx.fill();
    };

    // 1. Back layer: Legs (Left leg -> Right leg)
    paintSculptedLimb(LM.lHip, LM.lKnee, THIGH_PROFILE, LEFT_LIMB_COLOR, LEFT_RIM_COLOR, LEFT_AXIS_COLOR);
    paintSculptedLimb(LM.lKnee, LM.lAnkle, SHIN_PROFILE, LEFT_LIMB_COLOR, LEFT_RIM_COLOR, LEFT_AXIS_COLOR, "footLeft");
    drawJointNode(LM.lKnee, LEFT_LIMB_COLOR);
    drawJointNode(LM.lAnkle, LEFT_LIMB_COLOR);

    paintSculptedLimb(LM.rHip, LM.rKnee, THIGH_PROFILE, RIGHT_LIMB_COLOR, RIGHT_RIM_COLOR, RIGHT_AXIS_COLOR);
    paintSculptedLimb(LM.rKnee, LM.rAnkle, SHIN_PROFILE, RIGHT_LIMB_COLOR, RIGHT_RIM_COLOR, RIGHT_AXIS_COLOR, "footRight");
    drawJointNode(LM.rKnee, RIGHT_LIMB_COLOR);
    drawJointNode(LM.rAnkle, RIGHT_LIMB_COLOR);

    // 2. Middle layer: Sculpted Torso + shoulder/hip joints + tapered neck + oval head
    const lShoulder = pts[LM.lShoulder];
    const rShoulder = pts[LM.rShoulder];
    const lHip = pts[LM.lHip];
    const rHip = pts[LM.rHip];

    const shoulderAlpha = computeLimbAlpha(lShoulder.v, rShoulder.v);
    const hipAlpha = computeLimbAlpha(lHip.v, rHip.v);
    const torsoAlpha = Math.min(shoulderAlpha, hipAlpha);

    if (shoulderAlpha > ALPHA_THRESHOLD && Number.isFinite(lShoulder.x) && Number.isFinite(rShoulder.x)) {
      const pLS = project(lShoulder);
      const pRS = project(rShoulder);
      const shoulderMid = {
        x: (pLS.x + pRS.x) * 0.5,
        y: (pLS.y + pRS.y) * 0.5,
      };
      let up: Vec2 = [0, -1];

      if (torsoAlpha > ALPHA_THRESHOLD) {
        const pLH = project(lHip);
        const pRH = project(rHip);
        const hipMid = {
          x: (pLH.x + pRH.x) * 0.5,
          y: (pLH.y + pRH.y) * 0.5,
        };
        const dx = shoulderMid.x - hipMid.x;
        const dy = shoulderMid.y - hipMid.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-3) {
          up = [dx / len, dy / len];
        }
        const torsoContour = buildTorsoContour(pLS, pRS, pLH, pRH, bodyScale);
        paintContour(torsoContour, TORSO_COLOR, LEFT_RIM_COLOR, torsoAlpha);
        drawJointNode(LM.lHip, LEFT_LIMB_COLOR);
        drawJointNode(LM.rHip, RIGHT_LIMB_COLOR);
      } else {
        // Seated fallback when hips are occluded: sculpted upper-torso bust without using (0, 0) hips.
        const bustContour = buildSeatedTorsoContour(pLS, pRS, bodyScale);
        paintContour(bustContour, TORSO_COLOR, LEFT_RIM_COLOR, shoulderAlpha);
      }

      drawJointNode(LM.lShoulder, LEFT_LIMB_COLOR);
      drawJointNode(LM.rShoulder, RIGHT_LIMB_COLOR);

      const neckContour = buildNeckContour(shoulderMid, up, bodyScale);
      paintContour(neckContour, TORSO_COLOR, LEFT_RIM_COLOR, shoulderAlpha);

      const headCenter = {
        x: shoulderMid.x + up[0] * 0.48 * bodyScale,
        y: shoulderMid.y + up[1] * 0.48 * bodyScale,
      };
      const headContour = buildHeadContour(headCenter, up, bodyScale);
      paintContour(headContour, TORSO_COLOR, LEFT_RIM_COLOR, shoulderAlpha);

      // Inner cranium anchor arc (blends into TORSO_COLOR fill)
      ctx.globalAlpha = shoulderAlpha;
      ctx.shadowBlur = 0;
      ctx.fillStyle = TORSO_COLOR;
      traceCircle(ctx, headCenter, bodyScale * 0.18);
      ctx.fill();
    } else {
      drawJointNode(LM.lHip, LEFT_LIMB_COLOR);
      drawJointNode(LM.rHip, RIGHT_LIMB_COLOR);
      drawJointNode(LM.lShoulder, LEFT_LIMB_COLOR);
      drawJointNode(LM.rShoulder, RIGHT_LIMB_COLOR);
    }

    // 3. Front-mid layer: Right Arm
    paintSculptedLimb(LM.rShoulder, LM.rElbow, UPPER_ARM_PROFILE, RIGHT_LIMB_COLOR, RIGHT_RIM_COLOR, RIGHT_AXIS_COLOR);
    paintSculptedLimb(LM.rElbow, LM.rWrist, FOREARM_PROFILE, RIGHT_LIMB_COLOR, RIGHT_RIM_COLOR, RIGHT_AXIS_COLOR, "hand");
    drawJointNode(LM.rElbow, RIGHT_LIMB_COLOR);
    drawJointNode(LM.rWrist, RIGHT_LIMB_COLOR);

    // 4. Top layer: Left Arm
    paintSculptedLimb(LM.lShoulder, LM.lElbow, UPPER_ARM_PROFILE, LEFT_LIMB_COLOR, LEFT_RIM_COLOR, LEFT_AXIS_COLOR);
    paintSculptedLimb(LM.lElbow, LM.lWrist, FOREARM_PROFILE, LEFT_LIMB_COLOR, LEFT_RIM_COLOR, LEFT_AXIS_COLOR, "hand");
    drawJointNode(LM.lElbow, LEFT_LIMB_COLOR);
    drawJointNode(LM.lWrist, LEFT_LIMB_COLOR);
  } finally {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

/** Starts a 60 FPS requestAnimationFrame loop rendering the looping clip window; returns cleanup. */
export function startClipReplayLoop(
  ctx: ClipDrawContext,
  canvas: { readonly width: number; readonly height: number },
  samples: readonly RecordedPoseSample[],
  startSec: number,
  durationSec: number = CONFIG.clipLengthSec,
  scheduler: ClipFrameScheduler = BROWSER_SCHEDULER,
  stage?: ClipStageTransform,
): () => void {
  const durationMs = (Number.isFinite(durationSec) && durationSec > 0 ? durationSec : CONFIG.clipLengthSec) * 1000;
  const baseStartMs = Number.isFinite(startSec) ? startSec * 1000 : 0;
  const resolvedStage =
    stage ?? computeClipStageTransform(samples, startSec, durationSec, canvas.width, canvas.height);

  let stopped = false;
  let loopStartMs: number | null = null;
  let rafId = 0;

  const tick = (nowMs: number): void => {
    if (stopped) {
      return;
    }
    if (loopStartMs === null) {
      loopStartMs = nowMs;
    }
    const elapsedMs = Math.max(0, nowMs - loopStartMs) % durationMs;
    const targetSongMs = baseStartMs + elapsedMs;
    const interpolated = interpolateRecordedPose(samples, targetSongMs);
    renderClipFrame(ctx, interpolated, canvas.width, canvas.height, resolvedStage);

    if (!stopped) {
      rafId = scheduler.request(tick);
    }
  };

  rafId = scheduler.request(tick);

  return () => {
    stopped = true;
    scheduler.cancel(rafId);
  };
}

export function ClipReplay(props: {
  samples: RecordedPoseSample[];
  startSec: number;
  durationSec?: number;
}): ReactElement {
  const { samples, startSec, durationSec = CONFIG.clipLengthSec } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sortedSamples = useMemo(() => {
    if (samples.length <= 1) {
      return samples;
    }
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].tSongMs < samples[i - 1].tSongMs) {
        return [...samples].sort((a, b) => a.tSongMs - b.tSongMs);
      }
    }
    return samples;
  }, [samples]);

  const stageTransform = useMemo(
    () => computeClipStageTransform(sortedSamples, startSec, durationSec, CLIP_WIDTH_PX, CLIP_HEIGHT_PX),
    [sortedSamples, startSec, durationSec],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    return startClipReplayLoop(ctx, canvas, sortedSamples, startSec, durationSec, BROWSER_SCHEDULER, stageTransform);
  }, [sortedSamples, startSec, durationSec, stageTransform]);

  return (
    <canvas
      ref={canvasRef}
      width={CLIP_WIDTH_PX}
      height={CLIP_HEIGHT_PX}
      role="img"
      aria-label="Highlight clip silhouette replay"
      style={{ display: "block", width: "100%", maxWidth: "16rem", height: "auto" }}
    />
  );
}
