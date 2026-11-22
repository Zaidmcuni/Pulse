/**
 * Owner: Mohamed
 * Purpose: Pure dance session engine: frame scores + heart rate in, one ScoreSample per second,
 *          beat ratings, live HUD numbers and the final SessionResult out. No browser APIs; time comes from arguments.
 * FRs: FR-07, FR-27, FR-28, FR-29, FR-30, FR-31, FR-33, FR-35, FR-37
 */

import type {
  Dance, HeartRateSource, HrReading, LandmarkPoint, MoveRating, PerfTimeMs, PlayerProfile,
  ScoreSample, SessionResult, SongTimeMs,
} from "../types/pulse";
import { perfMs, songMs } from "../types/pulse";
import { CONFIG } from "../config";
import { accuracyLevel, accuracyRamp, beatScore, rateBeat, rollingAccuracy } from "./accuracy";
import { coachMotion, dancerMotion } from "./motion";
import { effortPerSecond, kcalPerMinute, pointsDelta } from "./effort";
import { findBestWindowStartSec } from "../clip/bestWindow";
import { assertSessionResult } from "../contracts/validators";

/** Display-only: the HR badge says "live" when the latest reading is at most this old. */
export const HR_LIVE_SEC = 3;

/** Fixed moderate effort when there's no watch; about the effort of a moderate heart rate. */
export const NO_WATCH_EFFORT = 0.8;

/** False when no second of the result had a watch, so calories are unknown (show "--"). */
export function resultHasHeartRate(result: SessionResult): boolean {
  return result.samples.some((s) => s.hrSource !== "none");
}

export interface BeatRating { index: number; rating: MoveRating }   // index into dance.beatsMs
/** #112: one per emitted second. "still" = the dancer stopped while the coach moves: 0 points, no beat pop-ups. */
export type SessionStatus = "dancing" | "no-player" | "still" | "paused";
/** #112: numbers for the dance screen's debug box (display only). */
export interface HudDebug {
  dancerMotion: number | null; // shoulder widths per second over the last emitted second
  coachMotion: number;         // degrees per second over the same song second
  lastBeatScore: number | null;
  lastBeatRating: MoveRating | null;
}
export interface HudState {
  points: number;            // running total, rounded down to an integer
  accuracyPct: number;       // current per-second accuracy x 100, rounded
  bpm: number | null;        // latest reading's bpm, null if none yet or stale beyond the hold
  hrSource: HeartRateSource; // source of the latest reading; "ble" before any reading; "none" only with no watch
  hrState: "live" | "holding" | "none";
  caloriesKcal: number;      // running total, 1 decimal
  status: SessionStatus;     // #112
  debug: HudDebug;           // #112
}
export interface AdvanceResult { samples: ScoreSample[]; beats: BeatRating[] }

