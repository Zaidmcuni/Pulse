/**
 * Owner: Mohamed
 * Purpose: Frame accuracy against the template, rolling accuracy, beat rating, level (pure functions)
 * FRs: FR-27, FR-28, FR-31
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { AccuracyLevel, Dance, MoveRating, PosturalMode, PoseFrame, SongTimeMs } from "../types/pulse";
import { CONFIG, MODE_SEGMENTS } from "../config";

/**
 * Compares f.segments (mirrored, live) with dance.frames in [tSongMs - before, tSongMs + after] (CONFIG.matchWindowMs),
 * only on MODE_SEGMENTS[mode] present in both; segment score = max(0, 1 - angleDeg / CONFIG.toleranceDeg); best frame wins.
 * Returns 0..1, or null when f.tracking === "uncertain" or no frame is in the window.
 */
export function scoreFrame(f: PoseFrame, tSongMs: SongTimeMs, dance: Dance, mode: PosturalMode): number | null {
  if (f.tracking === "uncertain") return null; // FR-28
  const start = tSongMs - CONFIG.matchWindowMs.before;
  const end = tSongMs + CONFIG.matchWindowMs.after;
  const frames = dance.frames;

  // Binary search: first frame with tMs >= start (frames are sorted, ~5,000 per song, runs at 30 fps).
  let lo = 0, hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tMs < start) lo = mid + 1; else hi = mid;
  }

  let best: number | null = null;
  for (let i = lo; i < frames.length && frames[i].tMs <= end; i++) {
    const tpl = frames[i].segments;
    let sum = 0, n = 0;
    for (const id of MODE_SEGMENTS[mode]) {
      const a = f.segments[id], b = tpl[id];
      if (!a || !b) continue;
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1])); // clamp: float dot can exceed 1
      const angleDeg = (Math.acos(dot) * 180) / Math.PI;
      sum += Math.max(0, 1 - angleDeg / CONFIG.toleranceDeg);
      n++;
    }
    if (n === 0) continue; // no shared segment: skip this template frame
    const score = sum / n;
    if (best === null || score > best) best = score;
  }
  return best;
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

/** Average of the frame scores of one beat -> CONFIG.rating thresholds. Empty -> "miss". */
export function rateBeat(frameScores: number[]): MoveRating {
  if (frameScores.length === 0) return "miss";
  const avg = frameScores.reduce((s, x) => s + x, 0) / frameScores.length;
  if (avg >= CONFIG.rating.perfect) return "perfect";
  if (avg >= CONFIG.rating.good) return "good";
  if (avg >= CONFIG.rating.ok) return "ok";
  return "miss";
}

/** pct 0..100 -> CONFIG.level thresholds. */
export function accuracyLevel(pct: number): AccuracyLevel {
  if (pct >= CONFIG.level.superstar) return "superstar";
  if (pct >= CONFIG.level.gold) return "gold";
  if (pct >= CONFIG.level.silver) return "silver";
  return "bronze";
}
