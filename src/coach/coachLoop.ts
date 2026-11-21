/**
 * Owner: Toufic
 * Purpose: coach render loop: every animation frame, read the song clock once, sample the template, redraw
 * FRs: FR-26
 *
 * Animation callbacks only decide WHEN to draw. The pose always comes from getSongTimeMs(), never from
 * callback timestamps, performance.now() or accumulated deltas, so the coach follows play, pause and seek.
 */
import type { SongTimeMs, TemplateFrame } from "../types/pulse";
import { sampleTemplate } from "./sampleTemplate";
import { drawCoach, type CoachDrawContext } from "./silhouette";

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
): () => void {
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    const frames = getFrames();
    const songTimeMs = getSongTimeMs();
    if (stopped) return;
    drawCoach(ctx, canvas.width, canvas.height, sampleTemplate(frames, songTimeMs));
    handle = scheduler.request(tick);
  };
  let handle = scheduler.request(tick);
  return () => {
    stopped = true;
    scheduler.cancel(handle);
  };
}