export interface DanceSession {
  addFrameScore(tSongMs: SongTimeMs, score: number | null): void;
  /** #112: the frame's 12 points (pixel aspect = width / height) for still detection. Never called -> still rule off. */
  addPose(tSongMs: SongTimeMs, points: LandmarkPoint[], aspect: number): void;
  addHeartRate(r: HrReading): void;
  advance(tSongMs: SongTimeMs, nowMs: PerfTimeMs): AdvanceResult;
  hud(nowMs: PerfTimeMs): HudState;
  finish(opts: { completed: boolean; id: string; createdAtIso: string }): SessionResult;
  seek(tSongMs: SongTimeMs): void;
  reset(): void;
  setPaused(paused: boolean, nowMs?: PerfTimeMs): void;
  isPracticeMode(): boolean;
  setBaselineHr(bpm: number): void;   // starting heart rate used as restingHr for effort from now on
  setNoWatch(noWatch: boolean): void;  // FR-29: no watch at the start -> points from moves only; kept across reset()
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Poses older than this (song time) are dropped; still detection looks at one second at a time. */
const POSE_KEEP_MS = 2000;

export function createDanceSession(dance: Dance, profile: PlayerProfile): DanceSession {
  const endMs = dance.lengthSec * 1000;
  const frameScores: { tMs: SongTimeMs; score: number | null }[] = [];
  const samples: ScoreSample[] = [];
  let latestHr: HrReading | null = null;
  let lastGoodAccuracy = 0;   // FR-28: held while tracking is uncertain, up to CONFIG.trackingHoldSec (#85)
  let practiceAccuracy = 0;
  let pointsSum = 0;
  let caloriesSum = 0;
  let lastSongMs = -Infinity;
  let lastNowMs = perfMs(0);
  let nextBeat = 0;           // index pointer into dance.beatsMs
  let practiceMode = false;
  let paused = false;
  let pauseAnchorMs: PerfTimeMs | null = null;
  let pendingResumeRebaseline = false;
  let result: SessionResult | null = null;
  let baselineHr: number | null = null; // FR-29: measured starting heart rate; kept across reset()
  let noWatch = false;                  // FR-29: kept across reset()
  // #112 still detection and beat-based accuracy.
  const poses: { tMs: number; points: readonly LandmarkPoint[] }[] = [];
  let poseAspect = 1;
  let posesSeen = false;      // addPose ever called: enables the still rule
  let lowMotionSec = 0;       // consecutive emitted seconds with a still dancer and a moving coach
  let status: SessionStatus = "dancing";
  const beatScores: number[] = [];
  let debug: HudDebug = { dancerMotion: null, coachMotion: 0, lastBeatScore: null, lastBeatRating: null };

  /** FR-07: the latest reading counts only within CONFIG.hrDropHoldSec. */
  function heldReading(nowMs: PerfTimeMs): HrReading | null {
    if (!latestHr) return null;
    return nowMs - latestHr.atMs <= CONFIG.hrDropHoldSec * 1000 ? latestHr : null;
  }

  /** Non-null scores with tMs in (fromMs, toMs] (or [fromMs, toMs) when startInclusive). */
  function scoresIn(fromMs: number, toMs: number, startInclusive: boolean) {
    return frameScores.filter(
      (f): f is { tMs: SongTimeMs; score: number } =>
        f.score !== null &&
        (startInclusive ? f.tMs >= fromMs && f.tMs < toMs : f.tMs > fromMs && f.tMs <= toMs),
    );
  }

  /** #85: true while a confident score is at most CONFIG.trackingHoldSec old (song time, so pauses don't count). */
  function isTracked(tMs: number): boolean {
    return scoresIn(tMs - CONFIG.trackingHoldSec * 1000, tMs, false).length > 0;
  }

  /** #112: status of the song second ending at tMs. Still = dancer below still.dancerMin while the coach moves, holdSec in a row. */
  function secondStatus(tMs: number, tracked: boolean): SessionStatus {
    if (!tracked) {
      lowMotionSec = 0;
      return "no-player";
    }
    if (!posesSeen) return "dancing"; // older callers never feed poses
    const fromMs = tMs - 1000;
    const dancer = dancerMotion(poses.filter((p) => p.tMs > fromMs && p.tMs <= tMs), poseAspect);
    const coach = coachMotion(dance, fromMs, tMs, profile.mode);
    debug = { ...debug, dancerMotion: dancer, coachMotion: coach };
    const low = dancer !== null && dancer < CONFIG.still.dancerMin && coach >= CONFIG.still.coachMin;
    lowMotionSec = low ? lowMotionSec + 1 : 0;
    return lowMotionSec >= CONFIG.still.holdSec ? "still" : "dancing";
  }

  function emitSample(s: number, nowMs: PerfTimeMs): ScoreSample {
    const tMs = s * 1000;
    const window = scoresIn(tMs - CONFIG.accRollingSec * 1000, tMs, false);
    if (window.length > 0) lastGoodAccuracy = rollingAccuracy(window, songMs(tMs));
    const tracked = isTracked(tMs);
    const accuracy = tracked ? lastGoodAccuracy : 0;
    status = secondStatus(tMs, tracked);
    const scoring = status === "dancing"; // #85 no player, #112 still: 0 points

    if (noWatch) {
      // FR-29: no floor, so standing still earns nothing; heart rate, effort and calories are unknown.
      const points = scoring ? CONFIG.pointsScale * NO_WATCH_EFFORT * accuracyRamp(accuracy) : 0;
      pointsSum += points;
      const sample: ScoreSample = { tSec: s, heartRate: 0, hrSource: "none", effort: 0, accuracy, points };
      samples.push(sample);
      return sample;
    }

    const r = heldReading(nowMs);
    const effortProfile = baselineHr === null ? profile : { ...profile, restingHr: baselineHr };
    const effort = r ? effortPerSecond(r.bpm, effortProfile) : 0;
    // Calories use the real profile: Keytel doesn't depend on resting HR.
    const kcal = r ? kcalPerMinute(r.bpm, profile) / 60 : 0;
    caloriesSum += Number.isFinite(kcal) ? kcal : 0;

    const points = scoring ? pointsDelta(effort, accuracy) : 0; // FR-30; #85 nobody tracked, #112 still: nothing
    pointsSum += points;
    const sample: ScoreSample = {
      tSec: s,
      heartRate: r ? r.bpm : 0,
      hrSource: latestHr ? latestHr.source : "ble", // FR-06: a watch dance never says "none"
      effort,
      accuracy,
      points,
    };
    samples.push(sample);
    return sample;
  }

  function applyResumeRebaseline(resumeNow: PerfTimeMs): void {
    if (!pendingResumeRebaseline) return;
    pendingResumeRebaseline = false;
    if (latestHr && pauseAnchorMs !== null) {
      const pauseDeltaMs = Math.max(0, Number(resumeNow) - Number(pauseAnchorMs));
      const shiftedMs = Math.min(Number(resumeNow), Number(latestHr.atMs) + pauseDeltaMs);
      latestHr = { ...latestHr, atMs: perfMs(shiftedMs) };
    }
    pauseAnchorMs = null;
  }

  function advance(tSongMs: SongTimeMs, nowMs: PerfTimeMs): AdvanceResult {
    lastNowMs = nowMs;
    const out: AdvanceResult = { samples: [], beats: [] };
    if (paused) {
      if (pauseAnchorMs === null) pauseAnchorMs = nowMs;
      return out;
    }
    applyResumeRebaseline(nowMs);
    if (tSongMs <= lastSongMs) return out; // song time never goes backwards
    lastSongMs = tSongMs;

    if (practiceMode) {
      const window = scoresIn(Number(tSongMs) - CONFIG.accRollingSec * 1000, Number(tSongMs), false);
      if (window.length > 0) practiceAccuracy = rollingAccuracy(window, tSongMs);
      else if (!isTracked(Number(tSongMs))) practiceAccuracy = 0;
    } else {
      for (let s = samples.length + 1; s <= dance.lengthSec && s * 1000 <= tSongMs; s++) {
        out.samples.push(emitSample(s, nowMs));
      }
    }

    const beats = dance.beatsMs;
    while (nextBeat < beats.length) {
      const beatEnd = nextBeat + 1 < beats.length ? beats[nextBeat + 1] : endMs;
      if (tSongMs < beatEnd) break;
      const scores = scoresIn(beats[nextBeat], beatEnd, true).map((f) => f.score);
      // No pop-up while tracking is lost (encouraging tone), nor while standing still (#112).
      const score = beatScore(scores);
      if (score !== null && status === "still") {
        beatScores.push(0); // #112: a still beat counts 0 in the final accuracy, silently
      } else if (score !== null) {
        const rating = rateBeat(scores); // FR-31
        out.beats.push({ index: nextBeat, rating });
        beatScores.push(score);
        debug = { ...debug, lastBeatScore: score, lastBeatRating: rating };
      }
      nextBeat++;
    }
    return out;
  }

  function hud(nowMs: PerfTimeMs): HudState {
    if (!paused) applyResumeRebaseline(nowMs);
    const effectiveNowMs =
      paused && pauseAnchorMs !== null && latestHr
        ? Math.max(pauseAnchorMs, latestHr.atMs)
        : nowMs;
    const age = latestHr && !noWatch ? effectiveNowMs - latestHr.atMs : Infinity;
    const hrState = age <= HR_LIVE_SEC * 1000 ? "live" : age <= CONFIG.hrDropHoldSec * 1000 ? "holding" : "none";
    const last = samples[samples.length - 1];
    return {
      points: Math.floor(pointsSum),
      accuracyPct: practiceMode ? Math.round(practiceAccuracy * 100) : (last ? Math.round(last.accuracy * 100) : 0),
      bpm: hrState === "none" || !latestHr ? null : latestHr.bpm,
      hrSource: noWatch ? "none" : latestHr ? latestHr.source : "ble",
      hrState,
      caloriesKcal: round1(caloriesSum),
      status: paused ? "paused" : practiceMode ? (isTracked(lastSongMs) ? "dancing" : "no-player") : status,
      debug,
    };
  }

  function finish(opts: { completed: boolean; id: string; createdAtIso: string }): SessionResult {
    if (result) return result;
    if (opts.completed && !practiceMode) advance(songMs(endMs), lastNowMs);

    // #112: mean of the rated beats' scores (still beats count 0), so the results page agrees with the pop-ups.
    const accuracyPct = beatScores.length ? round1((beatScores.reduce((a, b) => a + b, 0) / beatScores.length) * 100) : 0;

    let bestWindowStartSec = 0;
    try {
      bestWindowStartSec = practiceMode ? 0 : findBestWindowStartSec(samples);
    } catch {
      bestWindowStartSec = 0; // Toufic's may still be a stub
    }

    result = {
      id: opts.id,
      playerId: profile.id,
      danceId: dance.id,
      completed: opts.completed,
      totalPoints: opts.completed && !practiceMode ? Math.floor(samples.reduce((a, s) => a + s.points, 0)) : 0, // FR-35
      accuracyPct,
      level: accuracyLevel(accuracyPct),
      durationSec: samples.length,
      caloriesKcal: round1(caloriesSum),
      bestWindowStartSec,
      samples,
      createdAtIso: opts.createdAtIso,
    };
    assertSessionResult(result); // FR-37
    return result;
  }

  function seek(tSongMs: SongTimeMs): void {
    const rawMs = Number.isFinite(tSongMs) ? Number(tSongMs) : 0;
    const clampedMs = songMs(Math.max(0, Math.min(endMs, rawMs)));
    practiceMode = true;
    pointsSum = 0;
    caloriesSum = 0;
    samples.length = 0;
    frameScores.length = 0;
    lastGoodAccuracy = 0;
    practiceAccuracy = 0;
    lastSongMs = clampedMs;
    result = null;
    clearMotion();

    let idx = 0;
    while (idx < dance.beatsMs.length && dance.beatsMs[idx] < clampedMs) {
      idx++;
    }
    nextBeat = idx;
  }

  function reset(): void {
    frameScores.length = 0;
    samples.length = 0;
    lastGoodAccuracy = 0;
    practiceAccuracy = 0;
    pointsSum = 0;
    caloriesSum = 0;
    lastSongMs = -Infinity;
    nextBeat = 0;
    practiceMode = false;
    paused = false;
    pauseAnchorMs = null;
    pendingResumeRebaseline = false;
    result = null;
    clearMotion();
  }

  /** #112: forget poses, the still streak, rated beats and debug numbers (posesSeen stays: the caller still feeds poses). */
  function clearMotion(): void {
    poses.length = 0;
    lowMotionSec = 0;
    status = "dancing";
    beatScores.length = 0;
    debug = { dancerMotion: null, coachMotion: 0, lastBeatScore: null, lastBeatRating: null };
  }

  function setPaused(nextPaused: boolean, nowMs?: PerfTimeMs): void {
    if (nextPaused === paused) return;
    if (nextPaused) {
      paused = true;
      pendingResumeRebaseline = false;
      pauseAnchorMs = nowMs ?? (latestHr && latestHr.atMs > lastNowMs ? latestHr.atMs : lastNowMs);
      return;
    }
    paused = false;
    pendingResumeRebaseline = true;
    if (nowMs !== undefined) {
      lastNowMs = nowMs;
      applyResumeRebaseline(nowMs);
    }
  }

  return {
    addFrameScore(tSongMs, score) {
      if (paused) return;
      frameScores.push({ tMs: tSongMs, score });
    },
    addPose(tSongMs, points, aspect) {
      if (paused) return;
      posesSeen = true;
      poseAspect = aspect;
      poses.push({ tMs: tSongMs, points });
      while (poses.length > 0 && poses[0].tMs < tSongMs - POSE_KEEP_MS) poses.shift();
    },
    addHeartRate(r) {
      latestHr = r;
      if (paused && (pauseAnchorMs === null || r.atMs > pauseAnchorMs)) {
        pauseAnchorMs = r.atMs;
      }
    },
    advance,
    hud,
    finish,
    seek,
    reset,
    setPaused,
    isPracticeMode() { return practiceMode; },
    setBaselineHr(bpm) {
      if (Number.isFinite(bpm) && bpm > 0) baselineHr = bpm;
    },
    setNoWatch(next) { noWatch = next; },
  };
}
