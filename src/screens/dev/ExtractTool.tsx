/**
 * Owner: Toufic
 * Purpose: Dev page (/dev/extract): load a dance video, run initPoseLandmarker + startPose on it, extractSegments(mirror: false), build Dance JSON with tMs = mediaTimeSec * 1000, validate with parseDance, download
 * FRs: FR-13, FR-14, FR-15
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Inputs on the page: video file, BPM, first-beat offset (ms), title, genre, difficulty, popularity.
 * Audio: extract once with `ffmpeg -i video.mp4 -vn -c:a copy public/dances/<id>.m4a` (same timeline as the video).
 */

import type { ReactElement } from "react";

export default function ExtractTool(): ReactElement {
  return <div>TODO ExtractTool</div>;
}
