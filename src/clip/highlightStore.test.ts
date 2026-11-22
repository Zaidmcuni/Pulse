/**
 * Owner: Toufic
 * Purpose: Unit tests for transient in-memory highlightStore (max-3 eviction, landmark toggle, clear)
 */

import { afterEach, describe, expect, it } from "vitest";
import { songMs, type RecordedPoseSample } from "../types/pulse";
import {
  clearHighlightClips,
  getHighlightClip,
  saveHighlightClip,
  setHighlightShowLandmarks,
  type HighlightClipData,
} from "./highlightStore";

function makeClip(resultId: string, overrides: Partial<HighlightClipData> = {}): HighlightClipData {
  const sample: RecordedPoseSample = {
    tSongMs: songMs(1000),
    points: Array.from({ length: 12 }, () => ({ x: 0.5, y: 0.5, v: 0.9 })),
  };
  return {
    resultId,
    danceId: "dance-1",
    videoBlob: new Blob(["video"], { type: "video/webm" }),
    videoStartSongMs: 0,
    overlaySamples: [sample],
    poseSamples: [sample],
    showLandmarks: false,
    ...overrides,
  };
}

afterEach(() => {
  clearHighlightClips();
});

describe("highlightStore", () => {
  it("saves, retrieves, updates showLandmarks, and clears cleanly without touching localStorage", () => {
    const clip = makeClip("res-1");
    saveHighlightClip(clip);

    expect(getHighlightClip("res-1")).toMatchObject({
      resultId: "res-1",
      danceId: "dance-1",
      videoStartSongMs: 0,
      showLandmarks: false,
    });
    expect(getHighlightClip("missing")).toBeUndefined();

    setHighlightShowLandmarks("res-1", true);
    expect(getHighlightClip("res-1")?.showLandmarks).toBe(true);

    // Updating a missing resultId is a safe no-op.
    setHighlightShowLandmarks("missing", true);
    expect(getHighlightClip("missing")).toBeUndefined();

    clearHighlightClips();
    expect(getHighlightClip("res-1")).toBeUndefined();
  });

  it("enforces the max-3-entry memory eviction cap (oldest evicted first) and refreshes order on overwrite", () => {
    saveHighlightClip(makeClip("res-1"));
    saveHighlightClip(makeClip("res-2"));
    saveHighlightClip(makeClip("res-3"));

    // Touch res-1 again so res-2 becomes the oldest entry.
    saveHighlightClip(makeClip("res-1", { videoStartSongMs: 50 }));
    saveHighlightClip(makeClip("res-4"));

    expect(getHighlightClip("res-1")?.videoStartSongMs).toBe(50);
    expect(getHighlightClip("res-2")).toBeUndefined();
    expect(getHighlightClip("res-3")).toBeDefined();
    expect(getHighlightClip("res-4")).toBeDefined();
  });

  it("defensively copies sample arrays so external mutations do not corrupt stored highlights", () => {
    const clip = makeClip("res-copy");
    saveHighlightClip(clip);
    clip.overlaySamples.pop();
    clip.poseSamples.pop();

    expect(getHighlightClip("res-copy")?.overlaySamples).toHaveLength(1);
    expect(getHighlightClip("res-copy")?.poseSamples).toHaveLength(1);
  });
});
