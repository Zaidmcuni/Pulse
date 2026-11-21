/**
 * Owner: Zaid
 * Purpose: MediaPipe Pose Landmarker on every new video frame -> RawPoseLandmarks (smoothed + background-locked, NOT mirrored)
 * FRs: FR-16, FR-17 (uses FR-18, FR-22)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Output rules: see RawPoseLandmarks in types/pulse.ts (12 points in SCORED_LANDMARK_INDICES order; invisible frames still emitted with v = 0).
 * Must also work on a <video> playing a file (used by Toufic's extract tool).
 */

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG, SCORED_LANDMARK_INDICES } from "../config";
import { perfMs, type LandmarkPoint, type RawPoseLandmarks } from "../types/pulse";
import { createOneEuroSmoother } from "./oneEuroFilter";

let landmarker: PoseLandmarker | null = null;
let initPromise: Promise<void> | null = null;
let lastDetectTimestampMs = 0;

function resolveOfflineAssetPaths(): { wasmPath: string; modelAssetPath: string } {
  const envBase =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.BASE_URL === "string"
      ? import.meta.env.BASE_URL
      : "/";
  const base = envBase.endsWith("/") ? envBase : `${envBase}/`;
  return {
    wasmPath: `${base}wasm`,
    modelAssetPath: `${base}models/pose_landmarker_lite.task`,
  };
}

function makeEmptyLandmarks(): LandmarkPoint[] {
  return SCORED_LANDMARK_INDICES.map(() => ({ x: 0, y: 0, v: 0 }));
}

function extractScoredLandmarks(
  pose: ReadonlyArray<{ x: number; y: number; visibility?: number }>,
): LandmarkPoint[] {
  return SCORED_LANDMARK_INDICES.map((index) => {
    const lm = pose[index];
    if (!lm || typeof lm.visibility !== "number" || !Number.isFinite(lm.visibility)) {
      throw new Error(
        "MediaPipe PoseLandmarker landmark is missing numeric visibility; ensure @mediapipe/tasks-vision >= 0.10.11",
      );
    }
    return {
      x: lm.x,
      y: lm.y,
      v: Math.min(1, Math.max(0, lm.visibility)),
    };
  });
}

/** Loads the lite model + WASM from /models and /wasm (offline). Asserts landmark visibility is a number. */
export function initPoseLandmarker(): Promise<void> {
  if (landmarker) {
    return Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const { wasmPath, modelAssetPath } = resolveOfflineAssetPaths();
      const vision = await FilesetResolver.forVisionTasks(wasmPath);

      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch (gpuError) {
        console.warn("PoseLandmarker GPU delegate failed; falling back to CPU:", gpuError);
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
    } catch (err) {
      landmarker = null;
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/** Starts the requestVideoFrameCallback loop. Returns stop(). Call initPoseLandmarker() first. */
export function startPose(
  video: HTMLVideoElement,
  onRawFrame: (raw: RawPoseLandmarks) => void,
): () => void {
  const activeLandmarker = landmarker;
  if (!activeLandmarker) {
    throw new Error("PoseLandmarker is not initialized. Call await initPoseLandmarker() first.");
  }
  if (typeof video.requestVideoFrameCallback !== "function") {
    throw new Error(
      "video.requestVideoFrameCallback is unavailable in this browser; desktop Chrome or Edge 120+ is required.",
    );
  }

  const smoother = createOneEuroSmoother(CONFIG.oneEuro.minCutoffHz, CONFIG.oneEuro.beta);
  let stopped = false;
  let rafHandle: number | null = null;
  let prevMediaTimeSec: number | null = null;

  const scheduleNext = (): void => {
    if (stopped) return;
    rafHandle = video.requestVideoFrameCallback(onVideoFrame);
  };

  const onVideoFrame = (now: number, metadata: VideoFrameCallbackMetadata): void => {
    if (stopped) return;
    rafHandle = null;

    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      scheduleNext();
      return;
    }

    const rawFrameTime =
      metadata &&
      typeof metadata.presentationTime === "number" &&
      Number.isFinite(metadata.presentationTime) &&
      metadata.presentationTime > 0
        ? metadata.presentationTime
        : now;
    const tFrameMs = perfMs(rawFrameTime);

    const mediaTimeSec =
      metadata && typeof metadata.mediaTime === "number" && Number.isFinite(metadata.mediaTime)
        ? metadata.mediaTime
        : video.currentTime;

    // Reset filter state when seeking backward in a video file (e.g. ExtractTool)
    if (prevMediaTimeSec !== null && mediaTimeSec < prevMediaTimeSec) {
      smoother.reset();
    }
    prevMediaTimeSec = mediaTimeSec;

    // MediaPipe VIDEO mode requires strictly monotonically increasing integer timestamps across frames and sessions
    const candidateMs = Number.isFinite(now) ? Math.ceil(now) : 0;
    const detectTsMs = Math.max(candidateMs, lastDetectTimestampMs + 1);
    lastDetectTimestampMs = detectTsMs;

    const result = activeLandmarker.detectForVideo(video, detectTsMs);
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!result.landmarks || result.landmarks.length === 0) {
      smoother.reset();
      onRawFrame({
        tFrameMs,
        mediaTimeSec,
        width,
        height,
        landmarks: makeEmptyLandmarks(),
      });
      scheduleNext();
      return;
    }

    const raw12 = extractScoredLandmarks(result.landmarks[0]);
    const landmarks = smoother.smooth(raw12, tFrameMs);
    onRawFrame({
      tFrameMs,
      mediaTimeSec,
      width,
      height,
      landmarks,
    });

    scheduleNext();
  };

  scheduleNext();

  return () => {
    if (stopped) return;
    stopped = true;
    if (rafHandle !== null && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(rafHandle);
      rafHandle = null;
    }
  };
}
