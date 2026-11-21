/**
 * Owner: Zaid
 * Purpose: One Euro filter on every landmark x and y
 * FRs: FR-18
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { LandmarkSmoother } from "../types/pulse";
import { CONFIG } from "../config";
import { todo } from "../contracts/notImplemented";

export function createOneEuroSmoother(
  minCutoff: number = CONFIG.oneEuro.minCutoffHz,
  beta: number = CONFIG.oneEuro.beta,
): LandmarkSmoother {
  void minCutoff; void beta;
  return todo("createOneEuroSmoother");
}
