/**
 * Owner: Toufic
 * Purpose: Transient in-memory RAM store for side-by-side highlight video blobs and landmark preferences (never persisted to localStorage)
 * FRs: FR-49, NFR-04, NFR-05, NFR-11
 */

import type { RecordedPoseSample } from "../types/pulse";

const MAX_HIGHLIGHT_CLIPS = 3;

export interface HighlightClipData {
  resultId: string;
  danceId: string;
  videoBlob: Blob | null;
  /** SongTimeMs when MediaRecorder began encoding (for exact video-to-song sync). */
  videoStartSongMs: number;
  /** Screen-space [0..1] mirrored 12-landmark samples (from PoseFrame.points) for pixel-accurate video overlay. */
  overlaySamples: RecordedPoseSample[];
  /** Torso-normalized samples from poseRecorder (fallback when videoBlob is unavailable). */
  poseSamples: RecordedPoseSample[];
  /** User's checkbox preference chosen on Results before posting/exporting. */
  showLandmarks: boolean;
}

const clips = new Map<string, HighlightClipData>();

/** Stores highlight clip data in transient browser RAM, evicting oldest entries past the 3-result cap. */
export function saveHighlightClip(data: HighlightClipData): void {
  if (!data.resultId) return;
  if (clips.has(data.resultId)) {
    clips.delete(data.resultId);
  }
  clips.set(data.resultId, {
    ...data,
    overlaySamples: [...data.overlaySamples],
    poseSamples: [...data.poseSamples],
  });
  while (clips.size > MAX_HIGHLIGHT_CLIPS) {
    const oldestKey = clips.keys().next().value;
    if (oldestKey === undefined) break;
    clips.delete(oldestKey);
  }
}

export function getHighlightClip(resultId: string): HighlightClipData | undefined {
  return clips.get(resultId);
}

export function setHighlightShowLandmarks(resultId: string, showLandmarks: boolean): void {
  const existing = clips.get(resultId);
  if (!existing) return;
  existing.showLandmarks = Boolean(showLandmarks);
}

export function clearHighlightClips(): void {
  clips.clear();
}
