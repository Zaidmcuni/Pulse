/**
 * Owner: Mohamed
 * Purpose: Pure dance session engine: frame scores + heart rate in, one ScoreSample per second,
 *          beat ratings, live HUD numbers and the final SessionResult out. No browser APIs; time comes from arguments.
 * FRs: FR-07, FR-28, FR-30, FR-31, FR-35, FR-37
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
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function createDanceSession(dance: Dance, profile: PlayerProfile): DanceSession {
  const endMs = dance.lengthSec * 1000;
  const frameScores: { tMs: SongTimeMs; score: number | null }[] = [];
  const samples: ScoreSample[] = [];
  let latestHr: HrReading | null = null;
  let lastGoodAccuracy = 0;   // FR-28: held while tracking is uncertain
  let pointsSum = 0;
  let caloriesSum = 0;
  let lastSongMs = -Infinity;
  let lastNowMs = perfMs(0);
  let nextBeat = 0;           // index pointer into dance.beatsMs
  let result: SessionResult | null = null;

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
    const effort = r ? effortPerSecond(r.bpm, profile) : 0;
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

  function advance(tSongMs: SongTimeMs, nowMs: PerfTimeMs): AdvanceResult {
    lastNowMs = nowMs;
    const out: AdvanceResult = { samples: [], beats: [] };
    if (tSongMs <= lastSongMs) return out; // song time never goes backwards
    lastSongMs = tSongMs;

    for (let s = samples.length + 1; s <= dance.lengthSec && s * 1000 <= tSongMs; s++) {
      out.samples.push(emitSample(s, nowMs));
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
    const age = latestHr ? nowMs - latestHr.atMs : Infinity;
    const hrState = age <= HR_LIVE_SEC * 1000 ? "live" : age <= CONFIG.hrDropHoldSec * 1000 ? "holding" : "none";
    const last = samples[samples.length - 1];
    return {
      points: Math.floor(pointsSum),
      accuracyPct: last ? Math.round(last.accuracy * 100) : 0,
      bpm: hrState === "none" || !latestHr ? null : latestHr.bpm,
      hrSource: latestHr ? latestHr.source : "simulated",
      hrState,
      caloriesKcal: round1(caloriesSum),
    };
  }

  function finish(opts: { completed: boolean; id: string; createdAtIso: string }): SessionResult {
    if (result) return result;
    if (opts.completed) advance(songMs(endMs), lastNowMs);

    const good = frameScores.filter((f) => f.score !== null).map((f) => f.score as number);
    const accuracyPct = good.length ? round1((good.reduce((a, b) => a + b, 0) / good.length) * 100) : 0;

    let bestWindowStartSec = 0;
    try {
      bestWindowStartSec = findBestWindowStartSec(samples);
    } catch {
      bestWindowStartSec = 0; // Toufic's may still be a stub
    }

    result = {
      id: opts.id,
      playerId: profile.id,
      danceId: dance.id,
      completed: opts.completed,
      totalPoints: opts.completed ? Math.floor(samples.reduce((a, s) => a + s.points, 0)) : 0, // FR-35
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

  return {
    addFrameScore(tSongMs, score) { frameScores.push({ tMs: tSongMs, score }); },
    addHeartRate(r) { latestHr = r; },
    advance,
    hud,
    finish,
  };
}
