/**
 * Owner: Toufic
 * Purpose: coach render loop: every animation frame, read the song clock once, sample the template, redraw
 * FRs: FR-26
 *
 * Animation callbacks only decide WHEN to draw. The pose always comes from getSongTimeMs(), never from
 * callback timestamps, performance.now() or accumulated deltas, so the coach follows play, pause and seek.
 */
import type { SongTimeMs, TemplateFrame } from "../types/pulse";
import { sampleTemplatePose } from "./sampleTemplate";
import { computeStageTransform, drawCoach, type CoachDrawContext, type StageTransform } from "./silhouette";

/** requestAnimationFrame / cancelAnimationFrame in the browser; a manual queue in tests. */
export interface FrameScheduler {
  request(cb: () => void): number;
  cancel(handle: number): void;
}

/** Starts one loop and returns its stop function. The canvas size is read on every tick. */
export function startCoachLoop(
  ctx: CoachDrawContext,
  canvas: { readonly width: number; readonly height: number },
  getFrames: () => readonly TemplateFrame[],
  getSongTimeMs: () => SongTimeMs,
  scheduler: FrameScheduler,
  getAspectRatio?: () => number | undefined,
): () => void {
  let stopped = false;
  let cachedFrames: readonly TemplateFrame[] | null = null;
  let cachedWidth = -1;
  let cachedHeight = -1;
  let cachedAspect: number | undefined;
  let cachedStage: StageTransform | undefined;

  const tick = (): void => {
    if (stopped) return;
    const frames = getFrames();
    const songTimeMs = getSongTimeMs();
    if (stopped) return;
    const aspectRatio = getAspectRatio?.();
    if (
      frames !== cachedFrames ||
      canvas.width !== cachedWidth ||
      canvas.height !== cachedHeight ||
      aspectRatio !== cachedAspect ||
      !cachedStage
    ) {
      cachedFrames = frames;
      cachedWidth = canvas.width;
      cachedHeight = canvas.height;
      cachedAspect = aspectRatio;
      cachedStage = computeStageTransform(frames, canvas.width, canvas.height, aspectRatio);
    }
    const sampled = sampleTemplatePose(frames, songTimeMs);
    drawCoach(ctx, canvas.width, canvas.height, sampled.segments, sampled.landmarks, cachedStage);
    handle = scheduler.request(tick);
  };
  let handle = scheduler.request(tick);
  return () => {
    stopped = true;
    scheduler.cancel(handle);
  };
}
