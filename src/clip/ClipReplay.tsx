/**
 * Owner: Toufic
 * Purpose: 9:16 silhouette replay AND side-by-side synced user video + coach silhouette highlight player (FR-49)
 * Contract: legacy 9:16 exports and ClipReplay({ samples, startSec, durationSec? }) remain backward-compatible.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
} from "react";
import { CONFIG, LM, SCORED_LANDMARK_INDICES, SEGMENT_ENDPOINTS } from "../config";
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
import { loadBodyTrack, type BodyTrack } from "../coach/bodyTrack";
import * as humanCoach from "../coach/humanCoach";
import {
  computeStageTransform,
  traceCircle,
  traceLine,
  type CoachDrawContext,
  type StageTransform,
} from "../coach/silhouette";
import {
  songMs,
  type Dance,
  type LandmarkPoint,
  type PosturalMode,
  type RecordedPoseSample,
  type Vec2,
} from "../types/pulse";
import "./ClipReplay.css";

export const CLIP_WIDTH_PX = 540;
export const CLIP_HEIGHT_PX = 960;

export const SIDE_BY_SIDE_WIDTH_PX = 960;
export const SIDE_BY_SIDE_HEIGHT_PX = 540;

const VIS_FADE_START = 0.2;
const OVERLAY_SKIP_EPS = 0.05;
const ALPHA_THRESHOLD = 0.01;
// Allow a missed sample before treating an interval as tracking loss.
const POSE_FADE_MS = 2_000 / CONFIG.clipFps;
const VIDEO_DRIFT_TOLERANCE_SEC = 0.16;
const UI_CLOCK_STEP_MS = 100;

const SEPARATOR_COLOR = "#070b18";
const TORSO_COLOR = "#0ea5e9";
const LEFT_LIMB_COLOR = "#38bdf8";
const RIGHT_LIMB_COLOR = "#c084fc";
const LEFT_RIM_COLOR = "#e0f2fe";
const RIGHT_RIM_COLOR = "#f3e8ff";
const LEFT_AXIS_COLOR = "#bae6fd";
const RIGHT_AXIS_COLOR = "#e9d5ff";
const JOINT_CORE_COLOR = "#f8fafc";

const OVERLAY_GLOW_COLOR = "rgba(34, 211, 238, 0.35)";
const OVERLAY_CORE_COLOR = "#22d3ee";
const OVERLAY_JOINT_CORE_COLOR = "#ecfeff";
const OVERLAY_STRUCTURE_COLOR = "rgba(165, 243, 252, 0.55)";

const STRUCTURAL_CONNECTORS: readonly (readonly [number, number])[] = [
  [LM.lShoulder, LM.rShoulder],
  [LM.lHip, LM.rHip],
];

export interface ClipStageTransform {
  centerX: number;
  centerY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface CoverCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface ClipReplayHandle {
  restartFromStart(): void;
  getCanvas(): HTMLCanvasElement | null;
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

/** 2D canvas surface used by renderSideBySideFrame (satisfied by CanvasRenderingContext2D). */
export type SideBySideDrawContext = ClipDrawContext &
  Pick<
    CanvasRenderingContext2D,
    "save" | "restore" | "rect" | "clip" | "translate" | "scale" | "clearRect"
  > & {
    drawImage: {
      (image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
      (
        image: CanvasImageSource,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ): void;
    };
    fillText?: (text: string, x: number, y: number, maxWidth?: number) => void;
    font?: string;
    textAlign?: CanvasTextAlign;
    textBaseline?: CanvasTextBaseline;
  };

export interface SideBySideRenderSurface {
  canvas: CanvasImageSource & { width: number; height: number };
  ctx: CoachDrawContext;
}

export interface SideBySideFrameOptions {
  width?: number;
  height?: number;
  dance: Dance;
  tSongMs: number;
  videoEl?: {
    readyState: number;
    videoWidth: number;
    videoHeight: number;
  } | null;
  overlayPose?: RecordedPoseSample | null;
  showLandmarks?: boolean;
  userPose?: RecordedPoseSample | null;
  userStage?: ClipStageTransform;
  coachStage?: StageTransform;
  coachSurface?: SideBySideRenderSurface | null;
  bodyTrack?: BodyTrack | null;
  coachMode?: PosturalMode;
}

let sharedCoachSurface: SideBySideRenderSurface | null = null;

function getOrCreateSharedCoachSurface(width: number, height: number): SideBySideRenderSurface | null {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  if (!sharedCoachSurface) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    sharedCoachSurface = { canvas, ctx };
  }
  if (sharedCoachSurface.canvas.width !== width || sharedCoachSurface.canvas.height !== height) {
    sharedCoachSurface.canvas.width = width;
    sharedCoachSurface.canvas.height = height;
  }
  return sharedCoachSurface;
}

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

function validWithThreshold(point: LandmarkPoint | undefined, minVis: number): point is LandmarkPoint {
  return (
    point !== undefined &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.v) &&
    point.v >= minVis
  );
}

function fadePose(sample: RecordedPoseSample, targetMs: number, minVis: number): RecordedPoseSample {
  const opacity = clamp01(1 - Math.abs(targetMs - sample.tSongMs) / POSE_FADE_MS);
  return {
    tSongMs: songMs(targetMs),
    points: sample.points.map((point) => ({
      ...point,
      v: validWithThreshold(point, minVis) ? point.v * opacity : 0,
    })),
  };
}

