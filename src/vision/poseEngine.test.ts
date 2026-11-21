/**
 * Owner: Zaid
 * Purpose: Unit tests for MediaPipe PoseLandmarker runtime wrapper (FR-16, FR-17)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCORED_LANDMARK_INDICES } from "../config";
import { assertRawPoseLandmarks } from "../contracts/validators";
import type { RawPoseLandmarks } from "../types/pulse";

interface FakePosePoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

const mocks = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
  detectForVideo: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: mocks.forVisionTasks,
  },
  PoseLandmarker: {
    createFromOptions: mocks.createFromOptions,
  },
}));

function make33Landmarks(overrideVisibility?: number): FakePosePoint[] {
  return Array.from({ length: 33 }, (_, i) => ({
    x: 0.1 + i * 0.02,
    y: 0.8 - i * 0.01,
    z: 0,
    visibility: overrideVisibility !== undefined ? overrideVisibility : 0.9,
  }));
}

interface MockVideoHandle {
  video: HTMLVideoElement;
  triggerFrame: (now: number, metadata?: Partial<VideoFrameCallbackMetadata>) => void;
  cancelSpy: ReturnType<typeof vi.fn>;
  activeCallbackCount: () => number;
}

function createMockVideo(opts?: {
  width?: number;
  height?: number;
  readyState?: number;
  liveStream?: boolean;
}): MockVideoHandle {
  let nextId = 1;
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  const cancelSpy = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });

  const videoObj = {
    videoWidth: opts?.width ?? 1280,
    videoHeight: opts?.height ?? 720,
    readyState: opts?.readyState ?? 4,
    currentTime: 0,
    srcObject: opts?.liveStream ? ({} as MediaStream) : null,
    requestVideoFrameCallback(cb: VideoFrameRequestCallback): number {
      const id = nextId++;
      callbacks.set(id, cb);
      return id;
    },
    cancelVideoFrameCallback: cancelSpy,
  };

  return {
    video: videoObj as unknown as HTMLVideoElement,
    triggerFrame(now: number, metadata?: Partial<VideoFrameCallbackMetadata>) {
      const entry = callbacks.entries().next();
      if (entry.done) {
        throw new Error("No queued requestVideoFrameCallback");
      }
      const [id, cb] = entry.value;
      callbacks.delete(id);
      cb(now, {
        expectedDisplayTime: now,
        presentationTime: now,
        mediaTime: videoObj.currentTime,
        presentedFrames: 1,
        width: videoObj.videoWidth,
        height: videoObj.videoHeight,
        ...metadata,
      });
    },
    cancelSpy,
    activeCallbackCount: () => callbacks.size,
  };
}

describe("poseEngine", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.forVisionTasks.mockResolvedValue({ wasmLoaderPath: "/wasm/loader.js" });
    mocks.detectForVideo.mockReturnValue({ landmarks: [make33Landmarks()] });
    mocks.createFromOptions.mockResolvedValue({
      detectForVideo: mocks.detectForVideo,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads local /wasm and /models/pose_landmarker_lite.task with VIDEO mode and numPoses 1, and deduplicates concurrent init calls", async () => {
    const { initPoseLandmarker } = await import("./poseEngine");

    await Promise.all([initPoseLandmarker(), initPoseLandmarker()]);
    await initPoseLandmarker();

    expect(mocks.forVisionTasks).toHaveBeenCalledTimes(1);
    expect(mocks.forVisionTasks).toHaveBeenCalledWith("/wasm");
    expect(mocks.createFromOptions).toHaveBeenCalledTimes(1);
    expect(mocks.createFromOptions).toHaveBeenCalledWith(
      { wasmLoaderPath: "/wasm/loader.js" },
      {
        baseOptions: {
          modelAssetPath: "/models/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      },
    );
  });

  it("falls back to CPU delegate if GPU creation fails and resets initPromise if both fail", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.createFromOptions
      .mockRejectedValueOnce(new Error("WebGL unavailable"))
      .mockResolvedValueOnce({ detectForVideo: mocks.detectForVideo });

    const mod = await import("./poseEngine");
    await mod.initPoseLandmarker();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createFromOptions).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        baseOptions: {
          modelAssetPath: "/models/pose_landmarker_lite.task",
          delegate: "CPU",
        },
      }),
    );

    // Test retry after total failure on fresh module
    vi.resetModules();
    vi.clearAllMocks();
    mocks.forVisionTasks
      .mockRejectedValueOnce(new Error("WASM load error"))
      .mockResolvedValueOnce({ wasmLoaderPath: "/wasm/loader.js" });
    mocks.createFromOptions.mockResolvedValue({ detectForVideo: mocks.detectForVideo });

    const modRetry = await import("./poseEngine");
    await expect(modRetry.initPoseLandmarker()).rejects.toThrow("WASM load error");
    await expect(modRetry.initPoseLandmarker()).resolves.toBeUndefined();
  });

  it("throws if startPose is called before initPoseLandmarker or without requestVideoFrameCallback", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    const mock = createMockVideo();

    expect(() => startPose(mock.video, () => {})).toThrow(/initPoseLandmarker/i);

    await initPoseLandmarker();
    const unsupportedVideo = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement;
    expect(() => startPose(unsupportedVideo, () => {})).toThrow(/requestVideoFrameCallback/i);
  });

  it("extracts exact 12 SCORED_LANDMARK_INDICES without mirroring, populates metadata, and passes assertRawPoseLandmarks", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    await initPoseLandmarker();

    const pose33 = make33Landmarks();
    mocks.detectForVideo.mockReturnValue({ landmarks: [pose33] });

    const mock = createMockVideo({ width: 1280, height: 720, readyState: 4 });
    const received: RawPoseLandmarks[] = [];
    const stop = startPose(mock.video, (raw) => received.push(raw));

    mock.triggerFrame(1000, { presentationTime: 1005.5, mediaTime: 12.345 });

    expect(received).toHaveLength(1);
    const frame = received[0];
    assertRawPoseLandmarks(frame);
    expect(Number(frame.tFrameMs)).toBe(1005.5);
    expect(frame.mediaTimeSec).toBe(12.345);
    expect(frame.width).toBe(1280);
    expect(frame.height).toBe(720);
    expect(frame.landmarks).toHaveLength(12);

    SCORED_LANDMARK_INDICES.forEach((mpIdx, outIdx) => {
      expect(frame.landmarks[outIdx].x).toBeCloseTo(pose33[mpIdx].x, 6);
      expect(frame.landmarks[outIdx].y).toBeCloseTo(pose33[mpIdx].y, 6);
      expect(frame.landmarks[outIdx].v).toBe(pose33[mpIdx].visibility);
    });

    stop();
  });

  it("applies One Euro smoothing across frames and resets smoother on video file backward seek", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    await initPoseLandmarker();

    const p1 = make33Landmarks();
    const p2 = make33Landmarks();
    p2[11].x = p1[11].x + 0.2;
    const p3 = make33Landmarks();
    p3[11].x = p1[11].x + 0.4;

    mocks.detectForVideo
      .mockReturnValueOnce({ landmarks: [p1] })
      .mockReturnValueOnce({ landmarks: [p2] })
      .mockReturnValueOnce({ landmarks: [p3] });

    const mock = createMockVideo();
    const received: RawPoseLandmarks[] = [];
    const stop = startPose(mock.video, (raw) => received.push(raw));

    mock.triggerFrame(100, { mediaTime: 1.0 });
    mock.triggerFrame(133, { mediaTime: 1.033 });
    // Backward seek in file -> smoother resets so p3 passes through un-smoothed
    mock.triggerFrame(166, { mediaTime: 0.2 });

    expect(received[0].landmarks[0].x).toBeCloseTo(p1[11].x, 6);
    expect(received[1].landmarks[0].x).toBeLessThan(p2[11].x);
    expect(received[1].landmarks[0].x).toBeGreaterThan(p1[11].x);
    expect(received[2].landmarks[0].x).toBeCloseTo(p3[11].x, 6);

    stop();
  });

  it("emits 12 zeroed landmarks when no person is detected", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    await initPoseLandmarker();

    mocks.detectForVideo.mockReturnValue({ landmarks: [] });
    const mock = createMockVideo();
    const received: RawPoseLandmarks[] = [];
    const stop = startPose(mock.video, (raw) => received.push(raw));

    mock.triggerFrame(500, { mediaTime: 0.5 });

    expect(received).toHaveLength(1);
    assertRawPoseLandmarks(received[0]);
    expect(received[0].landmarks).toHaveLength(12);
    for (const pt of received[0].landmarks) {
      expect(pt).toEqual({ x: 0, y: 0, v: 0 });
    }

    stop();
  });

  it("asserts numeric landmark visibility (FR-16)", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    await initPoseLandmarker();

    const missingVis = make33Landmarks();
    delete missingVis[11].visibility;
    mocks.detectForVideo.mockReturnValue({ landmarks: [missingVis] });

    const mock = createMockVideo();
    const stop = startPose(mock.video, () => {});

    expect(() => mock.triggerFrame(100)).toThrow(/visibility/i);
    stop();
  });

  it("skips detection when video dimensions are zero or readyState < 2, enforces monotonic timestamps across sessions, and cancels cleanly on stop()", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    await initPoseLandmarker();

    // Unready video tick is skipped safely without calling detectForVideo
    const unreadyMock = createMockVideo({ width: 0, height: 0, readyState: 1 });
    const received: RawPoseLandmarks[] = [];
    const stop1 = startPose(unreadyMock.video, (raw) => received.push(raw));
    unreadyMock.triggerFrame(500);
    expect(mocks.detectForVideo).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
    expect(unreadyMock.activeCallbackCount()).toBe(1);
    stop1();
    expect(unreadyMock.cancelSpy).toHaveBeenCalledTimes(1);
    expect(unreadyMock.activeCallbackCount()).toBe(0);

    // Monotonic timestamps across equal/decreasing `now` and across consecutive sessions
    const mockA = createMockVideo();
    const stopA = startPose(mockA.video, (raw) => received.push(raw));
    mockA.triggerFrame(1000);
    mockA.triggerFrame(1000);
    mockA.triggerFrame(950);
    stopA();

    const mockB = createMockVideo();
    const stopB = startPose(mockB.video, (raw) => received.push(raw));
    mockB.triggerFrame(200); // New session with smaller clock value
    stopB();

    const timestamps = mocks.detectForVideo.mock.calls.map((c) => c[1] as number);
    expect(timestamps).toEqual([1000, 1001, 1002, 1003]);

    // Calling stop() prevents any future emissions even if a lingering frame fires
    const receivedBeforeStop = received.length;
    const lingering = createMockVideo();
    let capturedCb: VideoFrameRequestCallback | null = null;
    (lingering.video as unknown as { requestVideoFrameCallback: (cb: VideoFrameRequestCallback) => number }).requestVideoFrameCallback = (cb) => {
      capturedCb = cb;
      return 99;
    };
    const stopLingering = startPose(lingering.video, (raw) => received.push(raw));
    stopLingering();
    expect(lingering.cancelSpy).toHaveBeenCalledWith(99);
    capturedCb!(2000, {
      expectedDisplayTime: 2000,
      presentationTime: 2000,
      mediaTime: 1,
      presentedFrames: 1,
      width: 1280,
      height: 720,
    });
    expect(received).toHaveLength(receivedBeforeStop);
  });

  it("ignores > 0.35 passerby jumps on live streams without invoking onRawFrame or polluting One Euro, while preserving empty occlusion frames", async () => {
    const { initPoseLandmarker, startPose } = await import("./poseEngine");
    await initPoseLandmarker();

    const makeCenteredPose = (centerX: number): FakePosePoint[] =>
      Array.from({ length: 33 }, () => ({ x: centerX, y: 0.5, z: 0, visibility: 0.9 }));

    const liveMock = createMockVideo({ liveStream: true });
    const received: RawPoseLandmarks[] = [];
    const stopLive = startPose(liveMock.video, (raw) => received.push(raw));

    // Frame 1: dancer at x = 0.25 -> emitted
    mocks.detectForVideo.mockReturnValueOnce({ landmarks: [makeCenteredPose(0.25)] });
    liveMock.triggerFrame(1000, { mediaTime: 0 });
    expect(received).toHaveLength(1);
    expect(received[0].landmarks[0].x).toBeCloseTo(0.25, 6);

    // Frames 2..6: passerby at x = 0.80 (dx = 0.55 > 0.35) -> ignored completely (no callback, loop keeps scheduling)
    for (let i = 1; i <= 5; i++) {
      mocks.detectForVideo.mockReturnValueOnce({ landmarks: [makeCenteredPose(0.8)] });
      liveMock.triggerFrame(1000 + i * 33, { mediaTime: i * 0.033 });
      expect(received).toHaveLength(1);
      expect(liveMock.activeCallbackCount()).toBe(1);
    }

    // Frame 7: dancer returns at x = 0.28 -> immediately accepted with zero drift toward 0.80
    mocks.detectForVideo.mockReturnValueOnce({ landmarks: [makeCenteredPose(0.28)] });
    liveMock.triggerFrame(1200, { mediaTime: 0.2 });
    expect(received).toHaveLength(2);
    expect(received[1].landmarks[0].x).toBeGreaterThanOrEqual(0.25);
    expect(received[1].landmarks[0].x).toBeLessThanOrEqual(0.2801);

    // Frame 8: camera covered (landmarks: []) -> emits 12 zeroed landmarks and preserves backgroundLock anchor
    mocks.detectForVideo.mockReturnValueOnce({ landmarks: [] });
    liveMock.triggerFrame(1233, { mediaTime: 0.233 });
    expect(received).toHaveLength(3);
    expect(received[2].landmarks.every((pt) => pt.x === 0 && pt.y === 0 && pt.v === 0)).toBe(true);

    // Frame 9: passerby immediately after occlusion at x = 0.80 is still ignored
    mocks.detectForVideo.mockReturnValueOnce({ landmarks: [makeCenteredPose(0.8)] });
    liveMock.triggerFrame(1266, { mediaTime: 0.266 });
    expect(received).toHaveLength(3);

    stopLive();

    // Pre-recorded video file (srcObject: null) bypasses backgroundLock on > 0.35 cuts
    const fileMock = createMockVideo({ liveStream: false });
    const fileFrames: RawPoseLandmarks[] = [];
    const stopFile = startPose(fileMock.video, (raw) => fileFrames.push(raw));

    mocks.detectForVideo
      .mockReturnValueOnce({ landmarks: [makeCenteredPose(0.2)] })
      .mockReturnValueOnce({ landmarks: [makeCenteredPose(0.8)] });
    fileMock.triggerFrame(100, { mediaTime: 0 });
    fileMock.triggerFrame(133, { mediaTime: 0.033 });

    expect(fileFrames).toHaveLength(2);
    expect(fileFrames[1].landmarks[0].x).toBeGreaterThan(fileFrames[0].landmarks[0].x);
    stopFile();
  });
});
