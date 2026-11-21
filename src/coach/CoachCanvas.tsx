/**
 * Owner: Toufic
 * Purpose: Silhouette coach drawn from the template frame at getSongTimeMs() (interpolated between frames)
 * FRs: FR-26
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import type { Dance, SongTimeMs } from "../types/pulse";

export function CoachCanvas(props: { dance: Dance; getSongTimeMs: () => SongTimeMs }): ReactElement {
  void props;
  return <canvas data-todo="CoachCanvas" />;
}
