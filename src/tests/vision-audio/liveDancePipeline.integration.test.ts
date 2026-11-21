/**
 * Owner: Zaid
 * Purpose: End-to-end integration tests for live dance pipeline (poseEngine + backgroundLock + songPlayer + poseRecorder + SkeletonOverlay)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../../config";
import { assertLandmarks, assertPoseFrame } from "../../contracts/validators";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { createSongPlayer } from "../../audio/songPlayer";
import { createBackgroundLock } from "../../vision/backgroundLock";
import { createPoseRecorder } from "../../vision/poseRecorder";
import { drawSkeleton } from "../../vision/SkeletonOverlay";
import {
  perfMs,
  songMs,
  type Dance,
  type LandmarkPoint,
  type PoseFrame,
  type RawPoseLandmarks,
} from "../../types/pulse";
import {
  createMockCanvasContext,
  createMockVideo,
  installMockWebAudio,
  makeMediaPipePose,
  toMirroredPoseFrame,
  type MockWebAudioHandle,
} from "./helpers";

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

describe("Live dance pipeline integration (Zaid -> Mohamed)", () => {
  let audioMock: MockWebAudioHandle;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mpMocks.forVisionTasks.mockResolvedValue({ wasmLoaderPath: "/wasm" });
    mpMocks.createFromOptions.mockResolvedValue({ detectForVideo: mpMocks.detectForVideo });
    audioMock = installMockWebAudio(180);
  });

  afterEach(() => {
    audioMock.restore();
    vi.restoreAllMocks();
  });

  it("maintains <= 25 ms sync over a full 180 s song with cold-start fallback and downsampled clip recording", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const player = createSongPlayer();
    const recorder = createPoseRecorder();
    const videoMock = createMockVideo({
      width: 1280,
      height: 720,
      readyState: 4,
      liveStream: true,
    });
    const dance180: Dance = { ...FAKE_DANCE, lengthSec: 180 };

    await player.load(dance180);
    audioMock.setColdStart(true);
    audioMock.advanceAudio(10); // AudioContext starts at 10.0 s
    player.start();

    const heardTimesMs: number[] = [];
    const expectedHeardMs: number[] = [];

    const stop = startPose(videoMock.video, (raw) => {
      const frame = toMirroredPoseFrame(raw, "standing");
      assertPoseFrame(frame, "standing");

      const tSong = player.heardSongTimeMs(raw.tFrameMs);
      heardTimesMs.push(Number(tSong));

      const elapsedAudioSec = audioMock.currentTimeSec() - 10;
      const idealHeardSec = Math.max(
        0,
        Math.min(180, elapsedAudioSec - 0.01 - 0.02 - CONFIG.camDelaySec),
      );
      expectedHeardMs.push(idealHeardSec * 1000);

      if (Number(tSong) <= 30_000) {
        recorder.push(frame, tSong);
      }
    });

    const dtSec = 1 / 30;
    const totalFrames = 180 * 30;
    for (let i = 0; i < totalFrames; i++) {
      // Cold start during t = 0..0.2 s, then warm getOutputTimestamp() for remainder of 180 s song
      audioMock.setColdStart(i < 6);
      const pose = makeMediaPipePose({ centerX: 0.5, armPhase: i * 0.1 });
      mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [pose] });

      const nowMs = 11_000 + i * (1000 / 30);
      videoMock.emitFrame({ nowMs, presentationTimeMs: nowMs, mediaTimeSec: i * dtSec });

      audioMock.advanceAudio(dtSec);
    }

    stop();

    expect(heardTimesMs).toHaveLength(totalFrames);
    for (let i = 0; i < heardTimesMs.length; i++) {
      expect(heardTimesMs[i]).toBeGreaterThanOrEqual(0);
      expect(heardTimesMs[i]).toBeLessThanOrEqual(180_000);
      if (i > 0) {
        expect(heardTimesMs[i]).toBeGreaterThanOrEqual(heardTimesMs[i - 1]);
      }
      expect(Math.abs(heardTimesMs[i] - expectedHeardMs[i])).toBeLessThanOrEqual(25);
    }

    // First 30 s downsampled at 10-12 FPS (~300 samples at 30 FPS input)
    const clipSamples = recorder.getSamples();
    expect(clipSamples.length).toBeGreaterThanOrEqual(298);
    expect(clipSamples.length).toBeLessThanOrEqual(361);

    // Verify normalization & compact binary budget (< 20 KB)
    const firstSample = clipSamples[0];
    assertLandmarks(firstSample.points, "clipFirstSample");
    const torsoMidX =
      (firstSample.points[LM.lShoulder].x +
        firstSample.points[LM.rShoulder].x +
        firstSample.points[LM.lHip].x +
        firstSample.points[LM.rHip].x) /
      4;
    expect(torsoMidX).toBeCloseTo(0, 2);
    const shoulderDist = Math.hypot(
      firstSample.points[LM.rShoulder].x - firstSample.points[LM.lShoulder].x,
      firstSample.points[LM.rShoulder].y - firstSample.points[LM.lShoulder].y,
    );
    expect(shoulderDist).toBeCloseTo(1.0, 2);
    expect(clipSamples.length * 12 * 4).toBeLessThan(20_000);
  });

  it("freezes song time and recorder across mid-song pause/resume without firing onEnd", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const player = createSongPlayer();
    const recorder = createPoseRecorder();
    const endSpy = vi.fn();
    player.onEnd(endSpy);

    await player.load(FAKE_DANCE);
    audioMock.advanceAudio(10);
    player.start();

    const videoMock = createMockVideo({ liveStream: true });
    const stop = startPose(videoMock.video, (raw) => {
      const frame = toMirroredPoseFrame(raw, "standing");
      const tSong = player.heardSongTimeMs(raw.tFrameMs);
      recorder.push(frame, tSong);
    });

    // Dance 10 s (at 10 FPS steps for clarity, synchronized with simulated performance.now clock)
    let frameIndex = 0;
    let perfTimeMs = 11_000;
    let videoMediaSec = 0;
    const stepFrame = () => {
      mpMocks.detectForVideo.mockReturnValueOnce({
        landmarks: [makeMediaPipePose({ centerX: 0.5, armPhase: frameIndex * 0.2 })],
      });
      videoMock.emitFrame({
        nowMs: perfTimeMs,
        presentationTimeMs: perfTimeMs,
        mediaTimeSec: videoMediaSec,
      });
      frameIndex++;
    };

    for (let i = 0; i < 100; i++) {
      audioMock.advanceAudio(0.1);
      perfTimeMs += 100;
      videoMediaSec += 0.1;
      stepFrame();
    }
    expect(Number(player.songTimeMs())).toBeCloseTo(10_000, 3);
    const countAtPause = recorder.getSamples().length;
    expect(countAtPause).toBeGreaterThan(90);

    // Pause and let AudioContext + camera run 30 s while paused
    player.pause();
    expect(endSpy).not.toHaveBeenCalled();

    for (let i = 0; i < 30; i++) {
      audioMock.advanceAudio(1.0);
      perfTimeMs += 1000;
      videoMediaSec += 1.0;
      stepFrame();
      expect(Number(player.songTimeMs())).toBeCloseTo(10_000, 3);
      expect(Number(player.heardSongTimeMs(perfMs(perfTimeMs)))).toBeCloseTo(10_000, 3);
    }
    expect(endSpy).not.toHaveBeenCalled();
    expect(recorder.getSamples()).toHaveLength(countAtPause);

    // Resume and dance 10 more seconds -> reaches 20,000 ms cleanly
    player.resume();
    for (let i = 0; i < 100; i++) {
      audioMock.advanceAudio(0.1);
      perfTimeMs += 100;
      videoMediaSec += 0.1;
      stepFrame();
    }
    expect(Number(player.songTimeMs())).toBeCloseTo(20_000, 3);
    expect(recorder.getSamples().length).toBeGreaterThan(countAtPause);
    expect(Number(recorder.getSamples()[recorder.getSamples().length - 1].tSongMs)).toBeGreaterThan(
      10_000,
    );

    stop();
  });

  it("rejects passerby hijacks via backgroundLock and recovers immediately when the dancer returns", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const standaloneLock = createBackgroundLock();
    const recorder = createPoseRecorder();
    const canvasSpy = createMockCanvasContext();
    const videoMock = createMockVideo({ liveStream: true });

    const toScored12 = (
      landmarks: ReturnType<typeof makeMediaPipePose>
    ): LandmarkPoint[] =>
      SCORED_LANDMARK_INDICES.map((idx) => ({
        x: landmarks[idx].x,
        y: landmarks[idx].y,
        v: landmarks[idx].visibility ?? 0,
      }));

    const rawFrames: RawPoseLandmarks[] = [];
    const frames: PoseFrame[] = [];
    const onRawFrame = vi.fn((raw: RawPoseLandmarks) => {
      rawFrames.push(raw);
      const frame = toMirroredPoseFrame(raw, "standing");
      frames.push(frame);
      drawSkeleton(canvasSpy.ctx, frame, 1280, 720);
      if (frame.tracking === "ok") {
        recorder.push(frame, songMs(frames.length * 100));
      }
    });
    const stop = startPose(videoMock.video, onRawFrame);

    // Establish dancer at x = 0.25
    const dancerPose = makeMediaPipePose({ centerX: 0.25 });
    expect(standaloneLock.accept(toScored12(dancerPose))).toBe(true);
    mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [dancerPose] });
    videoMock.emitFrame({ nowMs: 1000, mediaTimeSec: 0 });
    expect(onRawFrame).toHaveBeenCalledTimes(1);
    expect(frames[0].tracking).toBe("ok");

    // Inject 5 consecutive passerby frames at x = 0.80 (dx = 0.55 > 0.35)
    // Passerby frames are silently ignored: onRawFrame is never called, no blank frames flash, and One Euro stays clean
    for (let i = 1; i <= 5; i++) {
      canvasSpy.resetCounts();
      const passerby = makeMediaPipePose({ centerX: 0.8 });
      expect(standaloneLock.accept(toScored12(passerby))).toBe(false);

      mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [passerby] });
      videoMock.emitFrame({ nowMs: 1000 + i * 33.33, mediaTimeSec: i * 0.033 });

      expect(onRawFrame).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);
      expect(canvasSpy.clearRectCalls).toHaveLength(0);
      expect(canvasSpy.lines).toHaveLength(0);
      expect(canvasSpy.arcs).toHaveLength(0);
      expect(videoMock.pendingCallbackCount()).toBe(1);
    }
    expect(recorder.getSamples()).toHaveLength(1);

    // Dancer returns at x = 0.28 -> immediately accepted with zero One Euro drift toward x = 0.80
    const returnPose = makeMediaPipePose({ centerX: 0.28 });
    expect(standaloneLock.accept(toScored12(returnPose))).toBe(true);

    canvasSpy.resetCounts();
    mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [returnPose] });
    videoMock.emitFrame({ nowMs: 1200, mediaTimeSec: 0.2 });

    expect(onRawFrame).toHaveBeenCalledTimes(2);
    const rawRecovered = rawFrames[1];
    expect(rawRecovered.landmarks[LM.lShoulder].x).toBeGreaterThanOrEqual(dancerPose[11].x - 1e-6);
    expect(rawRecovered.landmarks[LM.lShoulder].x).toBeLessThanOrEqual(returnPose[11].x + 1e-6);

    const recovered = frames[1];
    expect(recovered.tracking).toBe("ok");
    expect(canvasSpy.lines.length).toBeGreaterThan(0);
    expect(recorder.getSamples()).toHaveLength(2);

    stop();
  });

  it("handles total camera occlusion cleanly without (0, 0) poison or corner artifacts", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const canvasSpy = createMockCanvasContext();
    const videoMock = createMockVideo({ liveStream: true });
    const rawLog: RawPoseLandmarks[] = [];
    const poseLog: PoseFrame[] = [];

    const stop = startPose(videoMock.video, (raw) => {
      rawLog.push(raw);
      const frame = toMirroredPoseFrame(raw, "standing");
      poseLog.push(frame);
      drawSkeleton(canvasSpy.ctx, frame, 1280, 720);
    });

    // Dancer visible at x = 0.60
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.6 })],
    });
    videoMock.emitFrame({ nowMs: 1000, mediaTimeSec: 0 });
    expect(poseLog[0].tracking).toBe("ok");

    // Cover camera for 5 frames (landmarks: [])
    for (let i = 1; i <= 5; i++) {
      canvasSpy.resetCounts();
      mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [] });
      videoMock.emitFrame({ nowMs: 1000 + i * 33.33, mediaTimeSec: i * 0.033 });

      expect(rawLog[i].landmarks.every((pt) => pt.x === 0 && pt.y === 0 && pt.v === 0)).toBe(true);
      expect(poseLog[i].tracking).toBe("uncertain");
      expect(canvasSpy.clearRectCalls).toHaveLength(1);
      expect(canvasSpy.lines).toHaveLength(0);
      expect(canvasSpy.arcs).toHaveLength(0);
      expect(canvasSpy.hasOriginDraw()).toBe(false);
    }

    // Uncover camera with dancer at x = 0.62 -> snaps cleanly, not dragged from (0, 0) and not rejected by lock
    const recoverPose = makeMediaPipePose({ centerX: 0.62 });
    mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [recoverPose] });
    videoMock.emitFrame({ nowMs: 1200, mediaTimeSec: 0.2 });

    const rawRecovered = rawLog[rawLog.length - 1];
    const frameRecovered = poseLog[poseLog.length - 1];
    expect(frameRecovered.tracking).toBe("ok");
    expect(rawRecovered.landmarks[LM.lShoulder].x).toBeCloseTo(recoverPose[11].x, 5);
    expect(canvasSpy.hasOriginDraw()).toBe(false);

    stop();
  });

  it("supports seated mode end-to-end across poseEngine, backgroundLock, poseRecorder, and drawSkeleton", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const recorder = createPoseRecorder();
    const canvasSpy = createMockCanvasContext();
    const videoMock = createMockVideo({ liveStream: true });
    const frames: PoseFrame[] = [];

    const stop = startPose(videoMock.video, (raw) => {
      const frame = toMirroredPoseFrame(raw, "seated");
      assertPoseFrame(frame, "seated");
      frames.push(frame);
      drawSkeleton(canvasSpy.ctx, frame, 640, 360);
      recorder.push(frame, songMs(frames.length * 100));
    });

    // Normal seated frame (centerX = 0.50, hips/knees/ankles v = 0)
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.5, seated: true })],
    });
    videoMock.emitFrame({ nowMs: 1000, mediaTimeSec: 0 });
    expect(frames[0].tracking).toBe("ok");
    // 1 shoulder connector + 4 arm segments * 2 passes = 9 lines; 6 upper joints * 2 arcs = 12 arcs
    expect(canvasSpy.lines).toHaveLength(9);
    expect(canvasSpy.arcs).toHaveLength(12);
    expect(canvasSpy.hasOriginDraw()).toBe(false);

    // Passerby jump > 0.35 while seated is ignored via shoulder-midpoint fallback (neither emitted nor drawn)
    canvasSpy.resetCounts();
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.9, seated: true })],
    });
    videoMock.emitFrame({ nowMs: 1100, mediaTimeSec: 0.1 });
    expect(frames).toHaveLength(1);
    expect(canvasSpy.lines).toHaveLength(0);
    expect(recorder.getSamples()).toHaveLength(1);

    // Seated dancer sways normally (+0.08) -> accepted & recorded with finite normalized coords and zeroed legs
    canvasSpy.resetCounts();
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.58, seated: true })],
    });
    videoMock.emitFrame({ nowMs: 1200, mediaTimeSec: 0.2 });
    expect(frames).toHaveLength(2);
    expect(frames[1].tracking).toBe("ok");

    const recorded = recorder.getSamples()[1];
    assertLandmarks(recorded.points, "seatedRecorded");
    for (const pt of recorded.points) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
    for (let idx = LM.lHip; idx < 12; idx++) {
      expect(recorded.points[idx]).toEqual({ x: 0, y: 0, v: 0 });
    }

    stop();
  });

  it("runs two back-to-back dances cleanly on the same SongPlayer and PoseLandmarker singleton (NFR-11)", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const player = createSongPlayer();
    const recorder = createPoseRecorder();
    const lock = createBackgroundLock();
    const onEndCounts: number[] = [];
    let currentDanceIndex = 0;

    player.onEnd(() => {
      onEndCounts.push(currentDanceIndex);
    });

    // --- Dance #1 (ending on far left x = 0.15) ---
    currentDanceIndex = 1;
    audioMock.setDurationSec(20);
    await player.load(FAKE_DANCE);
    player.start();

    const video1 = createMockVideo({ liveStream: true });
    const stop1 = startPose(video1.video, (raw) => {
      const frame = toMirroredPoseFrame(raw, "standing");
      recorder.push(frame, player.heardSongTimeMs(raw.tFrameMs));
    });

    const dance1Pose = makeMediaPipePose({ centerX: 0.15 });
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [dance1Pose],
    });
    video1.emitFrame({ nowMs: 5000, mediaTimeSec: 0 });
    expect(
      lock.accept(
        SCORED_LANDMARK_INDICES.map((idx) => ({
          x: dance1Pose[idx].x,
          y: dance1Pose[idx].y,
          v: dance1Pose[idx].visibility ?? 0,
        }))
      )
    ).toBe(true);

    audioMock.advanceAudio(20);
    audioMock.triggerNaturalEnd();
    stop1();
    lock.reset();
    recorder.clear();

    // --- Dance #2 (starts at x = 0.85, video clock resets to nowMs = 0) ---
    currentDanceIndex = 2;
    const dance2: Dance = { ...FAKE_DANCE, id: "dance-2", audioUrl: "/dances/dance-2.m4a" };
    audioMock.setDurationSec(30);
    audioMock.setPerfNowMs(0);
    await player.load(dance2);
    player.start();

    const video2 = createMockVideo({ liveStream: true });
    const frames2: PoseFrame[] = [];
    const stop2 = startPose(video2.video, (raw) => {
      const frame = toMirroredPoseFrame(raw, "standing");
      frames2.push(frame);
      recorder.push(frame, player.heardSongTimeMs(raw.tFrameMs));
    });

    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.85 })],
    });
    video2.emitFrame({ nowMs: 0, mediaTimeSec: 0 });

    audioMock.advanceAudio(5);
    mpMocks.detectForVideo.mockReturnValueOnce({
      landmarks: [makeMediaPipePose({ centerX: 0.84 })],
    });
    video2.emitFrame({ nowMs: 5000, mediaTimeSec: 5 });

    audioMock.advanceAudio(25);
    audioMock.triggerNaturalEnd();
    stop2();

    // Assert strictly monotonic detectForVideo timestamps across the two sessions despite nowMs resetting to 0
    const detectTimestamps = mpMocks.detectForVideo.mock.calls.map((c) => c[1] as number);
    expect(detectTimestamps).toHaveLength(3);
    expect(detectTimestamps[0]).toBe(5000);
    expect(detectTimestamps[1]).toBeGreaterThan(detectTimestamps[0]);
    expect(detectTimestamps[2]).toBeGreaterThan(detectTimestamps[1]);

    // Each dance triggered onEnd once, Dance #2 accepted x = 0.85 immediately, and recorder only holds Dance #2 samples
    expect(onEndCounts).toEqual([1, 2]);
    expect(frames2).toHaveLength(2);
    expect(frames2[0].tracking).toBe("ok");
    expect(recorder.getSamples()).toHaveLength(2);
  });
});
