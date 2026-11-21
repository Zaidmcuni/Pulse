/**
 * Owner: Toufic
 * Purpose: 9:16 silhouette replay of recorded samples, interpolated to 60 FPS
 * FRs: FR-49 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import type { RecordedPoseSample } from "../types/pulse";

export function ClipReplay(props: { samples: RecordedPoseSample[]; startSec: number; durationSec?: number }): ReactElement {
  void props;
  return <canvas data-todo="ClipReplay" />;
}
