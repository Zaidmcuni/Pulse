/**
 * Owner: Toufic
 * Purpose: 9:16 silhouette replay of recorded samples, interpolated to 60 FPS
 * FRs: FR-49 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../config";
import { traceCircle, traceLine, traceTorso } from "../coach/silhouette";
import { songMs, type LandmarkPoint, type RecordedPoseSample } from "../types/pulse";

export const CLIP_WIDTH_PX = 540;
export const CLIP_HEIGHT_PX = 960;

const VIS_FADE_START = 0.2;
// Allow a missed sample before treating an interval as tracking loss.
const POSE_FADE_MS = 2_000 / CONFIG.clipFps;

const SILHOUETTE_GLOW = "#38bdf8";
const SILHOUETTE_CORE = "#f3f6fc";

const LIMB_PAIRS: readonly (readonly [number, number])[] = [
  [LM.lShoulder, LM.lElbow],
  [LM.rShoulder, LM.rElbow],
  [LM.lElbow, LM.lWrist],
  [LM.rElbow, LM.rWrist],
  [LM.lHip, LM.lKnee],
  [LM.rHip, LM.rKnee],
  [LM.lKnee, LM.lAnkle],
  [LM.rKnee, LM.rAnkle],
];

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
 * Draws one 9:16 silhouette frame from normalized `RecordedPoseSample` points.
 * `poseRecorder` normalizes `PoseFrame.points`, which `computePoseFrame` already mirrored
 * (`x -> 1 - x` and left/right swapped), so `centerX + nx * scale` preserves mirror alignment.
 */
export function renderClipFrame(
  ctx: ClipDrawContext,
  pose: RecordedPoseSample | null,
  width: number = CLIP_WIDTH_PX,
  height: number = CLIP_HEIGHT_PX,
): void {
  const centerX = width * 0.5;
  const centerY = height * 0.46;
  const scale = width * 0.24;

  const project = (pt: LandmarkPoint): { x: number; y: number } => ({
    x: centerX + pt.x * scale,
    y: centerY + pt.y * scale,
  });

  const strokeGlowingCapsule = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    outerWidth: number,
    innerWidth: number,
    alpha: number,
  ): void => {
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.shadowColor = SILHOUETTE_GLOW;
    ctx.shadowBlur = scale * 0.2;
    ctx.strokeStyle = SILHOUETTE_GLOW;
    ctx.lineWidth = outerWidth;
    traceLine(ctx, { x: ax, y: ay }, { x: bx, y: by });
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = SILHOUETTE_CORE;
    ctx.lineWidth = innerWidth;
    traceLine(ctx, { x: ax, y: ay }, { x: bx, y: by });
    ctx.stroke();
  };

  try {
    drawBackdrop(ctx, width, height, centerX, centerY);

    if (pose === null || pose.points.length !== SCORED_LANDMARK_INDICES.length) {
      return;
    }

    const pts = pose.points;
    const lShoulder = pts[LM.lShoulder];
    const rShoulder = pts[LM.rShoulder];
    const lHip = pts[LM.lHip];
    const rHip = pts[LM.rHip];

    const shoulderAlpha = computeLimbAlpha(lShoulder.v, rShoulder.v);
    const hipAlpha = computeLimbAlpha(lHip.v, rHip.v);
    const torsoAlpha = Math.min(shoulderAlpha, hipAlpha);

    if (shoulderAlpha > 0 && Number.isFinite(lShoulder.x) && Number.isFinite(rShoulder.x)) {
      const pLS = project(lShoulder);
      const pRS = project(rShoulder);

      if (torsoAlpha > 0) {
        const pLH = project(lHip);
        const pRH = project(rHip);
        ctx.globalAlpha = torsoAlpha;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = SILHOUETTE_GLOW;
        ctx.shadowBlur = scale * 0.18;
        ctx.fillStyle = SILHOUETTE_GLOW;
        ctx.strokeStyle = SILHOUETTE_CORE;
        ctx.lineWidth = scale * 0.08;
        traceTorso(ctx, pLS, pRS, pRH, pLH);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
      } else {
        // Seated fallback when hips are occluded: draw upper-torso shoulder bar without using (0, 0) hips.
        strokeGlowingCapsule(pLS.x, pLS.y, pRS.x, pRS.y, scale * 0.26, scale * 0.12, shoulderAlpha);
      }

      const midShoulderX = (pLS.x + pRS.x) * 0.5;
      const midShoulderY = (pLS.y + pRS.y) * 0.5;
      const headY = midShoulderY - 0.48 * scale;
      const headRadius = 0.24 * scale;

      ctx.globalAlpha = shoulderAlpha;
      ctx.shadowColor = SILHOUETTE_GLOW;
      ctx.shadowBlur = scale * 0.18;
      ctx.fillStyle = SILHOUETTE_GLOW;
      traceCircle(ctx, { x: midShoulderX, y: headY }, headRadius);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = SILHOUETTE_CORE;
      ctx.lineWidth = scale * 0.05;
      ctx.stroke();
    }

    for (const [idxA, idxB] of LIMB_PAIRS) {
      const a = pts[idxA];
      const b = pts[idxB];
      const alpha = computeLimbAlpha(a.v, b.v);
      if (alpha <= 0 || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
        continue;
      }
      const pa = project(a);
      const pb = project(b);
      strokeGlowingCapsule(pa.x, pa.y, pb.x, pb.y, scale * 0.22, scale * 0.1, alpha);
    }
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
): () => void {
  const durationMs = (Number.isFinite(durationSec) && durationSec > 0 ? durationSec : CONFIG.clipLengthSec) * 1000;
  const baseStartMs = Number.isFinite(startSec) ? startSec * 1000 : 0;

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
    renderClipFrame(ctx, interpolated, canvas.width, canvas.height);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    return startClipReplayLoop(ctx, canvas, sortedSamples, startSec, durationSec);
  }, [sortedSamples, startSec, durationSec]);

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
