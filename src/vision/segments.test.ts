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
