/**
 * Owner: Zaid
 * Purpose: Integration tests for GetReady framing helpers, SkeletonOverlay pixel mirroring alignment, and SSR smoke check
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LM } from "../../config";
import { classifyCameraError, getFramingGuidance } from "../../screens/dance/GetReady";
import { SkeletonOverlay, drawSkeleton } from "../../vision/SkeletonOverlay";
import type { PoseFrame } from "../../types/pulse";
import {
  createMockCanvasContext,
  createMockVideo,
  makeMediaPipePose,
  toMirroredPoseFrame,
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

describe("GetReady + SkeletonOverlay + poseEngine integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mpMocks.forVisionTasks.mockResolvedValue({ wasmLoaderPath: "/wasm" });
    mpMocks.createFromOptions.mockResolvedValue({ detectForVideo: mpMocks.detectForVideo });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aligns mirrored PoseFrame bones on the exact expected canvas pixel side without double-mirroring", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    // Dancer's own RIGHT arm raised high (MP 16 is at raw camera x = 0.28 -> left side of raw camera)
    const asymmetricPose = makeMediaPipePose({
      centerX: 0.5,
      shoulderWidth: 0.2,
      asymmetricRightArmHigh: true,
    });
    const rawRightWristX = asymmetricPose[16].x;
    expect(rawRightWristX).toBeLessThan(0.5);

    mpMocks.detectForVideo.mockReturnValueOnce({ landmarks: [asymmetricPose] });
    const videoMock = createMockVideo({ width: 1280, height: 720, readyState: 4 });
    let capturedFrame: PoseFrame | null = null;

    const stop = startPose(videoMock.video, (raw) => {
      capturedFrame = toMirroredPoseFrame(raw, "standing");
    });
    videoMock.emitFrame({ nowMs: 1000, mediaTimeSec: 0 });
    stop();

    expect(capturedFrame).not.toBeNull();
    const frame = capturedFrame!;
    // After computePoseFrame mirroring: x -> 1 - x and rWrist swaps to index LM.lWrist (0) / LM.rWrist (5)
    // Raw right wrist (MP 16) swaps into mirrored lWrist (index 4) at x = 1 - rawRightWristX (> 0.5)
    const mirroredWristX = frame.points[LM.lWrist].x;
    expect(mirroredWristX).toBeCloseTo(1 - rawRightWristX, 5);

    const canvasSpy = createMockCanvasContext();
    drawSkeleton(canvasSpy.ctx, frame, 1280, 720);

    const expectedPixelX = (1 - rawRightWristX) * 1280;
    const wrongDoubleMirroredX = rawRightWristX * 1280;

    expect(
      canvasSpy.lines.some((l) => Math.abs(l.x2 - expectedPixelX) < 1e-3),
    ).toBe(true);
    expect(
      canvasSpy.lines.some((l) => Math.abs(l.x2 - wrongDoubleMirroredX) < 1e-3),
    ).toBe(false);
  });

  it("provides encouraging mode-aware framing guidance and specific camera error instructions", () => {
    const standingOk: PoseFrame = toMirroredPoseFrame(
      {
        tFrameMs: 1000 as PoseFrame["tFrameMs"],
        mediaTimeSec: 0,
        width: 1280,
        height: 720,
        landmarks: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((idx) => {
          const p = makeMediaPipePose()[idx];
          return { x: p.x, y: p.y, v: p.visibility ?? 0.9 };
        }),
      },
      "standing",
    );

    const standingUncertain: PoseFrame = { ...standingOk, tracking: "uncertain", usableRatio: 0.2 };
    const seatedOk = toMirroredPoseFrame(
      {
        tFrameMs: 1000 as PoseFrame["tFrameMs"],
        mediaTimeSec: 0,
        width: 1280,
        height: 720,
        landmarks: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((idx) => {
          const p = makeMediaPipePose({ seated: true })[idx];
          return { x: p.x, y: p.y, v: p.visibility ?? 0 };
        }),
      },
      "seated",
    );

    expect(getFramingGuidance("standing", null)).toEqual({
      guideLabel: "Step back so your full body fits inside the frame.",
      statusText: "Step into the guide so the camera can see you",
      inFrame: false,
    });
    expect(getFramingGuidance("standing", standingUncertain).inFrame).toBe(false);
    expect(getFramingGuidance("standing", standingOk)).toEqual({
      guideLabel: "Step back so your full body fits inside the frame.",
      statusText: "You're in frame — ready to dance!",
      inFrame: true,
    });

    const seatedRes = getFramingGuidance("seated", seatedOk);
    expect(seatedRes.inFrame).toBe(true);
    expect(seatedRes.guideLabel).toContain("your legs don't need to be visible");

    expect(classifyCameraError({ name: "NotAllowedError" }).guidance).toContain("address bar");
    expect(classifyCameraError({ name: "NotFoundError" }).title.toLowerCase()).toContain("no camera");
    expect(classifyCameraError({ name: "NotReadableError" }).title.toLowerCase()).toContain("in use");
    expect(classifyCameraError({ name: "InsecureContextError" }).guidance).toContain("localhost");
  });

  it("renders <SkeletonOverlay> via SSR with both live and occluded pipeline frames", async () => {
    const { initPoseLandmarker, startPose } = await import("../../vision/poseEngine");
    await initPoseLandmarker();

    const videoMock = createMockVideo();
    const frames: PoseFrame[] = [];
    const stop = startPose(videoMock.video, (raw) => {
      frames.push(toMirroredPoseFrame(raw, "standing"));
    });

    mpMocks.detectForVideo
      .mockReturnValueOnce({ landmarks: [makeMediaPipePose()] })
      .mockReturnValueOnce({ landmarks: [] });

    videoMock.emitFrame({ nowMs: 1000, mediaTimeSec: 0 });
    videoMock.emitFrame({ nowMs: 1033, mediaTimeSec: 0.033 });
    stop();

    const activeHtml = renderToStaticMarkup(
      <SkeletonOverlay frame={frames[0]} width={1280} height={720} />,
    );
    const occludedHtml = renderToStaticMarkup(
      <SkeletonOverlay frame={frames[1]} width={1280} height={720} />,
    );

    expect(activeHtml).toContain("<canvas");
    expect(activeHtml).toContain('aria-hidden="true"');
    expect(occludedHtml).toContain("<canvas");
    expect(occludedHtml).toContain('aria-hidden="true"');
  });
});
