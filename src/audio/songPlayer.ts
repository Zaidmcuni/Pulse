/**
 * Owner: Zaid
 * Purpose: Web Audio song player: AudioContext.currentTime is the master clock; frame time -> heard song time
 * FRs: FR-24, FR-25
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * heardSongTimeMs: use audioCtx.getOutputTimestamp() + CONFIG.camDelaySec; fallback currentTime - baseLatency - outputLatency.
 */

import type { SongPlayer } from "../types/pulse";
import { todo } from "../contracts/notImplemented";

export function createSongPlayer(): SongPlayer {
  return todo("createSongPlayer");
}
