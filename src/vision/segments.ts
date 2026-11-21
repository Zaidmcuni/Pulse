/**
 * Owner: Toufic
 * Purpose: The ONLY segment math in the app: landmarks -> pixel-space unit vectors; mirroring; mode masking
 * FRs: FR-19, FR-20, FR-21
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Used by live scoring (computePoseFrame, mirror: true) AND by the extract tool (extractSegments, mirror: false).
 * Must reproduce the goldens in mocks/fixtures.ts exactly.
 */

import type { LandmarkPoint, PosturalMode, PoseFrame, RawPoseLandmarks, SegmentMap } from "../types/pulse";
import { CONFIG, LM_MIRROR, MODE_SEGMENTS, SEGMENT_ENDPOINTS } from "../config";

function mirrorLandmarks(landmarks: LandmarkPoint[]): LandmarkPoint[] {
  return LM_MIRROR.map((index) => {
    const { x, y, v } = landmarks[index];
    return { x: 1 - x, y, v };
  });
}

/**
 * mirror: true -> x -> 1 - x and left/right swapped (LM_MIRROR), BEFORE computing vectors.
 * Only segments of `mode` (MODE_SEGMENTS) whose endpoints all have v >= CONFIG.visibilityMin are returned.
 */
export function extractSegments(
  landmarks: LandmarkPoint[], width: number, height: number,
  options: { mirror: boolean; mode: PosturalMode },
): SegmentMap {
  const points = options.mirror ? mirrorLandmarks(landmarks) : landmarks;
  const segments: SegmentMap = {};

  for (const id of MODE_SEGMENTS[options.mode]) {
    const { from, to } = SEGMENT_ENDPOINTS[id];
    const start = visibleCenter(points, from);
    const end = visibleCenter(points, to);
    if (!start || !end) continue;

    const dx = (end.x - start.x) * width;
    const dy = (end.y - start.y) * height;
    const length = Math.hypot(dx, dy);
    if (length > 0) segments[id] = [dx / length, dy / length];
  }

  return segments;
}

/** Live path: mirrored segments + usableRatio + tracking + mirrored points. Output passes assertPoseFrame. */
export function computePoseFrame(raw: RawPoseLandmarks, mode: PosturalMode): PoseFrame {
  const points = mirrorLandmarks(raw.landmarks);
  const segments = extractSegments(points, raw.width, raw.height, { mirror: false, mode });
  const usableRatio = Object.keys(segments).length / MODE_SEGMENTS[mode].length;
  return {
    tFrameMs: raw.tFrameMs,
    segments,
    usableRatio,
    tracking: usableRatio < CONFIG.uncertainUsableRatio ? "uncertain" : "ok",
    points,
  };
}

function visibleCenter(points: LandmarkPoint[], indices: readonly number[]) {
  let x = 0;
  let y = 0;
  for (const index of indices) {
    const point = points[index];
    if (point.v < CONFIG.visibilityMin) return undefined;
    x += point.x;
    y += point.y;
  }
  return { x: x / indices.length, y: y / indices.length };
}
