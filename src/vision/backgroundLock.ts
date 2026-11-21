/**
 * Owner: Zaid
 * Purpose: Reject frames where the body center jumps (someone walking behind)
 * FRs: FR-22 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { BackgroundLock } from "../types/pulse";
import { CONFIG } from "../config";
import { todo } from "../contracts/notImplemented";

export function createBackgroundLock(maxJumpRatio: number = CONFIG.backgroundJump): BackgroundLock {
  void maxJumpRatio;
  return todo("createBackgroundLock");
}
