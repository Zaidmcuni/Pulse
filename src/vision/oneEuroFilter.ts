/**
 * Owner: Zaid
 * Purpose: One Euro filter on every landmark x and y
 * FRs: FR-18
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { CONFIG, SCORED_LANDMARK_INDICES } from "../config";
import type { LandmarkPoint, LandmarkSmoother, PerfTimeMs } from "../types/pulse";

const PAUSE_RESET_SEC = 0.5;
const MIN_DT_SEC = 1e-3;

function computeAlpha(dtSec: number, cutoffHz: number): number {
  if (!Number.isFinite(cutoffHz) || cutoffHz <= 0) {
    return 0;
  }
  return 1 / (1 + 1 / (2 * Math.PI * cutoffHz * dtSec));
}

/** Single-channel adaptive low-pass One Euro filter (Casiez et al., 2012). */
class ScalarOneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrevMs: number | null = null;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(x: number, tMs: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(tMs)) {
      return this.xPrev ?? 0;
    }

    if (this.xPrev === null || this.tPrevMs === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrevMs = tMs;
      return x;
    }

    const rawDtSec = (tMs - this.tPrevMs) / 1000;
    if (!Number.isFinite(rawDtSec) || rawDtSec <= 0) {
      return this.xPrev;
    }

    // Treat long pauses / seeks as re-entry so stale position does not smear across gaps
    if (rawDtSec > PAUSE_RESET_SEC) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrevMs = tMs;
      return x;
    }

    const dtSec = Math.max(rawDtSec, MIN_DT_SEC);
    const dx = (x - this.xPrev) / dtSec;
    const alphaD = computeAlpha(dtSec, this.dCutoff);
    const edx = alphaD * dx + (1 - alphaD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const alpha = computeAlpha(dtSec, cutoff);
    const xHat = alpha * x + (1 - alpha) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = edx;
    this.tPrevMs = tMs;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrevMs = null;
  }
}

interface LandmarkChannelPair {
  x: ScalarOneEuroFilter;
  y: ScalarOneEuroFilter;
}

export function createOneEuroSmoother(
  minCutoff: number = CONFIG.oneEuro.minCutoffHz,
  beta: number = CONFIG.oneEuro.beta,
): LandmarkSmoother {
  const dCutoff = CONFIG.oneEuro.dCutoffHz;
  const makePair = (): LandmarkChannelPair => ({
    x: new ScalarOneEuroFilter(minCutoff, beta, dCutoff),
    y: new ScalarOneEuroFilter(minCutoff, beta, dCutoff),
  });

  const channels: LandmarkChannelPair[] = Array.from(
    { length: SCORED_LANDMARK_INDICES.length },
    makePair,
  );

  return {
    smooth(points: LandmarkPoint[], tMs: PerfTimeMs): LandmarkPoint[] {
      if (!Number.isFinite(tMs)) {
        return points.map((p) => ({ ...p }));
      }

      return points.map((p, index) => {
        while (channels.length <= index) {
          channels.push(makePair());
        }
        const pair = channels[index];

        if (!Number.isFinite(p.v) || p.v <= 0 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          pair.x.reset();
          pair.y.reset();
          return { x: 0, y: 0, v: 0 };
        }

        return {
          x: pair.x.filter(p.x, tMs),
          y: pair.y.filter(p.y, tMs),
          v: p.v,
        };
      });
    },

    reset(): void {
      for (const pair of channels) {
        pair.x.reset();
        pair.y.reset();
      }
    },
  };
}
