/**
 * Owner: Mohamed
 * Purpose: Keep beat and whole-second scoring on the same song timeline as delivered camera frames.
 * FRs: FR-25, FR-27, FR-28, FR-30
 */
import { CONFIG } from "../config";
import { songMs, type PerfTimeMs, type SongPlayer, type SongTimeMs } from "../types/pulse";

export function scoringTimeMs(player: Pick<SongPlayer, "heardSongTimeMs" | "songTimeMs">, nowMs: PerfTimeMs): SongTimeMs {
  const heardMs = Math.min(player.heardSongTimeMs(nowMs), player.songTimeMs());
  // Leave a camera-latency budget for a frame already presented but not yet delivered
  // to scoring. The clock keeps advancing even if the camera stops producing frames.
  return songMs(Math.max(0, heardMs - CONFIG.camDelaySec * 1000));
}
