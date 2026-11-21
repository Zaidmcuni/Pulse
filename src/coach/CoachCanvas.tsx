/**
 * Owner: Toufic
 * Purpose: Silhouette coach drawn from the template frame at getSongTimeMs() (interpolated between frames)
 * FRs: FR-26
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useRef, type ReactElement } from "react";
import type { Dance, SongTimeMs } from "../types/pulse";
import { startCoachLoop, type FrameScheduler } from "./coachLoop";

// Drawing resolution (3:4 portrait); the caller's CSS may scale the element.
const COACH_WIDTH_PX = 360;
const COACH_HEIGHT_PX = 480;

const BROWSER_SCHEDULER: FrameScheduler = {
  request: (cb) => requestAnimationFrame(() => cb()),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function CoachCanvas(props: { dance: Dance; getSongTimeMs: () => SongTimeMs }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestProps = useRef(props);

  useEffect(() => {
    latestProps.current = props;
  }, [props]);

  // Keep the pending frame when the parent supplies a new clock callback.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    return startCoachLoop(
      ctx,
      canvas,
      () => latestProps.current.dance.frames,
      () => latestProps.current.getSongTimeMs(),
      BROWSER_SCHEDULER,
    );
  }, []);

  return <canvas ref={canvasRef} width={COACH_WIDTH_PX} height={COACH_HEIGHT_PX} role="img" aria-label="Dance coach" />;
}
