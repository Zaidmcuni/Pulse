/**
 * Owner: Toufic
 * Purpose: coach clock and lifecycle tests with a manual frame scheduler and a recording canvas (Vitest node env)
 * FRs: FR-26
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseDance } from "../contracts/validators";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { songMs, type SongTimeMs, type TemplateFrame } from "../types/pulse";
import { CoachCanvas } from "./CoachCanvas";
import { startCoachLoop, type FrameScheduler } from "./coachLoop";
import { createRecordingContext, type DrawCall } from "./recordingContext";
import { sampleTemplate } from "./sampleTemplate";
import { drawCoach } from "./silhouette";

const dance = parseDance(FAKE_DANCE);
const canvas = { width: 360, height: 480 };

/** Runs queued callbacks only when the test says a frame happened. */
function manualScheduler(): FrameScheduler & { runFrame(): void; pending(): number } {
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    request(cb) { const h = next++; queue.set(h, cb); return h; },
    cancel(h) { queue.delete(h); },
    runFrame() { const cbs = [...queue.values()]; queue.clear(); cbs.forEach((cb) => cb()); },
    pending: () => queue.size,
  };
}

/** A clock the test moves by hand; counts reads. */
function manualClock(startMs: number) {
  const clock = { tMs: startMs, reads: 0, get: (): SongTimeMs => { clock.reads++; return songMs(clock.tMs); } };
  return clock;
}

function expectedDraw(frames: readonly TemplateFrame[], tMs: number, size = canvas): DrawCall[] {
  const { ctx, calls } = createRecordingContext();
  drawCoach(ctx, size.width, size.height, sampleTemplate(frames, songMs(tMs)));
  return calls;
}

function setup(frames: readonly TemplateFrame[], startMs: number) {
  const rec = createRecordingContext();
  const sched = manualScheduler();
  const clock = manualClock(startMs);
  const stop = startCoachLoop(rec.ctx, canvas, () => frames, clock.get, sched);
  /** Runs one animation frame and returns the calls it drew. */
  const frame = (): DrawCall[] => { rec.calls.length = 0; sched.runFrame(); return [...rec.calls]; };
  return { rec, sched, clock, stop, frame };
}

describe("coach loop clock", () => {
  it("draws nothing until the first animation frame, then keeps exactly one frame queued", () => {
    const t = setup(dance.frames, 0);
    expect(t.rec.calls).toEqual([]);
    expect(t.clock.reads).toBe(0);
    expect(t.sched.pending()).toBe(1);
    expect(t.frame()).toEqual(expectedDraw(dance.frames, 0));
    expect(t.sched.pending()).toBe(1);
  });

  it("holds the pose while the clock is held, reading it once per frame", () => {
    const t = setup(dance.frames, 500);
    const want = expectedDraw(dance.frames, 500);
    for (let i = 1; i <= 4; i++) {
      expect(t.frame()).toEqual(want);
      expect(t.clock.reads).toBe(i);
    }
  });

  it("follows forward and backward jumps on the next frame", () => {
    const t = setup(dance.frames, 0);
    const up = t.frame();
    t.clock.tMs = 12_500; // seek forward into an "out" beat
    const out = t.frame();
    expect(out).toEqual(expectedDraw(dance.frames, 12_500));
    expect(out).not.toEqual(up);
    t.clock.tMs = 483; // seek back into the 466.67 -> 500 ms blend
    expect(t.frame()).toEqual(expectedDraw(dance.frames, 483));
    t.clock.tMs = 0;
    expect(t.frame()).toEqual(up);
  });

  it("clears on every frame, including empty samples", () => {
    const t = setup([], 0);
    expect(t.frame()).toEqual([["clearRect", 0, 0, 360, 480]]);
    expect(t.frame()).toEqual([["clearRect", 0, 0, 360, 480]]);
  });

  it("reads the canvas size on every frame", () => {
    const size = { width: 360, height: 480 };
    const rec = createRecordingContext();
    const sched = manualScheduler();
    startCoachLoop(rec.ctx, size, () => dance.frames, () => songMs(0), sched);
    size.width = 200;
    sched.runFrame();
    expect(rec.calls[0]).toEqual(["clearRect", 0, 0, 200, 480]);
    expect(rec.calls).toEqual(expectedDraw(dance.frames, 0, size));
  });
});

describe("coach loop lifecycle", () => {
  it("stop cancels the pending frame and draws nothing more", () => {
    const t = setup(dance.frames, 0);
    t.frame();
    t.stop();
    expect(t.sched.pending()).toBe(0);
    expect(t.frame()).toEqual([]);
  });

  it("a callback already in flight after stop neither draws nor reschedules", () => {
    const rec = createRecordingContext();
    let inFlight: (() => void) | undefined;
    let requests = 0;
    const sched: FrameScheduler = { request: (cb) => { inFlight = cb; return ++requests; }, cancel: () => {} };
    const stop = startCoachLoop(rec.ctx, canvas, () => dance.frames, () => songMs(0), sched);
    stop();
    inFlight!();
    expect(rec.calls).toEqual([]);
    expect(requests).toBe(1);
  });

  it("uses a replacement dance and clock without cancelling the queued frame", () => {
    const rec = createRecordingContext();
    const sched = manualScheduler();
    const oldClock = manualClock(0);
    const newClock = manualClock(500);
    let frames = dance.frames;
    let getSongTimeMs = oldClock.get;

    const stop = startCoachLoop(rec.ctx, canvas, () => frames, () => getSongTimeMs(), sched);
    frames = [{ tMs: songMs(500), segments: { torso: [1, 0] } }];
    getSongTimeMs = newClock.get;
    expect(sched.pending()).toBe(1);

    sched.runFrame();
    expect(oldClock.reads).toBe(0);
    expect(newClock.reads).toBe(1);
    expect(rec.calls).toEqual(expectedDraw(frames, 500));
    expect(sched.pending()).toBe(1);
    stop();
  });

  it("does not draw or requeue if the clock stops the loop during a tick", () => {
    const rec = createRecordingContext();
    const sched = manualScheduler();
    const stop = startCoachLoop(rec.ctx, canvas, () => dance.frames, () => {
      stop();
      return songMs(0);
    }, sched);

    sched.runFrame();
    expect(rec.calls).toEqual([]);
    expect(sched.pending()).toBe(0);
  });

  it("setup, cleanup, setup (Strict Mode) leaves one loop active", () => {
    const rec = createRecordingContext();
    const sched = manualScheduler();
    const oldClock = manualClock(0);
    const newClock = manualClock(500);
    const other: TemplateFrame[] = [{ tMs: songMs(0), segments: { torso: [1, 0] } }];

    const stopFirst = startCoachLoop(rec.ctx, canvas, () => dance.frames, oldClock.get, sched);
    stopFirst();
    startCoachLoop(rec.ctx, canvas, () => other, newClock.get, sched);
    expect(sched.pending()).toBe(1);

    sched.runFrame();
    expect(oldClock.reads).toBe(0);
    expect(newClock.reads).toBe(1);
    expect(rec.calls).toEqual(expectedDraw(other, 500));
    expect(sched.pending()).toBe(1);
  });
});

describe("CoachCanvas", () => {
  it("renders a canvas without touching the clock during render", () => {
    const clock = manualClock(0);
    const html = renderToStaticMarkup(<CoachCanvas dance={dance} getSongTimeMs={clock.get} />);
    expect(html).toContain("<canvas");
    expect(html).toContain('width="360"');
    expect(html).toContain('height="480"');
    expect(clock.reads).toBe(0);
  });
});
