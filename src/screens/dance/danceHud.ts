/**
 * Owner: Mohamed
 * Purpose: Pure display helpers for the dance screen HUD (text, clock, progress, HR badge, reconnect banner)
 * FRs: FR-06, FR-08, FR-33, NFR-10
 */

import type { HeartRateSource, HeartRateStatus, MoveRating } from "../../types/pulse";

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

/** FR-08: simulated heart rate is always labeled "Simulated". */
export function hrBadgeText(hrSource: HeartRateSource, hrState: "live" | "holding" | "none"): string {
  if (hrSource === "simulated") return "Simulated";
  if (hrState === "live") return "Live";
  if (hrState === "holding") return "Holding";
  return "No signal";
}