function interpolateLandmark(
  p: LandmarkPoint | undefined,
  n: LandmarkPoint | undefined,
  alpha: number,
  minVis: number,
): LandmarkPoint {
  const prevValid = validWithThreshold(p, minVis);
  const nextValid = validWithThreshold(n, minVis);
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

function interpolatePoseSamples(
  samples: readonly RecordedPoseSample[],
  targetMs: number,
  minVis: number,
): RecordedPoseSample | null {
  if (samples.length === 0 || !Number.isFinite(targetMs)) {
    return null;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (targetMs <= first.tSongMs) {
    return fadePose(first, targetMs, minVis);
  }
  if (targetMs >= last.tSongMs) {
    return fadePose(last, targetMs, minVis);
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
    return fadePose(nearest, targetMs, minVis);
  }

  const alpha = clamp01((targetMs - prev.tSongMs) / gapMs);
  const count = Math.max(prev.points.length, next.points.length);
  const points: LandmarkPoint[] = new Array<LandmarkPoint>(count);
  for (let i = 0; i < count; i += 1) {
    points[i] = interpolateLandmark(prev.points[i], next.points[i], alpha, minVis);
  }

  return {
    tSongMs: songMs(targetMs),
    points,
  };
}

/**
 * Samples and interpolates recorded pose frames at `targetMs` using binary search.
 * Expects `samples` to be ordered by ascending `tSongMs`.
 */
export function interpolateRecordedPose(
  samples: readonly RecordedPoseSample[],
  targetMs: number,
): RecordedPoseSample | null {
  return interpolatePoseSamples(samples, targetMs, CONFIG.visibilityMin);
}

/** Interpolates screen-space overlay landmarks down to VIS_FADE_START so soft faded lines stay visible. */
function interpolateOverlayPose(
  samples: readonly RecordedPoseSample[],
  targetMs: number,
): RecordedPoseSample | null {
  return interpolatePoseSamples(samples, targetMs, VIS_FADE_START);
}

/** Computes exact symmetric centered `object-fit: cover` crop box in source video pixels. */
export function computeCoverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): CoverCrop {
  if (
    !Number.isFinite(srcW) ||
    !Number.isFinite(srcH) ||
    !Number.isFinite(dstW) ||
    !Number.isFinite(dstH) ||
    srcW <= 0 ||
    srcH <= 0 ||
    dstW <= 0 ||
    dstH <= 0
  ) {
    return {
      sx: 0,
      sy: 0,
      sw: Number.isFinite(srcW) && srcW > 0 ? srcW : 1,
      sh: Number.isFinite(srcH) && srcH > 0 ? srcH : 1,
    };
  }

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  if (srcAspect > dstAspect) {
    const sw = srcH * dstAspect;
    return {
      sx: (srcW - sw) * 0.5,
      sy: 0,
      sw,
      sh: srcH,
    };
  }

  const sh = srcW / dstAspect;
  return {
    sx: 0,
    sy: (srcH - sh) * 0.5,
    sw: srcW,
    sh,
  };
}

/**
 * Projects a mirrored screen-space [0..1] landmark through a symmetric cover crop into the target pane.
 * Because `crop` is horizontally centered (`sx = (srcW - sw) / 2`) and the video is drawn mirrored,
 * `((pt.x * srcW - crop.sx) / crop.sw)` matches the rendered pixel x-position identically.
 */
export function projectMirroredLandmarkToPane(
  pt: LandmarkPoint,
  srcW: number,
  srcH: number,
  crop: CoverCrop,
  paneX: number,
  paneY: number,
  paneW: number,
  paneH: number,
): { x: number; y: number } {
  const safeSw = crop.sw > 0 ? crop.sw : 1;
  const safeSh = crop.sh > 0 ? crop.sh : 1;
  return {
    x: paneX + ((pt.x * srcW - crop.sx) / safeSw) * paneW,
    y: paneY + ((pt.y * srcH - crop.sy) / safeSh) * paneH,
  };
}

/** Maps song time in ms to recorded video time in seconds, clamped to [0, videoDurationSec]. */
export function songTimeToVideoSec(
  tSongMs: number,
  videoStartSongMs: number,
  videoDurationSec?: number,
): number {
  if (!Number.isFinite(tSongMs) || !Number.isFinite(videoStartSongMs)) {
    return 0;
  }
  const sec = Math.max(0, (tSongMs - videoStartSongMs) / 1000);
  if (videoDurationSec !== undefined && Number.isFinite(videoDurationSec) && videoDurationSec >= 0) {
    return Math.min(sec, videoDurationSec);
  }
  return sec;
}

function drawBackdropInRect(
  ctx: ClipDrawContext,
  x: number,
  y: number,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
): void {
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const bgGrad = ctx.createLinearGradient(x, y, x, y + height);
  bgGrad.addColorStop(0, "#070b18");
  bgGrad.addColorStop(0.55, "#0d1630");
  bgGrad.addColorStop(1, "#070b18");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(x, y, width, height);

  const glowRadius = Math.max(width, height) * 0.48;
  const glowGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
  glowGrad.addColorStop(0, "rgba(56, 189, 248, 0.20)");
  glowGrad.addColorStop(0.55, "rgba(56, 189, 248, 0.06)");
  glowGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(x, y, width, height);
}

function drawBackdrop(
  ctx: ClipDrawContext,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
): void {
  drawBackdropInRect(ctx, 0, 0, width, height, centerX, centerY);
}

/**
 * Computes a single constant 9:16 stage transform across the `[startSec, startSec + durationSec]`
 * clip window so full-body lateral stepping, jumping, and crouches stay framed without
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

function resolveOverlayEndpoint(
  points: readonly LandmarkPoint[],
  indices: readonly number[],
  srcW: number,
  srcH: number,
  crop: CoverCrop,
  paneX: number,
  paneY: number,
  paneW: number,
  paneH: number,
): { x: number; y: number; v: number } | null {
  if (indices.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  let minVis = Infinity;

  for (const idx of indices) {
    const pt = points[idx];
    if (
      !pt ||
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y) ||
      !Number.isFinite(pt.v) ||
      pt.v <= OVERLAY_SKIP_EPS
    ) {
      return null;
    }
    const projected = projectMirroredLandmarkToPane(
      pt,
      srcW,
      srcH,
      crop,
      paneX,
      paneY,
      paneW,
      paneH,
    );
    sumX += projected.x;
    sumY += projected.y;
    minVis = Math.min(minVis, pt.v);
  }

  return {
    x: sumX / indices.length,
    y: sumY / indices.length,
    v: minVis,
  };
}

function drawVideoOverlayLandmarks(
  ctx: SideBySideDrawContext,
  pose: RecordedPoseSample,
  srcW: number,
  srcH: number,
  crop: CoverCrop,
  paneX: number,
  paneY: number,
  paneW: number,
  paneH: number,
): void {
  if (pose.points.length !== SCORED_LANDMARK_INDICES.length) return;

  const minDim = Math.min(paneW, paneH);
  const coreWidth = Math.max(2, Math.min(5, minDim * 0.009));
  const glowWidth = coreWidth * 2.4;
  const jointRadius = Math.max(3, Math.min(7, minDim * 0.012));

  ctx.save();
  try {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 0;

    for (const [idxA, idxB] of STRUCTURAL_CONNECTORS) {
      const a = resolveOverlayEndpoint(pose.points, [idxA], srcW, srcH, crop, paneX, paneY, paneW, paneH);
      const b = resolveOverlayEndpoint(pose.points, [idxB], srcW, srcH, crop, paneX, paneY, paneW, paneH);
      if (!a || !b) continue;
      const alpha = computeLimbAlpha(a.v, b.v);
      if (alpha <= ALPHA_THRESHOLD) continue;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = OVERLAY_STRUCTURE_COLOR;
      ctx.lineWidth = Math.max(1.5, coreWidth * 0.65);
      traceLine(ctx, a, b);
      ctx.stroke();
    }

    for (const seg of Object.values(SEGMENT_ENDPOINTS)) {
      const start = resolveOverlayEndpoint(pose.points, seg.from, srcW, srcH, crop, paneX, paneY, paneW, paneH);
      const end = resolveOverlayEndpoint(pose.points, seg.to, srcW, srcH, crop, paneX, paneY, paneW, paneH);
      if (!start || !end) continue;

      const boneVis = Math.min(start.v, end.v);
      const alpha = computeLimbAlpha(start.v, end.v);
      if (alpha <= ALPHA_THRESHOLD) continue;

      if (boneVis >= CONFIG.visibilityMin) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = OVERLAY_GLOW_COLOR;
        ctx.lineWidth = glowWidth;
        traceLine(ctx, start, end);
        ctx.stroke();

        ctx.strokeStyle = OVERLAY_CORE_COLOR;
        ctx.lineWidth = coreWidth;
        traceLine(ctx, start, end);
        ctx.stroke();
      } else {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = OVERLAY_CORE_COLOR;
        ctx.lineWidth = Math.max(1.5, coreWidth * 0.85);
        traceLine(ctx, start, end);
        ctx.stroke();
      }
    }

    for (const pt of pose.points) {
      if (
        !pt ||
        !Number.isFinite(pt.x) ||
        !Number.isFinite(pt.y) ||
        !Number.isFinite(pt.v) ||
        pt.v <= OVERLAY_SKIP_EPS
      ) {
        continue;
      }
      const alpha = computeLimbAlpha(pt.v, pt.v);
      if (alpha <= ALPHA_THRESHOLD) continue;

      const p = projectMirroredLandmarkToPane(pt, srcW, srcH, crop, paneX, paneY, paneW, paneH);
      if (pt.v >= CONFIG.visibilityMin) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = OVERLAY_GLOW_COLOR;
        traceCircle(ctx, p, jointRadius * 1.65);
        ctx.fill();

        ctx.fillStyle = OVERLAY_JOINT_CORE_COLOR;
        traceCircle(ctx, p, jointRadius);
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = OVERLAY_CORE_COLOR;
        traceCircle(ctx, p, jointRadius * 0.78);
        ctx.fill();
      }
    }
  } finally {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function createNoClearCoachProxy(ctx: SideBySideDrawContext): CoachDrawContext {
  return {
    clearRect: () => {},
    beginPath: () => ctx.beginPath(),
    moveTo: (x, y) => ctx.moveTo(x, y),
    lineTo: (x, y) => ctx.lineTo(x, y),
    closePath: () => ctx.closePath(),
    arc: (x, y, r, s, e, ccw) => ctx.arc(x, y, r, s, e, ccw),
    fill: () => ctx.fill(),
    stroke: () => ctx.stroke(),
    get fillStyle() {
      return ctx.fillStyle;
    },
    set fillStyle(v) {
      ctx.fillStyle = v;
    },
    get strokeStyle() {
      return ctx.strokeStyle;
    },
    set strokeStyle(v) {
      ctx.strokeStyle = v;
    },
    get lineWidth() {
      return ctx.lineWidth;
    },
    set lineWidth(v) {
      ctx.lineWidth = v;
    },
    get lineCap() {
      return ctx.lineCap;
    },
    set lineCap(v) {
      ctx.lineCap = v;
    },
    get lineJoin() {
      return ctx.lineJoin;
    },
    set lineJoin(v) {
      ctx.lineJoin = v;
    },
  };
}

function drawCornerPill(
  ctx: SideBySideDrawContext,
  x: number,
  y: number,
  label: string,
  alignRight = false,
): void {
  const pillW = Math.max(54, label.length * 10 + 24);
  const pillH = 26;
  const rx = alignRight ? x - pillW : x;

  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(7, 11, 24, 0.72)";
    ctx.fillRect(rx, y, pillW, pillH);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(rx, y, pillW, pillH);
    ctx.stroke();

    if (typeof ctx.fillText === "function") {
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, rx + pillW * 0.5, y + pillH * 0.5 + 0.5);
    }
  } finally {
    ctx.restore();
  }
}

/**
 * Renders one composite side-by-side highlight frame:
 * - Left pane: horizontally mirrored user video (with optional neon-cyan landmark overlay), or pose silhouette fallback.
 * - Right pane: dark PULSE gradient backdrop + sculpted coach silhouette sampled at `tSongMs`.
 */
export function renderSideBySideFrame(
  ctx: SideBySideDrawContext,
  options: SideBySideFrameOptions,
): void {
  const width = options.width ?? SIDE_BY_SIDE_WIDTH_PX;
  const height = options.height ?? SIDE_BY_SIDE_HEIGHT_PX;
  const paneW = Math.floor(width * 0.5);
  const rightPaneW = width - paneW;
  const { videoEl, dance, tSongMs, showLandmarks = false } = options;

  // 1. Left pane (User video + optional overlay OR recorded pose silhouette fallback)
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, 0, paneW, height);
    ctx.clip();

    const videoReady = Boolean(
      videoEl &&
        videoEl.readyState >= 2 &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0,
    );

    if (videoReady && videoEl) {
      const crop = computeCoverCrop(videoEl.videoWidth, videoEl.videoHeight, paneW, height);
      ctx.save();
      ctx.translate(paneW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        videoEl as unknown as CanvasImageSource,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        paneW,
        height,
      );
      ctx.restore();

      if (showLandmarks && options.overlayPose) {
        drawVideoOverlayLandmarks(
          ctx,
          options.overlayPose,
          videoEl.videoWidth,
          videoEl.videoHeight,
          crop,
          0,
          0,
          paneW,
          height,
        );
      }
    } else {
      renderClipFrame(ctx, options.userPose ?? null, paneW, height, options.userStage);
    }
  } finally {
    ctx.restore();
  }

  // 2. Right pane (Upgraded costumed human coach & lounge stage, with silhouette fallback in headless tests)
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(paneW, 0, rightPaneW, height);
    ctx.clip();

    drawBackdropInRect(
      ctx,
      paneW,
      0,
      rightPaneW,
      height,
      paneW + rightPaneW * 0.5,
      height * 0.46,
    );

    const coachStage =
      options.coachStage ??
      computeStageTransform(dance.frames, rightPaneW, height, dance.aspectRatio);
    const coachOptions: humanCoach.UpgradedCoachFrameOptions = {
      track: options.bodyTrack,
      mode: options.coachMode,
      stageTransform: coachStage,
    };

    const targetSurface =
      options.coachSurface ?? getOrCreateSharedCoachSurface(rightPaneW, height);
    if (targetSurface) {
      if (
        targetSurface.canvas.width !== rightPaneW ||
        targetSurface.canvas.height !== height
      ) {
        targetSurface.canvas.width = rightPaneW;
        targetSurface.canvas.height = height;
      }
      humanCoach.drawUpgradedCoachFrame(
        targetSurface.ctx,
        rightPaneW,
        height,
        dance,
        songMs(tSongMs),
        coachOptions,
      );
      ctx.drawImage(targetSurface.canvas, paneW, 0, rightPaneW, height);
    } else {
      ctx.save();
      ctx.translate(paneW, 0);
      humanCoach.drawUpgradedCoachFrame(
        createNoClearCoachProxy(ctx),
        rightPaneW,
        height,
        dance,
        songMs(tSongMs),
        coachOptions,
      );
      ctx.restore();
    }
  } finally {
    ctx.restore();
  }

  // 3. Subtle divider and YOU / COACH corner labels
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(paneW, 0);
    ctx.lineTo(paneW, height);
    ctx.stroke();
  } finally {
    ctx.restore();
  }

  drawCornerPill(ctx, 14, 14, "YOU", false);
  drawCornerPill(ctx, width - 14, 14, "COACH", true);
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

