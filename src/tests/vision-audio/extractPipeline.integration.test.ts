/**
 * Owner: Zaid
 * Purpose: Integration tests for the offline extraction pipeline (poseEngine -> OneEuro -> segments extractSegments)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LM, SCORED_LANDMARK_INDICES } from "../../config";
import { assertRawPoseLandmarks, assertSegmentMap } from "../../contracts/validators";
import type { RawPoseLandmarks } from "../../types/pulse";
import { extractSegments } from "../../vision/segments";
import { createMockVideo, makeMediaPipePose } from "./helpers";

const mpMocks = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
  detectForVideo: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: mpMocks.forVisionTasks,
  },
  PoseLandmarker: {
    createFromOptions: mpMocks.createFromOptions,
  },
}));

describe("Extract pipeline integration (Zaid -> Toufic)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mpMocks.forVisionTasks.mockResolvedValue({ wasmLoaderPath: "/wasm" });
    mpMocks.createFromOptions.mockResolvedValue({ detectForVideo: mpMocks.detectForVideo });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes offline assets once, handles GPU->CPU fallback, and extracts un-mirrored smoothed video frames", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mpMocks.createFromOptions
      .mockRejectedValueOnce(new Error("WebGL unavailable"))
      .mockResolvedValueOnce({ detectForVideo: mpMocks.detectForVideo });

    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await Promise.all([initPoseLandmarker(), initPoseLandmarker()]);
    await initPoseLandmarker();

    expect(mpMocks.forVisionTasks).toHaveBeenCalledTimes(1);
    expect(mpMocks.forVisionTasks).toHaveBeenCalledWith("/wasm");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mpMocks.createFromOptions).toHaveBeenNthCalledWith(
      2,
      { wasmLoaderPath: "/wasm" },
      expect.objectContaining({
        baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    );

    // 60 frames (2 s @ 30 FPS) of a dancer standing on camera right (centerX = 0.65) with tremor jitter
    const videoMock = createMockVideo({
      width: 1280,
      height: 720,
      readyState: 4,
      liveStream: false,
    });
    const rawFrames: RawPoseLandmarks[] = [];
    const rawInputXs: number[] = [];

    const stop = startPose(videoMock.video, (raw) => rawFrames.push(raw));

    for (let i = 0; i < 60; i++) {
      const jitterX = (i % 2 === 0 ? 1 : -1) * 0.015;
      const pose = makeMediaPipePose({
        centerX: 0.65,
        centerY: 0.5,
        jitter: { x: jitterX, y: -jitterX * 0.5 },
      });
      rawInputXs.push(pose[11].x);
      mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [pose] });

      const tMs = 1000 + i * (1000 / 30);
      videoMock.emitFrame({ nowMs: tMs, presentationTimeMs: tMs, mediaTimeSec: i / 30 });
    }

    stop();
    expect(videoMock.pendingCallbackCount()).toBe(0);
    expect(rawFrames).toHaveLength(60);

    // Every emitted frame passes RawPoseLandmarks validator, preserves un-mirrored camera side, and builds valid template segments
    rawFrames.forEach((frame, idx) => {
      assertRawPoseLandmarks(frame);
      expect(frame.width).toBe(1280);
      expect(frame.height).toBe(720);
      expect(frame.mediaTimeSec).toBeCloseTo(idx / 30, 6);
      expect(frame.landmarks).toHaveLength(SCORED_LANDMARK_INDICES.length);
      // lShoulder (index 0) stays on camera right (> 0.65), NOT mirrored
      expect(frame.landmarks[LM.lShoulder].x).toBeGreaterThan(0.65);

      const templateSegments = extractSegments(frame.landmarks, frame.width, frame.height, {
        mirror: false,
        mode: "standing",
      });
      assertSegmentMap(templateSegments, ["l_upper_arm", "r_upper_arm", "l_forearm", "r_forearm", "torso", "l_thigh", "r_thigh", "l_shin", "r_shin"], "template");
      expect(Object.keys(templateSegments)).toHaveLength(9);
    });

    // One Euro smoothing visibly attenuates stationary jitter across frames 15..59
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = (arr: number[]) => {
      const m = mean(arr);
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };
    const smoothedXs = rawFrames.slice(15).map((f) => f.landmarks[LM.lShoulder].x);
    expect(variance(smoothedXs)).toBeLessThan(variance(rawInputXs.slice(15)) * 0.25);
  });

  it("resets One Euro and background lock when seeking backward in a video file", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const videoMock = createMockVideo({ liveStream: false });
    const emitted: RawPoseLandmarks[] = [];
    const stop = startPose(videoMock.video, (raw) => emitted.push(raw));

    // Scrub forward up to 10 s with dancer on right (0.75)
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.75 })],
    });
    videoMock.emitFrame({ nowMs: 100, mediaTimeSec: 0.0 });

    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.75 })],
    });
    videoMock.emitFrame({ nowMs: 133, mediaTimeSec: 10.0 });

    // Scrub backward to 0.0 s with dancer on left (0.25) -> must snap cleanly to ~0.25 without smearing or lock rejection
    const leftPose = makeMediaPipePose({ centerX: 0.25 });
    mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [leftPose] });
    videoMock.emitFrame({ nowMs: 166, mediaTimeSec: 0.0 });

    stop();

    expect(emitted).toHaveLength(3);
    expect(emitted[2].landmarks[LM.lShoulder].x).toBeCloseTo(leftPose[11].x, 5);
    expect(emitted[2].landmarks[LM.lShoulder].v).toBeGreaterThan(0.55);
  });

  it("handles empty frames cleanly without dragging from (0, 0), asserts numeric visibility, and stops cleanly", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const videoMock = createMockVideo({ liveStream: false });
    const emitted: RawPoseLandmarks[] = [];
    const stop = startPose(videoMock.video, (raw) => emitted.push(raw));

    // Visible frame -> empty frame -> re-entry frame
    const p1 = makeMediaPipePose({ centerX: 0.6 });
    const p2 = makeMediaPipePose({ centerX: 0.62 });
    mpMocks.detectForVideo
      .mockReturnValueOnce({ landmarks: [p1] })
      .mockReturnValueOnce({ landmarks: [] })
      .mockReturnValueOnce({ landmarks: [p2] });

    videoMock.emitFrame({ nowMs: 100, mediaTimeSec: 0.0 });
    videoMock.emitFrame({ nowMs: 133, mediaTimeSec: 0.033 });
    videoMock.emitFrame({ nowMs: 166, mediaTimeSec: 0.066 });

    expect(emitted).toHaveLength(3);
    assertRawPoseLandmarks(emitted[1]);
    expect(emitted[1].landmarks.every((pt) => pt.x === 0 && pt.y === 0 && pt.v === 0)).toBe(true);
    // Re-entry snaps cleanly to p2 without smearing from (0, 0)
    expect(emitted[2].landmarks[LM.lShoulder].x).toBeCloseTo(p2[11].x, 5);

    // Missing numeric visibility triggers FR-16 error immediately
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ dropVisibility: true })],
    });
    expect(() => videoMock.emitFrame({ nowMs: 200, mediaTimeSec: 0.1 })).toThrow(/visibility/i);

    stop();
    expect(videoMock.pendingCallbackCount()).toBe(0);
    const countAfterStop = emitted.length;
    expect(countAfterStop).toBe(3);
  });

  it("allows > 0.35 lateral camera cuts on pre-recorded video files without backgroundLock rejection", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const videoMock = createMockVideo({ width: 1280, height: 720, readyState: 4, liveStream: false });
    const emitted: RawPoseLandmarks[] = [];
    const stop = startPose(videoMock.video, (raw) => emitted.push(raw));

    // 10 frames anchored on left (centerX = 0.20)
    const leftPose = makeMediaPipePose({ centerX: 0.2 });
    for (let i = 0; i < 10; i++) {
      mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [leftPose] });
      videoMock.emitFrame({ nowMs: 1000 + i * 33, mediaTimeSec: i / 30 });
    }

    // Instant camera cut to far right (centerX = 0.80, dx = 0.60 > 0.35) for 25 frames
    const cutPose = makeMediaPipePose({ centerX: 0.8 });
    for (let i = 10; i < 35; i++) {
      mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [cutPose] });
      videoMock.emitFrame({ nowMs: 1000 + i * 33, mediaTimeSec: i / 30 });
    }

    stop();

    // Every frame including the camera cut frame is emitted and extracts valid un-mirrored standing segments
    expect(emitted).toHaveLength(35);
    const preCutShoulderX = emitted[9].landmarks[LM.lShoulder].x;
    const cutFirstShoulderX = emitted[10].landmarks[LM.lShoulder].x;
    const settledCutShoulderX = emitted[34].landmarks[LM.lShoulder].x;

    expect(cutFirstShoulderX).toBeGreaterThan(preCutShoulderX);
    expect(settledCutShoulderX).toBeCloseTo(cutPose[11].x, 2);

    for (let i = 10; i < emitted.length; i++) {
      assertRawPoseLandmarks(emitted[i]);
      const segments = extractSegments(emitted[i].landmarks, emitted[i].width, emitted[i].height, {
        mirror: false,
        mode: "standing",
      });
      assertSegmentMap(
        segments,
        ["l_upper_arm", "r_upper_arm", "l_forearm", "r_forearm", "torso", "l_thigh", "r_thigh", "l_shin", "r_shin"],
        "cutFrame",
      );
      expect(Object.keys(segments)).toHaveLength(9);
    }
  });
});
