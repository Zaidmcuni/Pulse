/**
 * Owner: Zaid
 * Purpose: Record PoseFrame.points at CONFIG.clipFps, torso-centered and divided by shoulder width
 * FRs: FR-47 (Should)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { CONFIG, LM, SCORED_LANDMARK_INDICES } from "../config";
import {
  songMs,
  type LandmarkPoint,
  type PoseFrame,
  type PoseRecorder,
  type RecordedPoseSample,
  type SongTimeMs,
} from "../types/pulse";

const MIN_SHOULDER_WIDTH = 0.02;
const DEFAULT_SHOULDER_WIDTH = 0.2;
const DEFAULT_CENTER = { x: 0.5, y: 0.5 } as const;
const TORSO_ANCHOR_INDICES = [LM.lShoulder, LM.rShoulder, LM.lHip, LM.rHip] as const;

interface Point2D {
  x: number;
  y: number;
}

function isPresent(pt: LandmarkPoint | undefined): pt is LandmarkPoint {
  return Boolean(
    pt &&
      Number.isFinite(pt.x) &&
      Number.isFinite(pt.y) &&
      Number.isFinite(pt.v) &&
      pt.v > 0,
  );
}

function isUsable(pt: LandmarkPoint | undefined): pt is LandmarkPoint {
  return isPresent(pt) && pt.v >= CONFIG.visibilityMin;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000 || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 || 0;
}

export function createPoseRecorder(fps: number = CONFIG.clipFps): PoseRecorder {
  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : CONFIG.clipFps;
  const minIntervalMs = 1000 / effectiveFps;

  let samples: RecordedPoseSample[] = [];
  let lastRecordedTSongMs: number | null = null;
  let anchorCenter: Point2D | null = null;
  let anchorScale: number | null = null;

  const computeTorsoCenter = (points: readonly LandmarkPoint[]): Point2D => {
    if (anchorCenter !== null) {
      return anchorCenter;
    }

    const lS = points[LM.lShoulder];
    const rS = points[LM.rShoulder];
    const lH = points[LM.lHip];
    const rH = points[LM.rHip];

    if (isUsable(lS) && isUsable(rS) && isUsable(lH) && isUsable(rH)) {
      anchorCenter = {
        x: (lS.x + rS.x + lH.x + rH.x) / 4,
        y: (lS.y + rS.y + lH.y + rH.y) / 4,
      };
      return anchorCenter;
    }

    if (isUsable(lS) && isUsable(rS)) {
      anchorCenter = { x: (lS.x + rS.x) / 2, y: (lS.y + rS.y) / 2 };
      return anchorCenter;
    }

    if (isUsable(lH) && isUsable(rH)) {
      anchorCenter = { x: (lH.x + rH.x) / 2, y: (lH.y + rH.y) / 2 };
      return anchorCenter;
    }

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let i = 0; i < TORSO_ANCHOR_INDICES.length; i++) {
      const pt = points[TORSO_ANCHOR_INDICES[i]];
      if (isPresent(pt)) {
        sumX += pt.x;
        sumY += pt.y;
        count++;
      }
    }
    if (count > 0) {
      return { x: sumX / count, y: sumY / count };
    }

    return DEFAULT_CENTER;
  };

  const computeShoulderScale = (points: readonly LandmarkPoint[]): number => {
    if (anchorScale !== null) {
      return anchorScale;
    }

    const lS = points[LM.lShoulder];
    const rS = points[LM.rShoulder];

    if (isUsable(lS) && isUsable(rS)) {
      const dist = Math.hypot(rS.x - lS.x, rS.y - lS.y);
      if (Number.isFinite(dist) && dist >= MIN_SHOULDER_WIDTH) {
        anchorScale = dist;
        return anchorScale;
      }
    }

    if (isPresent(lS) && isPresent(rS)) {
      const dist = Math.hypot(rS.x - lS.x, rS.y - lS.y);
      if (Number.isFinite(dist) && dist >= MIN_SHOULDER_WIDTH) {
        return dist;
      }
    }

    return DEFAULT_SHOULDER_WIDTH;
  };

  const normalizePoints = (points: readonly LandmarkPoint[]): LandmarkPoint[] => {
    const center = computeTorsoCenter(points);
    const scale = computeShoulderScale(points);

    return SCORED_LANDMARK_INDICES.map((_, i) => {
      const pt = points[i];
      if (!isPresent(pt)) {
        return { x: 0, y: 0, v: 0 };
      }
      return {
        x: round3((pt.x - center.x) / scale),
        y: round3((pt.y - center.y) / scale),
        v: round2(Math.max(0, Math.min(1, pt.v))),
      };
    });
  };

  return {
    push(frame: PoseFrame, tSongMs: SongTimeMs): void {
      const tMs = Number(tSongMs);
      if (!Number.isFinite(tMs)) {
        return;
      }

      if (lastRecordedTSongMs !== null && tMs - lastRecordedTSongMs < minIntervalMs - 1e-6) {
        return;
      }

      lastRecordedTSongMs = tMs;
      samples.push({
        tSongMs: songMs(Math.round(tMs)),
        points: normalizePoints(frame.points),
      });
    },

    getSamples(): RecordedPoseSample[] {
      return [...samples];
    },

    clear(): void {
      samples = [];
      lastRecordedTSongMs = null;
      anchorCenter = null;
      anchorScale = null;
    },
  };
}
