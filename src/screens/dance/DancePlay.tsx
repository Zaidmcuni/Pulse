/**
 * Owner: Mohamed
 * Purpose: Dance screen (/dance/:id/play): wires the pipeline below, HUD, pause, quit, saves SessionResult -> /results/:resultId
 * FRs: FR-07, FR-30, FR-33 to FR-35, FR-37
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Pipeline (the ONLY way modules connect):
 *   startPose(video, raw => {
 *     const frame = computePoseFrame(raw, profile.mode);              // Toufic
 *     const tSong = player.heardSongTimeMs(raw.tFrameMs);             // Zaid
 *     const score = scoreFrame(frame, tSong, dance, profile.mode);    // Mohamed
 *   });                                                               // Zaid
 *   heart rate: monitor.subscribe(r => ...) every second -> effortPerSecond + pointsDelta
 */

import type { ReactElement } from "react";

export default function DancePlay(): ReactElement {
  return <div>TODO DancePlay</div>;
}
