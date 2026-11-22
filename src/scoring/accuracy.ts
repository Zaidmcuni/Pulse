/**
 * Owner: Mohamed
 * Purpose: Frame accuracy against the template, rolling accuracy, beat rating, level (pure functions)
 * FRs: FR-27, FR-28, FR-31
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { AccuracyLevel, Dance, MoveRating, PosturalMode, PoseFrame, SongTimeMs } from "../types/pulse";
import { CONFIG, MODE_SEGMENTS } from "../config";

/** #112: full marks up to CONFIG.fullScoreDeg, then linear down to 0 at CONFIG.toleranceDeg. Seated uses CONFIG.seatedCurve (NFR-08). */
export function segmentScore(angleDeg: number, mode: PosturalMode = "standing"): number {
  const { fullScoreDeg: full, toleranceDeg: tol } = mode === "seated" ? CONFIG.seatedCurve : CONFIG;
  if (angleDeg <= full) return 1;
  return Math.max(0, 1 - (angleDeg - full) / (tol - full));
}

/** Best template frame for f in the match window: its score and song time, or null (uncertain / nothing to compare). */
function bestMatch(f: PoseFrame, tSongMs: SongTimeMs, dance: Dance, mode: PosturalMode): { score: number; tMs: number } | null {
  if (f.tracking === "uncertain") return null; // FR-28
  const start = tSongMs - CONFIG.matchWindowMs.before;
  const end = tSongMs + CONFIG.matchWindowMs.after;
  const frames = dance.frames;
  const segments = MODE_SEGMENTS[mode];
  const minShared = Math.ceil(segments.length * CONFIG.uncertainUsableRatio);

  // Binary search: first frame with tMs >= start (frames are sorted, ~5,000 per song, runs at 30 fps).
  let lo = 0, hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tMs < start) lo = mid + 1; else hi = mid;
  }

  let best: { sum: number; tMs: number } | null = null;
  let maxShared = 0;
  for (let i = lo; i < frames.length && frames[i].tMs <= end; i++) {
    const tpl = frames[i].segments;
    let sum = 0, n = 0;
    for (const id of segments) {
      const a = f.segments[id], b = tpl[id];
      if (!a || !b) continue;
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1])); // clamp: float dot can exceed 1
      sum += segmentScore((Math.acos(dot) * 180) / Math.PI, mode);
      n++;
    }
    if (n < minShared) continue; // A sparse template can otherwise win on one matching limb.
    maxShared = Math.max(maxShared, n);
    if (best === null || sum > best.sum) best = { sum, tMs: frames[i].tMs };
  }
  // Use one denominator per window so an incomplete template cannot win by
  // omitting errors. Segments missing from the whole window still cost nothing.
  return best === null ? null : { score: best.sum / maxShared, tMs: best.tMs };
}

/**
 * Compares f.segments (mirrored, live) with dance.frames in [tSongMs - before, tSongMs + after] (CONFIG.matchWindowMs),
 * only on MODE_SEGMENTS[mode] present in both. Best sum of segment scores wins,
 * normalized by the largest shared segment count in the window.
 * Returns 0..1, or null when tracking is uncertain or no candidate shares enough segments.
 */
export function scoreFrame(f: PoseFrame, tSongMs: SongTimeMs, dance: Dance, mode: PosturalMode): number | null {
  return bestMatch(f, tSongMs, dance, mode)?.score ?? null;
}

/** Debug only (#112): template time of the best match minus tSongMs, inside [-before, +after]; null like scoreFrame. */
export function bestMatchOffsetMs(f: PoseFrame, tSongMs: SongTimeMs, dance: Dance, mode: PosturalMode): number | null {
  const m = bestMatch(f, tSongMs, dance, mode);
  return m ? m.tMs - tSongMs : null;
}

/** Mean of scores with tMs in (nowMs - CONFIG.accRollingSec, nowMs]. 0 when empty. */
export function rollingAccuracy(history: { tMs: SongTimeMs; score: number }[], nowMs: SongTimeMs): number {
  const fromMs = nowMs - CONFIG.accRollingSec * 1000;
  let sum = 0, n = 0;
  for (const h of history) {
    if (h.tMs > fromMs && h.tMs <= nowMs) { sum += h.score; n++; }
  }
  return n === 0 ? 0 : sum / n;
}

/** #112: mean of the best half (ceil(n / 2)) of a beat's frame scores, so transition frames don't drag it down. null when empty. */
export function beatScore(frameScores: number[]): number | null {
  if (frameScores.length === 0) return null;
  const best = [...frameScores].sort((a, b) => b - a).slice(0, Math.ceil(frameScores.length / 2));
  return best.reduce((s, x) => s + x, 0) / best.length;
}

/** beatScore of one beat -> CONFIG.rating thresholds. Empty -> "miss". */
export function rateBeat(frameScores: number[]): MoveRating {
  const score = beatScore(frameScores);
  if (score === null) return "miss";
  if (score >= CONFIG.rating.perfect) return "perfect";
  if (score >= CONFIG.rating.good) return "good";
  if (score >= CONFIG.rating.ok) return "ok";
  return "miss";
}

/** #112: accuracy part of points: 0 at CONFIG.pointsAccRamp.from or below, 1 at .to or above, linear in between. */
export function accuracyRamp(acc: number): number {
  const { from, to } = CONFIG.pointsAccRamp;
  return Math.min(1, Math.max(0, (acc - from) / (to - from)));
}

/** pct 0..100 -> CONFIG.level thresholds. */
export function accuracyLevel(pct: number): AccuracyLevel {
  if (pct >= CONFIG.level.superstar) return "superstar";
  if (pct >= CONFIG.level.gold) return "gold";
  if (pct >= CONFIG.level.silver) return "silver";
  return "bronze";
}
