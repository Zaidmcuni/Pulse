/**
 * Owner: Shared (Step 0)
 * Purpose: 20 s fake dance at 120 BPM, generated in code: both arms alternate straight up / straight out every beat.
 * Valid for parseDance(). Use it until Toufic's real dances land in public/dances/.
 */
import { songMs, type Dance, type SegmentMap, type TemplateFrame } from "../types/pulse";

const BPM = 120, LENGTH_SEC = 20, FPS = 30;
const beatMs = 60000 / BPM;

const up: SegmentMap = {
  l_upper_arm: [0, -1], l_forearm: [0, -1], r_upper_arm: [0, -1], r_forearm: [0, -1], torso: [0, -1],
  l_thigh: [0, 1], r_thigh: [0, 1], l_shin: [0, 1], r_shin: [0, 1],
};
const out: SegmentMap = {
  l_upper_arm: [1, 0], l_forearm: [1, 0], r_upper_arm: [-1, 0], r_forearm: [-1, 0], torso: [0, -1],
  l_thigh: [0, 1], r_thigh: [0, 1], l_shin: [0, 1], r_shin: [0, 1],
};

const frames: TemplateFrame[] = [];
for (let i = 0; i < LENGTH_SEC * FPS; i++) {
  const t = (i * 1000) / FPS;
  frames.push({ tMs: songMs(t), segments: Math.floor(t / beatMs) % 2 === 0 ? up : out });
}

export const FAKE_DANCE: Dance = {
  id: "fake-arms",
  title: "Fake Arms (mock)",
  genre: "test",
  difficulty: "easy",
  lengthSec: LENGTH_SEC,
  bpm: BPM,
  beatsMs: Array.from({ length: LENGTH_SEC * 2 }, (_, i) => songMs(i * beatMs)),
  popularity: 1,
  audioUrl: "/dances/fake-arms.m4a",
  frames,
};
