/**
 * Owner: Toufic
 * Purpose: #87 offline scoring check (dev only, never shipped in a screen). Plays a pose source through the real
 *          live path (computePoseFrame -> scoreFrame -> createDanceSession) at song times, so the team can see how
 *          a perfect follower, a late follower, the wrong dance, a still body and an empty frame score.
 * FRs: FR-27, FR-28, NFR-08
 */

import type { Dance, LandmarkPoint, MoveRating, PlayerProfile, PosturalMode, PoseFrame, SongTimeMs } from "../../types/pulse";
import { perfMs, songMs } from "../../types/pulse";
import { LM_MIRROR } from "../../config";
import { computePoseFrame } from "../../vision/segments";
import { scoreFrame } from "../../scoring/accuracy";
import { createDanceSession } from "../../scoring/session";

/** Landmarks of the source video (12 scored points, unmirrored), one per frame; null = no person. */
export interface SourcePoses {
  width: number;
  height: number;
  frameMs: number;
  frames: (LandmarkPoint[] | null)[];
}

/** What the webcam would show at song time t, or null for an empty frame. Unmirrored camera image. */
export type CameraPose = (tSongMs: number) => LandmarkPoint[] | null;

export interface CheckResult {
  accuracyPct: number;       // SessionResult.accuracyPct (mean of beat scores, #112)
  level: string;
  totalPoints: number;
  meanLiveAccuracyPct: number; // mean of the per-second ScoreSample.accuracy the HUD shows
  nullFramePct: number;      // frames scoreFrame returned null for
  beats: Record<MoveRating | "none", number>; // "none" = beat with no score, so no pop-up
}

const EMPTY: LandmarkPoint[] = Array.from({ length: 12 }, () => ({ x: 0, y: 0, v: 0 }));

/**
 * A dancer who copies the coach like a mirror shows the source pose mirrored to the (unmirrored) webcam:
 * x -> 1 - x with left/right swapped. computePoseFrame mirrors it back, so the live segments match the template.
 */
export function mirrorForCamera(points: LandmarkPoint[]): LandmarkPoint[] {
  return LM_MIRROR.map((i) => ({ x: 1 - points[i].x, y: points[i].y, v: points[i].v }));
}

/** The source pose at time t (nearest earlier frame), as a mirror follower shows it. lagMs > 0 = the follower is late. */
export function follower(src: SourcePoses, lagMs = 0): CameraPose {
  return (t) => {
    const i = Math.floor((t - lagMs) / src.frameMs + 1e-6);
    const p = i >= 0 && i < src.frames.length ? src.frames[i] : null;
    return p ? mirrorForCamera(p) : null;
  };
}

export const stillPose = (points: LandmarkPoint[]): CameraPose => () => points;
export const emptyFrame: CameraPose = () => null;

/** Standing still, arms hanging, facing the camera (dancer's left on the image right). */
export const STANDING_STILL: LandmarkPoint[] = [
  { x: 0.54, y: 0.30, v: 1 }, { x: 0.46, y: 0.30, v: 1 }, // shoulders
  { x: 0.55, y: 0.42, v: 1 }, { x: 0.45, y: 0.42, v: 1 }, // elbows
  { x: 0.55, y: 0.53, v: 1 }, { x: 0.45, y: 0.53, v: 1 }, // wrists
  { x: 0.525, y: 0.55, v: 1 }, { x: 0.475, y: 0.55, v: 1 }, // hips
  { x: 0.525, y: 0.72, v: 1 }, { x: 0.475, y: 0.72, v: 1 }, // knees
  { x: 0.525, y: 0.90, v: 1 }, { x: 0.475, y: 0.90, v: 1 }, // ankles
];

/**
 * Runs one whole song like DancePlay: a camera frame every frameMs of song time (scored with scoreFrame), one
 * simulated heart-rate reading per second, session.advance after each frame, then finish({ completed: true }).
 */
export function runScoringCheck(
  dance: Dance, camera: CameraPose, opts: { mode: PosturalMode; profile: PlayerProfile; hrBpm: number; width: number; height: number; frameMs: number },
): CheckResult {
  const session = createDanceSession(dance, opts.profile);
  const beats: CheckResult["beats"] = { perfect: 0, good: 0, ok: 0, miss: 0, none: 0 };
  const endMs = dance.lengthSec * 1000;
  let frames = 0, nulls = 0, nextHrSec = 0;

  for (let i = 0; i * opts.frameMs <= endMs; i++) {
    const t: SongTimeMs = songMs(i * opts.frameMs);
    if (t >= nextHrSec * 1000) {
      session.addHeartRate({ bpm: opts.hrBpm, source: "simulated", atMs: perfMs(t) });
      nextHrSec++;
    }
    const frame: PoseFrame = computePoseFrame(
      { tFrameMs: perfMs(t), mediaTimeSec: t / 1000, width: opts.width, height: opts.height, landmarks: camera(t) ?? EMPTY },
      opts.mode,
    );
    const score = scoreFrame(frame, t, dance, opts.mode);
    frames++;
    if (score === null) nulls++;
    session.addFrameScore(t, score);
    session.addPose(t, camera(t) ?? EMPTY, opts.width / opts.height);
    for (const b of session.advance(t, perfMs(t)).beats) beats[b.rating]++;
  }

  const result = session.finish({ completed: true, id: "scoring-check", createdAtIso: "2026-11-22T00:00:00.000Z" });
  const rated = beats.perfect + beats.good + beats.ok + beats.miss;
  beats.none = dance.beatsMs.length - rated;
  const live = result.samples.reduce((s, x) => s + x.accuracy, 0) / Math.max(1, result.samples.length);
  return {
    accuracyPct: result.accuracyPct,
    level: result.level,
    totalPoints: result.totalPoints,
    meanLiveAccuracyPct: Math.round(live * 1000) / 10,
    nullFramePct: Math.round((nulls / frames) * 1000) / 10,
    beats,
  };
}
