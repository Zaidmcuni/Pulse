/**
 * Owner: Zaid
 * Purpose: Draw PoseFrame.points as a skeleton (bones from SEGMENT_ENDPOINTS) on a canvas
 * FRs: FR-23, FR-33
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useRef, type ReactElement } from "react";
import { CONFIG, LM, SEGMENT_ENDPOINTS } from "../config";
import type { LandmarkPoint, PoseFrame } from "../types/pulse";

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
const MIN_DRAW_VISIBILITY = 0.15;
const DIM_ALPHA = 0.22;

interface ResolvedPoint {
  px: number;
  py: number;
  v: number;
}

interface SkeletonPalette {
  glow: string;
  core: string;
  dim: string;
  structure: string;
  jointCore: string;
}

const CONFIDENT_PALETTE: SkeletonPalette = {
  glow: "rgba(34, 211, 238, 0.30)",
  core: "#22d3ee",
  dim: `rgba(34, 211, 238, ${DIM_ALPHA})`,
  structure: "rgba(165, 243, 252, 0.45)",
  jointCore: "#ecfeff",
};

const UNCERTAIN_PALETTE: SkeletonPalette = {
  glow: "rgba(251, 191, 36, 0.28)",
  core: "#fbbf24",
  dim: `rgba(251, 191, 36, ${DIM_ALPHA})`,
  structure: "rgba(253, 230, 138, 0.40)",
  jointCore: "#fef3c7",
};

const STRUCTURAL_CONNECTORS: readonly (readonly [number, number])[] = [
  [LM.lShoulder, LM.rShoulder],
  [LM.lHip, LM.rHip],
];

function isPointPresent(pt: LandmarkPoint | undefined): pt is LandmarkPoint {
  return Boolean(
    pt &&
      Number.isFinite(pt.x) &&
      Number.isFinite(pt.y) &&
      Number.isFinite(pt.v) &&
      pt.v > 0,
  );
}

function resolveEndpoint(
  points: readonly LandmarkPoint[],
  indices: readonly number[],
  width: number,
  height: number,
): ResolvedPoint | null {
  if (indices.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  let minVis = Infinity;

  for (const index of indices) {
    const pt = points[index];
    if (!isPointPresent(pt)) return null;
    sumX += pt.x;
    sumY += pt.y;
    minVis = Math.min(minVis, pt.v);
  }

  return {
    px: (sumX / indices.length) * width,
    py: (sumY / indices.length) * height,
    v: minVis,
  };
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function fillDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Deterministic skeleton canvas renderer operating directly on already-mirrored PoseFrame.points. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame | null,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  if (!frame || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return;
  }

  const visibilityMin = CONFIG.visibilityMin;
  const minDim = Math.min(width, height);
  const coreWidth = Math.max(2, Math.min(6, minDim * 0.011));
  const glowWidth = coreWidth * 2.5;
  const jointRadius = Math.max(3, Math.min(8, minDim * 0.014));
  const palette = frame.tracking === "uncertain" ? UNCERTAIN_PALETTE : CONFIDENT_PALETTE;

  ctx.save();
  try {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Subtle shoulder/hip frame connectors help the skeleton read naturally as a body
    for (const [idxA, idxB] of STRUCTURAL_CONNECTORS) {
      const a = resolveEndpoint(frame.points, [idxA], width, height);
      const b = resolveEndpoint(frame.points, [idxB], width, height);
      if (!a || !b || Math.min(a.v, b.v) < visibilityMin) continue;

      ctx.strokeStyle = palette.structure;
      ctx.lineWidth = Math.max(1.5, coreWidth * 0.65);
      strokeLine(ctx, a.px, a.py, b.px, b.py);
    }

    // Primary 9 scored body segments (no shadowBlur; fast two-pass glow + core)
    for (const seg of Object.values(SEGMENT_ENDPOINTS)) {
      const start = resolveEndpoint(frame.points, seg.from, width, height);
      const end = resolveEndpoint(frame.points, seg.to, width, height);
      if (!start || !end) continue;

      const boneVis = Math.min(start.v, end.v);
      if (boneVis < MIN_DRAW_VISIBILITY) continue;

      if (boneVis >= visibilityMin) {
        ctx.strokeStyle = palette.glow;
        ctx.lineWidth = glowWidth;
        strokeLine(ctx, start.px, start.py, end.px, end.py);

        ctx.strokeStyle = palette.core;
        ctx.lineWidth = coreWidth;
        strokeLine(ctx, start.px, start.py, end.px, end.py);
      } else {
        ctx.strokeStyle = palette.dim;
        ctx.lineWidth = Math.max(1.5, coreWidth * 0.85);
        strokeLine(ctx, start.px, start.py, end.px, end.py);
      }
    }

    // Joints on top of bones
    for (const pt of frame.points) {
      if (!isPointPresent(pt) || pt.v < MIN_DRAW_VISIBILITY) continue;

      const px = pt.x * width;
      const py = pt.y * height;

      if (pt.v >= visibilityMin) {
        ctx.fillStyle = palette.glow;
        fillDot(ctx, px, py, jointRadius * 1.6);

        ctx.fillStyle = palette.jointCore;
        fillDot(ctx, px, py, jointRadius);
      } else {
        ctx.fillStyle = palette.dim;
        fillDot(ctx, px, py, jointRadius * 0.75);
      }
    }
  } finally {
    ctx.restore();
  }
}

export function SkeletonOverlay(props: {
  frame: PoseFrame | null;
  width?: number;
  height?: number;
}): ReactElement {
  const width = props.width ?? DEFAULT_WIDTH;
  const height = props.height ?? DEFAULT_HEIGHT;
  const { frame } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backingRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 0,
    height: 0,
    dpr: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (
      backingRef.current.width !== targetW ||
      backingRef.current.height !== targetH ||
      backingRef.current.dpr !== dpr
    ) {
      canvas.width = targetW;
      canvas.height = targetH;
      backingRef.current = { width: targetW, height: targetH, dpr };
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSkeleton(ctx, frame, width, height);
  }, [frame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
    />
  );
}
