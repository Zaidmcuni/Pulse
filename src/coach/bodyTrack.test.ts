/**
 * Owner: Toufic
 * Purpose: body track sidecar validation and song-time sampling (#97)
 * FRs: FR-26
 */
import { describe, expect, it } from "vitest";
import { songMs } from "../types/pulse";
import { loadBodyTrack, parseBodyTrack, sampleBodyTrack, type BodyTrack } from "./bodyTrack";
import { BODY_TRACK_INDICES, LOOK } from "./coach3d";

const N = BODY_TRACK_INDICES.length;
const frame = (x: number): number[] => Array.from({ length: N * 3 }, (_, i) => (i % 3 === 0 ? x : 0.1));

function track(tMs: number[]): BodyTrack {
  return {
    version: 1, danceId: "d", indices: [...BODY_TRACK_INDICES], tMs,
    root: tMs.map((_, i) => [i * 0.1, 0.9]), world: tMs.map((_, i) => frame(i)), vis: tMs.map(() => Array(N).fill(1)),
  };
}

describe("parseBodyTrack", () => {
  it("accepts a well-formed track", () => {
    expect(parseBodyTrack(track([0, 40, 80]), "d")).not.toBeNull();
  });

  it.each([
    ["another dance", (t: BodyTrack) => ({ ...t, danceId: "x" })],
    ["wrong indices", (t: BodyTrack) => ({ ...t, indices: t.indices.slice(1) })],
    ["unsorted times", (t: BodyTrack) => ({ ...t, tMs: [0, 80, 40] })],
    ["short world frame", (t: BodyTrack) => ({ ...t, world: [frame(0).slice(1), ...t.world.slice(1)] })],
    ["NaN", (t: BodyTrack) => ({ ...t, root: [[Number.NaN, 0], ...t.root.slice(1)] })],
    ["missing vis", (t: BodyTrack) => ({ ...t, vis: t.vis.slice(1) })],
  ])("rejects %s", (_, bad) => {
    expect(parseBodyTrack(bad(track([0, 40, 80])), "d")).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseBodyTrack(null, "d")).toBeNull();
    expect(parseBodyTrack("x", "d")).toBeNull();
  });
});

describe("sampleBodyTrack", () => {
  const t = track([0, 40, 80, 1000]);

  it("interpolates between frames, root included, at the home depth", () => {
    const p = sampleBodyTrack(t, songMs(20))!;
    expect(p.world[0][0]).toBeCloseTo(0.5);
    expect(p.root[0]).toBeCloseTo(0.05);
    expect(p.root[2]).toBe(LOOK.homeZ);
  });

  it("depends only on the time asked (seeks and pauses are safe)", () => {
    const a = sampleBodyTrack(t, songMs(60));
    sampleBodyTrack(t, songMs(900));
    expect(sampleBodyTrack(t, songMs(60))).toEqual(a);
  });

  it("holds briefly past the ends, then returns null", () => {
    expect(sampleBodyTrack(t, songMs(-100))?.world[0][0]).toBe(0);
    expect(sampleBodyTrack(t, songMs(-400))).toBeNull();
    expect(sampleBodyTrack(t, songMs(1200))?.world[0][0]).toBe(3);
    expect(sampleBodyTrack(t, songMs(1400))).toBeNull();
  });

  it("returns null in the middle of a long gap and holds near its edges", () => {
    expect(sampleBodyTrack(t, songMs(500))).toBeNull();
    expect(sampleBodyTrack(t, songMs(150))?.world[0][0]).toBe(2);
    expect(sampleBodyTrack(t, songMs(950))?.world[0][0]).toBe(3);
  });
});

describe("loadBodyTrack", () => {
  it("returns null when the file is missing or the fetch fails", async () => {
    const notFound = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await loadBodyTrack("d", notFound)).toBeNull();
    expect(await loadBodyTrack("d", broken)).toBeNull();
  });

  it("parses a served track", async () => {
    const ok = (async () => new Response(JSON.stringify(track([0, 40])))) as unknown as typeof fetch;
    expect(await loadBodyTrack("d", ok)).not.toBeNull();
  });
});
