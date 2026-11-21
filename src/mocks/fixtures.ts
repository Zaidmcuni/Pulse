/**
 * Owner: Shared (Step 0)
 * Purpose: golden fixtures with hand-computed answers. Implementations must reproduce these exactly.
 *
 * Pose: dancer facing the camera, LEFT arm straight UP, RIGHT arm straight OUT to the side, legs straight down.
 * Camera 1280 x 720. Pixel coordinates (x right, y down) are listed; normalized = px / width, py / height.
 * The dancer's LEFT side appears on the IMAGE RIGHT (larger x) in the raw camera image.
 */
import { perfMs, type RawPoseLandmarks, type SegmentMap } from "../types/pulse";

const W = 1280, H = 720;
const px = (x: number, y: number, v = 1) => ({ x: x / W, y: y / H, v });

/** Order = SCORED_LANDMARK_INDICES (lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle). */
export const GOLDEN_RAW: RawPoseLandmarks = {
  tFrameMs: perfMs(1000),
  mediaTimeSec: 0,
  width: W,
  height: H,
  landmarks: [
    px(700, 300), px(580, 300),   // shoulders
    px(700, 180), px(460, 300),   // elbows: left up, right out
    px(700, 60),  px(340, 300),   // wrists
    px(680, 500), px(600, 500),   // hips
    px(680, 600), px(600, 600),   // knees
    px(680, 700), px(600, 700),   // ankles
  ],
};

/** extractSegments(GOLDEN_RAW.landmarks, W, H, { mirror: false, mode: "standing" }) must equal this. */
export const GOLDEN_SEGMENTS_UNMIRRORED: SegmentMap = {
  l_upper_arm: [0, -1], l_forearm: [0, -1],
  r_upper_arm: [-1, 0], r_forearm: [-1, 0],
  torso: [0, -1],
  l_thigh: [0, 1], r_thigh: [0, 1], l_shin: [0, 1], r_shin: [0, 1],
};

/** computePoseFrame(GOLDEN_RAW, "standing").segments must equal this (x flipped, left/right swapped). */
export const GOLDEN_SEGMENTS_MIRRORED: SegmentMap = {
  r_upper_arm: [0, -1], r_forearm: [0, -1],
  l_upper_arm: [1, 0], l_forearm: [1, 0],
  torso: [0, -1],
  l_thigh: [0, 1], r_thigh: [0, 1], l_shin: [0, 1], r_shin: [0, 1],
};

/** computePoseFrame(GOLDEN_RAW, "seated").segments must equal this (upper body only). */
export const GOLDEN_SEGMENTS_MIRRORED_SEATED: SegmentMap = {
  r_upper_arm: [0, -1], r_forearm: [0, -1],
  l_upper_arm: [1, 0], l_forearm: [1, 0],
  torso: [0, -1],
};

/**
 * Aspect-ratio check: a segment from normalized (0.5, 0.5) to (0.6, 0.6) on 1280 x 720
 * is (128, 72) px, so its unit vector is (0.871576, 0.490261), NOT (0.7071, 0.7071).
 */
export const GOLDEN_ASPECT = { width: 1280, height: 720, from: { x: 0.5, y: 0.5 }, to: { x: 0.6, y: 0.6 }, expected: [0.871576, 0.490261] as const };

/** With every landmark at visibility 0, computePoseFrame must return no segments, usableRatio 0, tracking "uncertain". */
export const GOLDEN_RAW_INVISIBLE: RawPoseLandmarks = {
  ...GOLDEN_RAW,
  landmarks: GOLDEN_RAW.landmarks.map(() => ({ x: 0, y: 0, v: 0 })),
};