function sortSamplesBySongTime(samples: readonly RecordedPoseSample[]): readonly RecordedPoseSample[] {
  if (samples.length <= 1) {
    return samples;
  }
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].tSongMs < samples[i - 1].tSongMs) {
      return [...samples].sort((a, b) => a.tSongMs - b.tSongMs);
    }
  }
  return samples;
}

function formatClipClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function resolveAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window !== "undefined" && typeof window.AudioContext === "function") {
    return window.AudioContext;
  }
  if (typeof globalThis.AudioContext === "function") {
    return globalThis.AudioContext;
  }
  return undefined;
}

export function ClipReplay(props: {
  samples: RecordedPoseSample[];
  startSec: number;
  durationSec?: number;
  dance?: Dance;
  userVideoBlob?: Blob | null;
  videoStartSongMs?: number;
  overlaySamples?: readonly RecordedPoseSample[];
  showLandmarks?: boolean;
  audioUrl?: string;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  controlRef?: MutableRefObject<ClipReplayHandle | null>;
}): ReactElement {
  const { samples, startSec, durationSec = CONFIG.clipLengthSec, dance } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sortedSamples = useMemo(() => sortSamplesBySongTime(samples), [samples]);

  const stageTransform = useMemo(
    () => computeClipStageTransform(sortedSamples, startSec, durationSec, CLIP_WIDTH_PX, CLIP_HEIGHT_PX),
    [sortedSamples, startSec, durationSec],
  );

  useEffect(() => {
    if (dance) {
      return undefined;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return undefined;
    }
    return startClipReplayLoop(ctx, canvas, sortedSamples, startSec, durationSec, BROWSER_SCHEDULER, stageTransform);
  }, [dance, sortedSamples, startSec, durationSec, stageTransform]);

  if (dance) {
    return (
      <SideBySideClipReplay
        samples={samples}
        startSec={startSec}
        durationSec={durationSec}
        dance={dance}
        userVideoBlob={props.userVideoBlob}
        videoStartSongMs={props.videoStartSongMs}
        overlaySamples={props.overlaySamples}
        showLandmarks={props.showLandmarks}
        audioUrl={props.audioUrl}
        onCanvasReady={props.onCanvasReady}
        controlRef={props.controlRef}
      />
    );
  }

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

function SideBySideClipReplay(props: {
  samples: RecordedPoseSample[];
  startSec: number;
  durationSec: number;
  dance: Dance;
  userVideoBlob?: Blob | null;
  videoStartSongMs?: number;
  overlaySamples?: readonly RecordedPoseSample[];
  showLandmarks?: boolean;
  audioUrl?: string;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  controlRef?: MutableRefObject<ClipReplayHandle | null>;
}): ReactElement {
  const {
    samples,
    startSec,
    durationSec,
    dance,
    userVideoBlob = null,
    videoStartSongMs = 0,
    overlaySamples = [],
    showLandmarks = false,
    audioUrl,
    onCanvasReady,
    controlRef,
  } = props;

  const safeStartSec = Number.isFinite(startSec) && startSec >= 0 ? startSec : 0;
  const safeDurationSec =
    Number.isFinite(durationSec) && durationSec > 0 ? durationSec : CONFIG.clipLengthSec;
  const durationMs = safeDurationSec * 1000;
  const windowStartMs = safeStartSec * 1000;
  const effectiveAudioUrl = audioUrl ?? dance.audioUrl;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [displayElapsedMs, setDisplayElapsedMs] = useState(0);

  const sortedSamples = useMemo(() => sortSamplesBySongTime(samples), [samples]);
  const sortedOverlaySamples = useMemo(() => sortSamplesBySongTime(overlaySamples), [overlaySamples]);

  const paneW = Math.floor(SIDE_BY_SIDE_WIDTH_PX * 0.5);
  const rightPaneW = SIDE_BY_SIDE_WIDTH_PX - paneW;

  const userStage = useMemo(
    () => computeClipStageTransform(sortedSamples, safeStartSec, safeDurationSec, paneW, SIDE_BY_SIDE_HEIGHT_PX),
    [sortedSamples, safeStartSec, safeDurationSec, paneW],
  );
  const coachStage = useMemo(
    () => computeStageTransform(dance.frames, rightPaneW, SIDE_BY_SIDE_HEIGHT_PX, dance.aspectRatio),
    [dance.frames, dance.aspectRatio, rightPaneW],
  );

  const renderParamsRef = useRef({
    dance,
    samples: sortedSamples,
    overlaySamples: sortedOverlaySamples,
    showLandmarks,
    videoStartSongMs,
    userStage,
    coachStage,
  });
  renderParamsRef.current = {
    dance,
    samples: sortedSamples,
    overlaySamples: sortedOverlaySamples,
    showLandmarks,
    videoStartSongMs,
    userStage,
    coachStage,
  };

  const playbackRef = useRef<{
    isPlaying: boolean;
    soundOn: boolean;
    elapsedMs: number;
    prevElapsedMs: number | null;
    anchorPerfMs: number;
    lastUiUpdateMs: number;
    audioCtx: AudioContext | null;
    audioBuffer: AudioBuffer | null;
    audioBufferUrl: string | null;
    audioDecoding: boolean;
    audioSource: AudioBufferSourceNode | null;
    audioSourceStartCtxSec: number;
    audioClockActive: boolean;
    forceVideoSeek: boolean;
    videoEl: HTMLVideoElement | null;
    coachSurface: SideBySideRenderSurface | null;
    bodyTrack: BodyTrack | null;
    drawFrame: ((elapsedMs: number, forceSeek: boolean) => void) | null;
    startAudioSlice: ((offsetMs: number) => void) | null;
    stopAudioSource: () => void;
    mounted: boolean;
  }>({
    isPlaying: true,
    soundOn: false,
    elapsedMs: 0,
    prevElapsedMs: null,
    anchorPerfMs: 0,
    lastUiUpdateMs: -Infinity,
    audioCtx: null,
    audioBuffer: null,
    audioBufferUrl: null,
    audioDecoding: false,
    audioSource: null,
    audioSourceStartCtxSec: 0,
    audioClockActive: false,
    forceVideoSeek: true,
    videoEl: null,
    coachSurface: null,
    bodyTrack: null,
    drawFrame: null,
    startAudioSlice: null,
    stopAudioSource: () => {},
    mounted: false,
  });

  // Load the dance's optional 3D body track (#97) so the right pane matches CoachCanvas identically.
  useEffect(() => {
    let cancelled = false;
    const pb = playbackRef.current;
    pb.bodyTrack = null;
    if (typeof fetch !== "function") {
      return undefined;
    }
    void loadBodyTrack(dance.id).then((track) => {
      if (cancelled) return;
      pb.bodyTrack = track;
      pb.drawFrame?.(pb.elapsedMs, false);
    });
    return () => {
      cancelled = true;
    };
  }, [dance.id]);

  // Expose canvas + synchronous restart hook for live export lockstep.
  useEffect(() => {
    onCanvasReady?.(canvasRef.current);
    if (controlRef) {
      controlRef.current = {
        restartFromStart: () => {
          const pb = playbackRef.current;
          pb.elapsedMs = 0;
          pb.prevElapsedMs = null;
          pb.forceVideoSeek = true;
          pb.isPlaying = true;
          pb.anchorPerfMs = performance.now();
          pb.lastUiUpdateMs = pb.anchorPerfMs;
          setIsPlaying(true);
          setDisplayElapsedMs(0);
          if (pb.soundOn && pb.audioBuffer && pb.audioCtx) {
            pb.startAudioSlice?.(0);
          }
          pb.drawFrame?.(0, true);
        },
        getCanvas: () => canvasRef.current,
      };
    }
    return () => {
      onCanvasReady?.(null);
      if (controlRef) {
        controlRef.current = null;
      }
    };
  }, [onCanvasReady, controlRef]);

  // Hidden muted <video> backed by transient in-memory Blob URL (revoked strictly on cleanup).
  useEffect(() => {
    const pb = playbackRef.current;
    if (
      !userVideoBlob ||
      typeof document === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      pb.videoEl = null;
      return;
    }

    const objectUrl = URL.createObjectURL(userVideoBlob);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    pb.videoEl = video;
    pb.forceVideoSeek = true;

    const redrawOnReady = (): void => {
      pb.drawFrame?.(pb.elapsedMs, pb.forceVideoSeek);
      pb.forceVideoSeek = false;
    };
    video.addEventListener("loadeddata", redrawOnReady);
    video.addEventListener("seeked", redrawOnReady);

    return () => {
      video.removeEventListener("loadeddata", redrawOnReady);
      video.removeEventListener("seeked", redrawOnReady);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
      if (pb.videoEl === video) {
        pb.videoEl = null;
      }
    };
  }, [userVideoBlob]);

  // Main 60 FPS composite loop + Web Audio clock sync.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") as SideBySideDrawContext | null | undefined;
    if (!canvas || !ctx) {
      return;
    }

    const pb = playbackRef.current;
    pb.mounted = true;
    pb.elapsedMs = 0;
    pb.prevElapsedMs = null;
    pb.forceVideoSeek = true;
    pb.anchorPerfMs = performance.now();
    pb.lastUiUpdateMs = pb.anchorPerfMs;

    if (!pb.coachSurface && typeof document !== "undefined" && typeof document.createElement === "function") {
      const offscreen = document.createElement("canvas");
      offscreen.width = rightPaneW;
      offscreen.height = SIDE_BY_SIDE_HEIGHT_PX;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
        pb.coachSurface = { canvas: offscreen, ctx: offCtx };
      }
    }

    const stopAudioSource = (): void => {
      pb.audioClockActive = false;
      const src = pb.audioSource;
      pb.audioSource = null;
      if (src) {
        src.onended = null;
        try { src.stop(); } catch { /* ignore */ }
        try { src.disconnect(); } catch { /* ignore */ }
      }
    };
    pb.stopAudioSource = stopAudioSource;

    const startAudioSlice = (offsetInWindowMs: number): void => {
      if (!pb.mounted || !pb.soundOn || !pb.isPlaying || !pb.audioCtx || !pb.audioBuffer) {
        return;
      }
      stopAudioSource();

      const clampedOffsetMs = Math.max(0, Math.min(durationMs - 10, offsetInWindowMs));
      const songOffsetSec = Math.max(0, safeStartSec + clampedOffsetMs / 1000);
      const remainingWindowSec = Math.max(0.01, (durationMs - clampedOffsetMs) / 1000);
      const availableAudioSec = Math.max(0, pb.audioBuffer.duration - songOffsetSec);
      const playDurSec = Math.min(remainingWindowSec, availableAudioSec);
      if (playDurSec <= 0.01) {
        pb.audioClockActive = false;
        return;
      }

      const src = pb.audioCtx.createBufferSource();
      src.buffer = pb.audioBuffer;
      src.connect(pb.audioCtx.destination);
      const ctxNow = pb.audioCtx.currentTime;
      pb.audioSourceStartCtxSec = ctxNow - clampedOffsetMs / 1000;
      pb.audioSource = src;
      pb.audioClockActive = true;

      src.onended = (): void => {
        if (pb.audioSource !== src) return;
        pb.audioSource = null;
        pb.audioClockActive = false;
        pb.anchorPerfMs = performance.now() - pb.elapsedMs;
      };

      src.start(ctxNow, songOffsetSec, playDurSec);
    };
    pb.startAudioSlice = startAudioSlice;

    const drawFrame = (elapsedMs: number, forceSeek: boolean): void => {
      const p = renderParamsRef.current;
      const tSongMs = windowStartMs + elapsedMs;
      const video = pb.videoEl;

      if (video && video.readyState >= 1) {
        const finiteDur =
          Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
        const expectedVideoSec = songTimeToVideoSec(tSongMs, p.videoStartSongMs, finiteDur);
        const wrapped = pb.prevElapsedMs !== null && elapsedMs < pb.prevElapsedMs - 500;

        if (pb.isPlaying && video.paused && video.readyState >= 2) {
          if (finiteDur === undefined || expectedVideoSec < finiteDur - 0.05) {
            void video.play().catch(() => undefined);
          }
        } else if (!pb.isPlaying && !video.paused) {
          video.pause();
        }

        if (
          !video.seeking &&
          (forceSeek ||
            wrapped ||
            Math.abs(video.currentTime - expectedVideoSec) > VIDEO_DRIFT_TOLERANCE_SEC)
        ) {
          video.currentTime = expectedVideoSec;
        }
      }
      pb.prevElapsedMs = elapsedMs;

      const overlayPose =
        p.showLandmarks && p.overlaySamples.length > 0
          ? interpolateOverlayPose(p.overlaySamples, tSongMs)
          : null;
      const userPose =
        !video || video.readyState < 2 || video.videoWidth <= 0
          ? interpolateRecordedPose(p.samples, tSongMs)
          : null;

      renderSideBySideFrame(ctx, {
        width: SIDE_BY_SIDE_WIDTH_PX,
        height: SIDE_BY_SIDE_HEIGHT_PX,
        dance: p.dance,
        tSongMs,
        videoEl: video,
        overlayPose,
        showLandmarks: p.showLandmarks,
        userPose,
        userStage: p.userStage,
        coachStage: p.coachStage,
        coachSurface: pb.coachSurface,
        bodyTrack: pb.bodyTrack,
      });
    };
    pb.drawFrame = drawFrame;

    if (pb.audioBufferUrl !== effectiveAudioUrl) {
      pb.audioBuffer = null;
      pb.audioBufferUrl = null;
    }

    let stopped = false;
    let rafId = 0;

    const tick = (nowMs: number): void => {
      if (stopped) return;

      if (pb.isPlaying) {
        if (pb.soundOn && pb.audioClockActive && pb.audioCtx) {
          const rawAudioElapsedMs = Math.max(
            0,
            (pb.audioCtx.currentTime - pb.audioSourceStartCtxSec) * 1000,
          );
          if (rawAudioElapsedMs >= durationMs) {
            pb.elapsedMs = rawAudioElapsedMs % durationMs;
            pb.anchorPerfMs = nowMs - pb.elapsedMs;
            startAudioSlice(pb.elapsedMs);
          } else {
            pb.elapsedMs = rawAudioElapsedMs;
            pb.anchorPerfMs = nowMs - pb.elapsedMs;
          }
        } else {
          const rawElapsedMs = Math.max(0, nowMs - pb.anchorPerfMs);
          const wrapped = rawElapsedMs >= durationMs;
          pb.elapsedMs = rawElapsedMs % durationMs;
          if (wrapped) {
            pb.anchorPerfMs = nowMs - pb.elapsedMs;
            if (pb.soundOn && pb.audioBuffer && pb.audioCtx) {
              startAudioSlice(pb.elapsedMs);
            }
          }
        }
      }

      drawFrame(pb.elapsedMs, pb.forceVideoSeek);
      pb.forceVideoSeek = false;

      if (nowMs - pb.lastUiUpdateMs >= UI_CLOCK_STEP_MS) {
        pb.lastUiUpdateMs = nowMs;
        setDisplayElapsedMs(pb.elapsedMs);
      }

      if (!stopped) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      pb.mounted = false;
      cancelAnimationFrame(rafId);
      stopAudioSource();
      pb.drawFrame = null;
      pb.startAudioSlice = null;
      if (pb.audioCtx) {
        const closingCtx = pb.audioCtx;
        pb.audioCtx = null;
        void closingCtx.close().catch(() => {});
      }
    };
  }, [durationMs, effectiveAudioUrl, rightPaneW, safeStartSec, windowStartMs]);

  // Immediately repaint when showLandmarks or sample/stage inputs change, even if paused.
  useEffect(() => {
    const pb = playbackRef.current;
    pb.drawFrame?.(pb.elapsedMs, false);
  }, [showLandmarks, sortedOverlaySamples, sortedSamples, userStage, coachStage]);

  function togglePlay(): void {
    const pb = playbackRef.current;
    const next = !pb.isPlaying;
    pb.isPlaying = next;
    setIsPlaying(next);

    if (!next) {
      pb.stopAudioSource();
      if (pb.videoEl && !pb.videoEl.paused) {
        pb.videoEl.pause();
      }
      setDisplayElapsedMs(pb.elapsedMs);
      pb.drawFrame?.(pb.elapsedMs, false);
    } else {
      pb.anchorPerfMs = performance.now() - pb.elapsedMs;
      pb.forceVideoSeek = true;
      if (pb.soundOn && pb.audioBuffer && pb.audioCtx) {
        void pb.audioCtx
          .resume()
          .then(() => {
            if (pb.mounted && pb.isPlaying && pb.soundOn) {
              pb.startAudioSlice?.(pb.elapsedMs);
            }
          })
          .catch(() => {});
      }
      pb.drawFrame?.(pb.elapsedMs, true);
    }
  }

  function toggleSound(): void {
    const pb = playbackRef.current;
    const next = !pb.soundOn;
    pb.soundOn = next;
    setSoundOn(next);

    if (!next) {
      pb.stopAudioSource();
      pb.anchorPerfMs = performance.now() - pb.elapsedMs;
      return;
    }

    const AudioContextCtor = resolveAudioContextCtor();
    if (!AudioContextCtor) {
      pb.soundOn = false;
      setSoundOn(false);
      return;
    }

    if (!pb.audioCtx) {
      pb.audioCtx = new AudioContextCtor();
    }
    const audioCtx = pb.audioCtx;
    const resumePromise =
      audioCtx.state === "suspended" ? audioCtx.resume() : Promise.resolve();

    if (pb.audioBuffer && pb.audioBufferUrl === effectiveAudioUrl) {
      void resumePromise
        .then(() => {
          if (pb.mounted && pb.soundOn && pb.isPlaying) {
            pb.startAudioSlice?.(pb.elapsedMs);
          }
        })
        .catch(() => {});
      return;
    }

    if (pb.audioDecoding || !effectiveAudioUrl) {
      return;
    }
    pb.audioDecoding = true;
    const requestedUrl = effectiveAudioUrl;
    void fetch(requestedUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => Promise.all([audioCtx.decodeAudioData(buf), resumePromise]))
      .then(([decoded]) => {
        pb.audioDecoding = false;
        if (!pb.mounted || pb.audioCtx !== audioCtx) return;
        pb.audioBuffer = decoded;
        pb.audioBufferUrl = requestedUrl;
        if (pb.soundOn && pb.isPlaying) {
          pb.startAudioSlice?.(pb.elapsedMs);
        }
      })
      .catch(() => {
        pb.audioDecoding = false;
        if (pb.mounted) {
          pb.soundOn = false;
          setSoundOn(false);
        }
      });
  }

  function scrubTo(nextMs: number): void {
    const pb = playbackRef.current;
    const clamped = Math.max(0, Math.min(durationMs, nextMs));
    pb.elapsedMs = clamped;
    pb.prevElapsedMs = null;
    pb.anchorPerfMs = performance.now() - clamped;
    pb.forceVideoSeek = true;
    setDisplayElapsedMs(clamped);

    if (pb.soundOn && pb.isPlaying && pb.audioBuffer && pb.audioCtx) {
      pb.startAudioSlice?.(clamped);
    }
    pb.drawFrame?.(clamped, true);
  }

  return (
    <div className="clip-replay">
      <canvas
        ref={canvasRef}
        className="clip-replay-canvas"
        width={SIDE_BY_SIDE_WIDTH_PX}
        height={SIDE_BY_SIDE_HEIGHT_PX}
        role="img"
        aria-label="Side-by-side highlight replay"
      />
      <div className="clip-replay-controls">
        <button type="button" className="btn btn-secondary" onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={soundOn}
          onClick={toggleSound}
        >
          {soundOn ? "Sound on" : "Sound off"}
        </button>
        <input
          type="range"
          className="clip-replay-scrubber"
          aria-label="Seek highlight clip"
          min={0}
          max={Math.max(1, Math.round(durationMs))}
          value={Math.min(Math.round(durationMs), Math.round(displayElapsedMs))}
          onChange={(e) => scrubTo(Number(e.currentTarget.value))}
        />
        <span className="clip-replay-time">
          {formatClipClock(displayElapsedMs)} / {formatClipClock(durationMs)}
        </span>
      </div>
    </div>
  );
}
