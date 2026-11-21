/**
 * Owner: Zaid
 * Purpose: Record PoseFrame.points at CONFIG.clipFps, torso-centered and divided by shoulder width
 * FRs: FR-47 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { PoseRecorder } from "../types/pulse";
import { CONFIG } from "../config";
import { todo } from "../contracts/notImplemented";

export function createPoseRecorder(fps: number = CONFIG.clipFps): PoseRecorder {
  void fps;
  return todo("createPoseRecorder");
}
