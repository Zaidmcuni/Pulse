/**
 * Owner: Toufic
 * Purpose: The ONLY segment math in the app: landmarks -> pixel-space unit vectors; mirroring; mode masking
 * FRs: FR-19, FR-20, FR-21
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Used by live scoring (computePoseFrame, mirror: true) AND by the extract tool (extractSegments, mirror: false).
 * Must reproduce the goldens in mocks/fixtures.ts exactly.
 */

import type { LandmarkPoint, PosturalMode, PoseFrame, RawPoseLandmarks, SegmentMap } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

/**
 * mirror: true -> x -> 1 - x and left/right swapped (LM_MIRROR, SEGMENT_MIRROR), BEFORE computing vectors.
 * Only segments of `mode` (MODE_SEGMENTS) whose endpoints all have v >= CONFIG.visibilityMin are returned.
 */
export function extractSegments(
  landmarks: LandmarkPoint[], width: number, height: number,
  options: { mirror: boolean; mode: PosturalMode },
): SegmentMap {
  void landmarks; void width; void height; void options;
  return todo("extractSegments");
}

/** Live path: mirrored segments + usableRatio + tracking + mirrored points. Output passes assertPoseFrame. */
export function computePoseFrame(raw: RawPoseLandmarks, mode: PosturalMode): PoseFrame {
  void raw; void mode;
  return todo("computePoseFrame");
}
