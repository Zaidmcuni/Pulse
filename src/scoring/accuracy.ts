/**
 * Owner: Mohamed
 * Purpose: Frame accuracy against the template, rolling accuracy, beat rating, level (pure functions)
 * FRs: FR-27, FR-28, FR-31
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { AccuracyLevel, Dance, MoveRating, PosturalMode, PoseFrame, SongTimeMs } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

/**
 * Compares f.segments (mirrored, live) with dance.frames in [tSongMs - before, tSongMs + after] (CONFIG.matchWindowMs),
 * only on MODE_SEGMENTS[mode] present in both; segment score = max(0, 1 - angleDeg / CONFIG.toleranceDeg); best frame wins.
 * Returns 0..1, or null when f.tracking === "uncertain" or no frame is in the window.
 */
export function scoreFrame(f: PoseFrame, tSongMs: SongTimeMs, dance: Dance, mode: PosturalMode): number | null {
  void f; void tSongMs; void dance; void mode;
  return todo("scoreFrame");
}

/** Mean of scores with tMs in (nowMs - CONFIG.accRollingSec, nowMs]. 0 when empty. */
export function rollingAccuracy(history: { tMs: SongTimeMs; score: number }[], nowMs: SongTimeMs): number {
  void history; void nowMs;
  return todo("rollingAccuracy");
}

/** Average of the frame scores of one beat -> CONFIG.rating thresholds. Empty -> "miss". */
export function rateBeat(frameScores: number[]): MoveRating {
  void frameScores;
  return todo("rateBeat");
}

/** pct 0..100 -> CONFIG.level thresholds. */
export function accuracyLevel(pct: number): AccuracyLevel {
  void pct;
  return todo("accuracyLevel");
}
