/**
 * Owner: Toufic
 * Purpose: unit tests for segments.ts. Contract goldens live in src/contracts/contracts.test.ts.
 */
import { expect, it } from "vitest";
import { CONFIG, LM } from "../config";
import { assertPoseFrame } from "../contracts/validators";
import { GOLDEN_RAW } from "../mocks/fixtures";
import { computePoseFrame } from "./segments";

it("mirrors points without mutating the raw frame and accepts the visibility cutoff", () => {
  const landmarks = GOLDEN_RAW.landmarks.map((point, index) => ({
    ...point,
    v: index === LM.lWrist ? CONFIG.visibilityMin : point.v,
  }));
  const wrist = { ...landmarks[LM.lWrist] };
  const frame = computePoseFrame({ ...GOLDEN_RAW, landmarks }, "standing");

  assertPoseFrame(frame, "standing");
  expect(frame.points[LM.rWrist]).toEqual({ ...wrist, x: 1 - wrist.x });
  expect(landmarks[LM.lWrist]).toEqual(wrist);
  expect(frame.tFrameMs).toBe(GOLDEN_RAW.tFrameMs);
  expect(frame.segments.r_forearm).toBeDefined();
});

it("omits coincident segments and the torso when any endpoint landmark is hidden", () => {
  const landmarks = GOLDEN_RAW.landmarks.map((point) => ({ ...point }));
  landmarks[LM.lWrist] = { ...landmarks[LM.lElbow] };
  landmarks[LM.lHip].v = 0;
  const frame = computePoseFrame({ ...GOLDEN_RAW, landmarks }, "seated");

  assertPoseFrame(frame, "seated");
  expect(frame.segments.r_forearm).toBeUndefined();
  expect(frame.segments.torso).toBeUndefined();
  expect(frame.usableRatio).toBe(3 / 5);
  expect(frame.tracking).toBe("ok");
});

it("reports knees and ankles as not visible in seated mode, and keeps every other point (FR-20)", () => {
  const seated = computePoseFrame(GOLDEN_RAW, "seated");
  const standing = computePoseFrame(GOLDEN_RAW, "standing");
  assertPoseFrame(seated, "seated");
  for (const i of [LM.lKnee, LM.rKnee, LM.lAnkle, LM.rAnkle]) {
    expect(seated.points[i].v).toBe(0);
    expect(seated.points[i].x).toBe(standing.points[i].x);
    expect(standing.points[i].v).toBeGreaterThanOrEqual(CONFIG.visibilityMin);
  }
  for (const i of [LM.lShoulder, LM.rShoulder, LM.lElbow, LM.rElbow, LM.lWrist, LM.rWrist, LM.lHip, LM.rHip]) {
    expect(seated.points[i]).toEqual(standing.points[i]);
  }
  expect(GOLDEN_RAW.landmarks[LM.lKnee].v).toBeGreaterThan(0); // input untouched
});
