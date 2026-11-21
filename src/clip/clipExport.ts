/**
 * Owner: Toufic
 * Purpose: Export the replay canvas + song as WebM/MP4 with MediaRecorder
 * FRs: FR-50 (Could)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { todo } from "../contracts/notImplemented";

export function exportClip(canvas: HTMLCanvasElement, audioUrl: string, startSec: number, durationSec: number): Promise<Blob> {
  void canvas; void audioUrl; void startSec; void durationSec;
  return todo("exportClip");
}
