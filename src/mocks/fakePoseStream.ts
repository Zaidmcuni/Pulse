/**
 * Owner: Shared (Step 0)
 * Purpose: same signature as startPose() but emits GOLDEN_RAW at 30 FPS with no camera. Use until Zaid's poseEngine lands.
 */
import { perfMs, type RawPoseLandmarks } from "../types/pulse";
import { GOLDEN_RAW } from "./fixtures";

export function startFakePose(_video: HTMLVideoElement | null, onRawFrame: (raw: RawPoseLandmarks) => void): () => void {
  const t0 = performance.now();
  const id = setInterval(() => {
    const now = performance.now();
    onRawFrame({ ...GOLDEN_RAW, tFrameMs: perfMs(now), mediaTimeSec: (now - t0) / 1000 });
  }, 1000 / 30);
  return () => clearInterval(id);
}
