/**
 * Owner: Mohamed
 * Purpose: Pure display helpers for the dance screen HUD (text, clock, progress, HR badge, reconnect banner)
 * FRs: FR-06, FR-21, FR-27, FR-29, FR-30, FR-31, FR-33, NFR-06, NFR-07, NFR-10
 */

import type {
  AccuracyLevel, HeartRateSource, HeartRateStatus, MoveRating, PoseFrame, PosturalMode, RawPoseLandmarks,
} from "../../types/pulse";
import type { HudState, SessionStatus } from "../../scoring/session";

/** Encouraging beat text (NFR-10): never shows "Miss". */
export function ratingText(r: MoveRating): string {
  switch (r) {
    case "perfect": return "Perfect!";
    case "good": return "Good!";
    case "ok": return "OK";
    case "miss": return "Keep going!";
  }
}

/** FR-31: consecutive Perfect or Good beats; any other rating resets the streak (display only). */
export function nextStreak(prev: number, rating: MoveRating): number {
  return rating === "perfect" || rating === "good" ? prev + 1 : 0;
}

/** Moves meter word for each accuracy level. */
export const LEVEL_TEXT: Record<AccuracyLevel, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  superstar: "Superstar",
};

/** ms -> "M:SS", whole seconds rounded down; negative -> "0:00". */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** Time left in the song, e.g. "2:41 left". */
export function remainingText(tSongMs: number, lengthSec: number): string {
  return `${formatClock(lengthSec * 1000 - tSongMs)} left`;
}

/** Share of the song played, clamped 0..1; 0 for a zero-length dance. */
export function progressFraction(tSongMs: number, lengthSec: number): number {
  if (!(lengthSec > 0)) return 0;
  return Math.min(1, Math.max(0, tSongMs / (lengthSec * 1000)));
}

/** FR-06: banner only when the watch has dropped. */
export function showReconnectBanner(status: HeartRateStatus | null): boolean {
  return status === "disconnected";
}

/** NFR-09: disclose the source if a simulated reading reaches the HUD. */
export function hrBadgeText(hrSource: HeartRateSource, hrState: "live" | "holding" | "none"): string {
  if (hrSource === "none") return "No watch";
  if (hrSource === "simulated") return "Simulated";
  if (hrState === "live") return "Live";
  if (hrState === "holding") return "Holding";
  return "Waiting for watch"; // FR-06: before the first reading or after the hold expires
}

/** NFR-07: plain words, nothing technical. */
export const CANT_SEE_TEXT = "We can't see you";
export const STEP_BACK_TEXT = "Step back so we can see all of you";
export const SEATED_STEP_BACK_TEXT = "Move so we can see your shoulders and arms";

/** Hint chip on the camera tile: camera can't see the dancer wins; #112 standing still says "Keep moving!"; else none. */
export function playHintText(cantSee: boolean, status: SessionStatus, _mode: PosturalMode): string | null {
  if (cantSee) return CANT_SEE_TEXT;
  return status === "still" ? "Keep moving!" : null;
}

export type TrackingFeedback = "waiting" | "tracked" | "uncertain" | "absent";

/** FR-21: display-only tracking state; the score keeps using the original PoseFrame. */
export function createTrackingFeedback(absenceDelayMs: number, nowMs: number) {
  let lastFrameAtMs = nowMs;
  let absentSinceMs: number | null = null;
  let feedback: TrackingFeedback = "waiting";

  return {
    observe(raw: RawPoseLandmarks, tracking: PoseFrame["tracking"], atMs: number): void {
      const previousFrameAtMs = lastFrameAtMs;
      lastFrameAtMs = atMs;
      // The pose engine emits all-zero visibility for an empty frame. Use the raw points so
      // seated masking can't turn a detected person into an empty frame.
      if (raw.landmarks.every((point) => point.v === 0)) {
        absentSinceMs ??= atMs - previousFrameAtMs >= absenceDelayMs ? previousFrameAtMs : atMs;
        feedback = "waiting";
      } else {
        absentSinceMs = null;
        feedback = tracking === "uncertain" ? "uncertain" : "tracked";
      }
    },
    read(atMs: number): TrackingFeedback {
      return atMs - (absentSinceMs ?? lastFrameAtMs) >= absenceDelayMs ? "absent" : feedback;
    },
    reset(atMs: number): void {
      lastFrameAtMs = atMs;
      absentSinceMs = null;
      feedback = "waiting";
    },
  };
}

export function trackingHintText(feedback: TrackingFeedback, status: SessionStatus, mode: PosturalMode): string | null {
  if (feedback === "uncertain") return mode === "seated" ? SEATED_STEP_BACK_TEXT : STEP_BACK_TEXT;
  if (feedback === "waiting") return null;
  return playHintText(feedback === "absent", status, mode);
}

const fixed = (x: number | null, digits: number): string => (x === null ? "--" : x.toFixed(digits));

/** #112 debug box lines (display only). */
export function debugLines(hud: HudState, usableRatio: number | null, bestMatchOffsetMs: number | null): string[] {
  const d = hud.debug;
  return [
    `acc     ${hud.accuracyPct}%`,
    `beat    ${fixed(d.lastBeatScore, 2)} ${d.lastBeatRating ?? "--"}`,
    `dancer  ${fixed(d.dancerMotion, 2)} SW/s`,
    `coach   ${fixed(d.coachMotion, 0)} deg/s`,
    `usable  ${fixed(usableRatio, 2)}`,
    `status  ${hud.status}`,
    `offset  ${bestMatchOffsetMs === null ? "--" : Math.round(bestMatchOffsetMs)} ms`,
  ];
}
