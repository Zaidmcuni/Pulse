/**
 * Owner: Toufic
 * Purpose: Silhouette coach drawn from the template frame at getSongTimeMs() (interpolated between frames)
 * FRs: FR-26
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useRef, type ReactElement } from "react";
import { loadBodyTrack, type BodyTrack } from "./bodyTrack";
import type { Dance, PosturalMode, SongTimeMs } from "../types/pulse";
import { startCoachLoop, type FrameScheduler } from "./coachLoop";
import { createHumanCoachDraw } from "./humanCoach";

// Drawing resolution (3:4 portrait); the caller's CSS may scale the element.
const COACH_WIDTH_PX = 360;
const COACH_HEIGHT_PX = 480;

const BROWSER_SCHEDULER: FrameScheduler = {
  request: (cb) => requestAnimationFrame(() => cb()),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** `mode` (optional, default standing): seated shows the coach's upper body only (FR-20). */
export function CoachCanvas(props: {
  dance: Dance;
  getSongTimeMs: () => SongTimeMs;
  mode?: PosturalMode;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestProps = useRef(props);
  const track = useRef<BodyTrack | null>(null);
  const danceId = props.dance.id;

  useEffect(() => {
    latestProps.current = props;
  }, [props]);

  // The dance's optional 3D body track (#97); until it loads, or without one, the coach is flat.
  useEffect(() => {
    let cancelled = false;
    track.current = null;
    void loadBodyTrack(danceId).then((t) => {
      if (!cancelled) track.current = t;
    });
    return () => {
      cancelled = true;
    };
  }, [danceId]);

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
      () => latestProps.current.dance.aspectRatio,
      // New human coach on the lounge stage (#97); the old silhouette if scratch canvases are unavailable.
      createHumanCoachDraw(
        ctx,
        () => document.createElement("canvas"),
        () => track.current,
        () => latestProps.current.mode ?? "standing",
      ) ?? undefined,
    );
  }, []);

  return <canvas ref={canvasRef} width={COACH_WIDTH_PX} height={COACH_HEIGHT_PX} role="img" aria-label="Dance coach" />;
}
