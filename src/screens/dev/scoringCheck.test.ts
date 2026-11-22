/**
 * Owner: Toufic
 * Purpose: unit tests for the #87 scoring check runner (bundled data only; the Heavy table is scoringCheck.heavy.test.ts).
 * FRs: FR-27, FR-28
 */

import { describe, expect, it } from "vitest";
import type { Dance, LandmarkPoint, PlayerProfile } from "../../types/pulse";
import { parseDance } from "../../contracts/validators";
import { GOLDEN_RAW } from "../../mocks/fixtures";
import { computePoseFrame, extractSegments } from "../../vision/segments";
import { emptyFrame, follower, mirrorForCamera, runScoringCheck, STANDING_STILL, stillPose, type SourcePoses } from "./scoringCheck";
import d4 from "../../../public/dances/dance4.json";

const TIP_TOE: Dance = parseDance(d4);
const PROFILE: PlayerProfile = {
  id: "check", handle: "check", displayName: "Check", age: 25, sex: "other", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};
const OPTS = { mode: "standing" as const, profile: PROFILE, hrBpm: 140, width: 1280, height: 720, frameMs: 1001 / 24 };

describe("scoring check runner (#87)", () => {
  it("a mirror follower's live segments equal the source's unmirrored segments", () => {
    const cam = { ...GOLDEN_RAW, landmarks: mirrorForCamera(GOLDEN_RAW.landmarks) };
    const live = computePoseFrame(cam, "standing").segments;
    const source = extractSegments(GOLDEN_RAW.landmarks, GOLDEN_RAW.width, GOLDEN_RAW.height, { mirror: false, mode: "standing" });
    expect(Object.keys(live).sort()).toEqual(Object.keys(source).sort());
    for (const [id, v] of Object.entries(source)) {
      expect(live[id as keyof typeof live]![0]).toBeCloseTo(v[0], 9);
      expect(live[id as keyof typeof live]![1]).toBeCloseTo(v[1], 9);
    }
  });

  it("follower(lagMs) shows the source frame from lagMs earlier, and nothing outside the video", () => {
    const a: LandmarkPoint[] = STANDING_STILL.map((p) => ({ ...p, x: 0.2 }));
    const src: SourcePoses = { width: 1280, height: 720, frameMs: 100, frames: [a, STANDING_STILL, null] };
    expect(follower(src)(150)).toEqual(mirrorForCamera(STANDING_STILL));
    expect(follower(src, 100)(150)).toEqual(mirrorForCamera(a));
    expect(follower(src)(250)).toBeNull();
    expect(follower(src, 500)(150)).toBeNull();
  });

  it("an empty frame has 0 accuracy and no beat pop-ups", () => {
    const r = runScoringCheck(TIP_TOE, emptyFrame, OPTS);
    expect(r.accuracyPct).toBe(0);
    expect(r.nullFramePct).toBe(100);
    expect(r.beats.none).toBe(TIP_TOE.beatsMs.length);
  });

  it("standing still on Tip Toe stays below silver", () => {
    const r = runScoringCheck(TIP_TOE, stillPose(STANDING_STILL), OPTS);
    expect(r.nullFramePct).toBe(0);
    expect(r.level).toBe("bronze");
  });
});
