/**
 * Owner: Zaid
 * Purpose: MediaPipe Pose Landmarker on every new video frame -> RawPoseLandmarks (smoothed + background-locked, NOT mirrored)
 * FRs: FR-16, FR-17 (uses FR-18, FR-22)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Output rules: see RawPoseLandmarks in types/pulse.ts (12 points in SCORED_LANDMARK_INDICES order; invisible frames still emitted with v = 0).
 * Must also work on a <video> playing a file (used by Toufic's extract tool).
 */

import type { RawPoseLandmarks } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

/** Loads the lite model + WASM from /models and /wasm (offline). Asserts landmark visibility is a number. */
export function initPoseLandmarker(): Promise<void> {
  return todo("initPoseLandmarker");
}

/** Starts the requestVideoFrameCallback loop. Returns stop(). Call initPoseLandmarker() first. */
export function startPose(video: HTMLVideoElement, onRawFrame: (raw: RawPoseLandmarks) => void): () => void {
  void video; void onRawFrame;
  return todo("startPose");
}
