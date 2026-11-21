/**
 * Owner: Shared (change = team ping + every affected owner agrees)
 * Purpose: every tuning number and the landmark/segment definitions. Never hard-code these elsewhere.
 */
import type { PosturalMode, SegmentId } from "./types/pulse";

export const CONFIG = {
  visibilityMin: 0.55,          // skip segment below this
  uncertainUsableRatio: 0.5,    // tracking uncertain below this share of segments
  toleranceDeg: 30,             // segment score reaches 0 at this error
  matchWindowMs: { before: 240, after: 120 },
  camDelaySec: 0.045,
  oneEuro: { minCutoffHz: 1.0, beta: 0.03, dCutoffHz: 1.0 },
  backgroundJump: 0.35,         // share of screen width
  rating: { perfect: 0.85, good: 0.65, ok: 0.4 },
  level: { superstar: 85, gold: 70, silver: 50 },
  accRollingSec: 2,
  pointsScale: 10,
  pointsAccFloor: 0.4,          // points = scale x effort x (floor + (1 - floor) x acc)
  restingHrDefault: 65,
  hrDropHoldSec: 10,
  clipLengthSec: 15,
  clipFps: 12,
  forYou: { lookback: 3, upPct: 80, downPct: 50 },
} as const;

/** MediaPipe indices of the 12 scored landmarks. RawPoseLandmarks.landmarks and PoseFrame.points use THIS order. */
export const SCORED_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;

/** Position of each landmark inside the 12-point arrays. "l" / "r" = the dancer's own left / right. */
export const LM = {
  lShoulder: 0, rShoulder: 1, lElbow: 2, rElbow: 3, lWrist: 4, rWrist: 5,
  lHip: 6, rHip: 7, lKnee: 8, rKnee: 9, lAnkle: 10, rAnkle: 11,
} as const;

/** Mirror partner of each position (used when mirroring: swap left/right). */
export const LM_MIRROR: readonly number[] = [1, 0, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10];

/**
 * Each segment goes FROM the average of `from` TO the average of `to` (positions in the 12-point array).
 * Direction = to - from, computed in PIXEL space (x * width, y * height), then normalized.
 */
export const SEGMENT_ENDPOINTS: Readonly<Record<SegmentId, { from: readonly number[]; to: readonly number[] }>> = {
  l_upper_arm: { from: [LM.lShoulder], to: [LM.lElbow] },
  r_upper_arm: { from: [LM.rShoulder], to: [LM.rElbow] },
  l_forearm:   { from: [LM.lElbow],    to: [LM.lWrist] },
  r_forearm:   { from: [LM.rElbow],    to: [LM.rWrist] },
  torso:       { from: [LM.lHip, LM.rHip], to: [LM.lShoulder, LM.rShoulder] },
  l_thigh:     { from: [LM.lHip],      to: [LM.lKnee] },
  r_thigh:     { from: [LM.rHip],      to: [LM.rKnee] },
  l_shin:      { from: [LM.lKnee],     to: [LM.lAnkle] },
  r_shin:      { from: [LM.rKnee],     to: [LM.rAnkle] },
};

/** Mirror partner of each segment. */
export const SEGMENT_MIRROR: Readonly<Record<SegmentId, SegmentId>> = {
  l_upper_arm: "r_upper_arm", r_upper_arm: "l_upper_arm",
  l_forearm: "r_forearm", r_forearm: "l_forearm",
  torso: "torso",
  l_thigh: "r_thigh", r_thigh: "l_thigh",
  l_shin: "r_shin", r_shin: "l_shin",
};

export const MODE_SEGMENTS: Readonly<Record<PosturalMode, readonly SegmentId[]>> = {
  standing: ["l_upper_arm", "r_upper_arm", "l_forearm", "r_forearm", "torso", "l_thigh", "r_thigh", "l_shin", "r_shin"],
  seated:   ["l_upper_arm", "r_upper_arm", "l_forearm", "r_forearm", "torso"],
};
