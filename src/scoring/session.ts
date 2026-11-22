/**
 * Owner: Mohamed
 * Purpose: Pure dance session engine: frame scores + heart rate in, one ScoreSample per second,
 *          beat ratings, live HUD numbers and the final SessionResult out. No browser APIs; time comes from arguments.
 * FRs: FR-07, FR-28, FR-29, FR-30, FR-31, FR-35, FR-37
 */

import type {
  Dance, HeartRateSource, HrReading, MoveRating, PerfTimeMs, PlayerProfile,
  ScoreSample, SessionResult, SongTimeMs,
} from "../types/pulse";
import { perfMs, songMs } from "../types/pulse";
import { CONFIG } from "../config";
import { accuracyLevel, rateBeat, rollingAccuracy } from "./accuracy";
import { effortPerSecond, kcalPerMinute, pointsDelta } from "./effort";
import { findBestWindowStartSec } from "../clip/bestWindow";
import { assertSessionResult } from "../contracts/validators";

/** Display-only: the HR badge says "live" when the latest reading is at most this old. */
export const HR_LIVE_SEC = 3;

export interface BeatRating { index: number; rating: MoveRating }   // index into dance.beatsMs
export interface HudState {
  points: number;            // running total, rounded down to an integer
  accuracyPct: number;       // current per-second accuracy x 100, rounded
  bpm: number | null;        // latest reading's bpm, null if none yet or stale beyond the hold
  hrSource: HeartRateSource; // source of the latest reading; "simulated" before any reading
  hrState: "live" | "holding" | "none";
  caloriesKcal: number;      // running total, 1 decimal
}
export interface AdvanceResult { samples: ScoreSample[]; beats: BeatRating[] }

export interface DanceSession {
  addFrameScore(tSongMs: SongTimeMs, score: number | null): void;
  addHeartRate(r: HrReading): void;
  advance(tSongMs: SongTimeMs, nowMs: PerfTimeMs): AdvanceResult;
  hud(nowMs: PerfTimeMs): HudState;
  finish(opts: { completed: boolean; id: string; createdAtIso: string }): SessionResult;
  seek(tSongMs: SongTimeMs): void;
  reset(): void;
  setPaused(paused: boolean, nowMs?: PerfTimeMs): void;
  isPracticeMode(): boolean;
  setBaselineHr(bpm: number): void;   // starting heart rate used as restingHr for effort from now on
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function createDanceSession(dance: Dance, profile: PlayerProfile): DanceSession {
  const endMs = dance.lengthSec * 1000;
  const frameScores: { tMs: SongTimeMs; score: number | null }[] = [];
  const samples: ScoreSample[] = [];
  let latestHr: HrReading | null = null;
  let lastGoodAccuracy = 0;   // FR-28: held while tracking is uncertain
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

  function emitSample(s: number, nowMs: PerfTimeMs): ScoreSample {
    const tMs = s * 1000;
    const window = scoresIn(tMs - CONFIG.accRollingSec * 1000, tMs, false);
    if (window.length > 0) lastGoodAccuracy = rollingAccuracy(window, songMs(tMs));
    const accuracy = lastGoodAccuracy;

    const r = heldReading(nowMs);
    const effortProfile = baselineHr === null ? profile : { ...profile, restingHr: baselineHr };
    const effort = r ? effortPerSecond(r.bpm, effortProfile) : 0;
    // Calories use the real profile: Keytel doesn't depend on resting HR.
    const kcal = r ? kcalPerMinute(r.bpm, profile) / 60 : 0;
    caloriesSum += Number.isFinite(kcal) ? kcal : 0;

    const points = pointsDelta(effort, accuracy); // FR-30
    pointsSum += points;
    const sample: ScoreSample = {
      tSec: s,
      heartRate: r ? r.bpm : 0,
      hrSource: latestHr ? latestHr.source : "simulated",
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
      // No pop-up while tracking is lost (encouraging tone).
      if (scores.length > 0) out.beats.push({ index: nextBeat, rating: rateBeat(scores) }); // FR-31
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
    const age = latestHr ? effectiveNowMs - latestHr.atMs : Infinity;
    const hrState = age <= HR_LIVE_SEC * 1000 ? "live" : age <= CONFIG.hrDropHoldSec * 1000 ? "holding" : "none";
    const last = samples[samples.length - 1];
    return {
      points: Math.floor(pointsSum),
      accuracyPct: practiceMode ? Math.round(practiceAccuracy * 100) : (last ? Math.round(last.accuracy * 100) : 0),
      bpm: hrState === "none" || !latestHr ? null : latestHr.bpm,
      hrSource: latestHr ? latestHr.source : "simulated",
      hrState,
      caloriesKcal: round1(caloriesSum),
    };
  }

  function finish(opts: { completed: boolean; id: string; createdAtIso: string }): SessionResult {
    if (result) return result;
    if (opts.completed && !practiceMode) advance(songMs(endMs), lastNowMs);

    const good = frameScores.filter((f) => f.score !== null).map((f) => f.score as number);
    const accuracyPct = good.length ? round1((good.reduce((a, b) => a + b, 0) / good.length) * 100) : 0;

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
  };
}
