/**
 * Owner: Mohamed
 * Purpose: Pure display helpers for the dance screen HUD (text, clock, progress, HR badge, reconnect banner)
 * FRs: FR-06, FR-27, FR-29, FR-33, NFR-10
 */

import type { HeartRateSource, HeartRateStatus, MoveRating, PosturalMode } from "../../types/pulse";
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

/** ms -> "M:SS", whole seconds rounded down; negative -> "0:00". */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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

/** FR-29: no watch (or a legacy "simulated" reading) is labeled "No watch". */
export function hrBadgeText(hrSource: HeartRateSource, hrState: "live" | "holding" | "none"): string {
  if (hrSource === "none" || hrSource === "simulated") return "No watch";
  if (hrState === "live") return "Live";
  if (hrState === "holding") return "Holding";
  return "Waiting for watch"; // FR-06: before the first reading or after the hold expires
}

/** Hint line under the coach: camera can't see the dancer wins; #112 standing still says "Keep moving!"; else none. */
export function playHintText(cantSee: boolean, status: SessionStatus, mode: PosturalMode): string | null {
  if (cantSee) {
    return mode === "seated"
      ? "Bring your shoulders and arms into frame. Scoring waits for you."
      : "Step back into frame. Scoring waits for you.";
  }
  return status === "still" ? "Keep moving!" : null;
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
