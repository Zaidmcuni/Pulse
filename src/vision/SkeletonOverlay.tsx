/**
 * Owner: Zaid
 * Purpose: Draw PoseFrame.points as a skeleton (bones from SEGMENT_ENDPOINTS) on a canvas
 * FRs: FR-23, FR-33
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import type { PoseFrame } from "../types/pulse";

export function SkeletonOverlay(props: { frame: PoseFrame | null; width?: number; height?: number }): ReactElement {
  void props;
  return <canvas data-todo="SkeletonOverlay" />;
}
