/**
 * Owner: Mohamed
 * Purpose: unit tests for session.ts (pure dance session engine).
 * FRs: FR-07, FR-28, FR-30, FR-31, FR-35, FR-37
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { perfMs, songMs, type PlayerProfile } from "../types/pulse";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { assertSessionResult } from "../contracts/validators";
import * as bestWindow from "../clip/bestWindow";
import { effortPerSecond, kcalPerMinute, pointsDelta } from "./effort";
import { createDanceSession, type DanceSession } from "./session";

const p: PlayerProfile = {
  id: "p1", handle: "@t", displayName: "T", age: 20, sex: "male", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};
const opts = (completed: boolean) => ({ completed, id: "r1", createdAtIso: "2026-11-21T10:00:00.000Z" });

/** Feeds a score every 33 ms in [fromMs, toMs). */
function feedScores(s: DanceSession, fromMs: number, toMs: number, score: (tMs: number) => number | null) {
  for (let t = fromMs; t < toMs; t += 33) s.addFrameScore(songMs(t), score(t));
}

/** Simulates real time: song time = now, one HR reading per second at that second, advancing every 100 ms. */
function play(s: DanceSession, toMs: number, bpm: number | null) {
  for (let t = 100; t <= toMs; t += 100) {
    if (bpm !== null && t % 1000 === 0) s.addHeartRate({ bpm, source: "ble", atMs: perfMs(t) });
    s.advance(songMs(t), perfMs(t));
  }
}

afterEach(() => vi.restoreAllMocks());

describe("perfect run (FR-30, FR-31, FR-37)", () => {
  it("scores every second and beat, and gives a valid superstar result", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 20000, () => 1);
    const samples = [], beats = [];
    for (let t = 1000; t <= 20000; t += 1000) {
      s.addHeartRate({ bpm: 129.5, source: "ble", atMs: perfMs(t) });
      const r = s.advance(songMs(t), perfMs(t));
      samples.push(...r.samples);
      beats.push(...r.beats);
    }
    const effort = effortPerSecond(129.5, p);
    expect(samples).toHaveLength(20);
    for (const x of samples) {
      expect(x.accuracy).toBe(1);
      expect(x.effort).toBeCloseTo(effort, 10);
      expect(x.heartRate).toBe(129.5);
      expect(x.hrSource).toBe("ble");
    }
    expect(beats).toHaveLength(40);
    expect(beats.every((b) => b.rating === "perfect")).toBe(true);

    const res = s.finish(opts(true));
    expect(res.totalPoints).toBe(Math.floor(20 * pointsDelta(effort, 1)));
    expect(res.accuracyPct).toBe(100);
    expect(res.level).toBe("superstar");
    expect(res.durationSec).toBe(20);
    expect(res.caloriesKcal).toBeCloseTo(Math.round(((20 * kcalPerMinute(129.5, p)) / 60) * 10) / 10, 10);
    expect(res.playerId).toBe("p1");
    expect(res.danceId).toBe(FAKE_DANCE.id);
    expect(() => assertSessionResult(res)).not.toThrow();
  });
});

describe("advance", () => {
  it("is idempotent for the same or earlier time", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 5000, () => 1);
    expect(s.advance(songMs(3000), perfMs(3000)).samples).toHaveLength(3);
    expect(s.advance(songMs(3000), perfMs(3000))).toEqual({ samples: [], beats: [] });
    expect(s.advance(songMs(2000), perfMs(3100))).toEqual({ samples: [], beats: [] });
  });

  it("one big advance emits samples 1–5 and beats 0–9 in order", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 5000, () => 1);
    const r = s.advance(songMs(5000), perfMs(5000));
    expect(r.samples.map((x) => x.tSec)).toEqual([1, 2, 3, 4, 5]);
    expect(r.beats.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("never emits samples beyond dance.lengthSec", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    expect(s.advance(songMs(25000), perfMs(0)).samples).toHaveLength(20);
  });
});

describe("uncertain tracking (FR-28)", () => {
  it("holds the last good accuracy and skips beats with no scores", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 3000, () => 1);
    feedScores(s, 3000, 6000, () => null);
    const r = s.advance(songMs(6000), perfMs(6000));
    expect(r.samples.slice(3).map((x) => [x.tSec, x.accuracy])).toEqual([[4, 1], [5, 1], [6, 1]]);
    const emitted = r.beats.map((b) => b.index);
    for (let i = 7; i < 12; i++) expect(emitted).not.toContain(i); // beats 3.5–6 s
    expect(emitted).toContain(0);
  });
});

describe("heart-rate hold (FR-07)", () => {
  const withOneReading = () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.addHeartRate({ bpm: 150, source: "ble", atMs: perfMs(0) });
    return s;
  };
  const effort = effortPerSecond(150, p);

  it("holds the reading up to exactly 10 s", () => {
    const s = withOneReading();
    const a = s.advance(songMs(1000), perfMs(5000)).samples[0];
    expect(a.effort).toBeCloseTo(effort, 10);
    expect(a.heartRate).toBe(150);
    expect(s.hud(perfMs(5000)).hrState).toBe("holding");
    expect(s.hud(perfMs(5000)).bpm).toBe(150);

    const b = s.advance(songMs(2000), perfMs(10000)).samples[0];
    expect(b.effort).toBeCloseTo(effort, 10);
    expect(s.hud(perfMs(10000)).hrState).toBe("holding");
  });

  it("uses 0 after the hold", () => {
    const s = withOneReading();
    const c = s.advance(songMs(1000), perfMs(10001)).samples[0];
    expect(c.effort).toBe(0);
    expect(c.heartRate).toBe(0);
    expect(c.hrSource).toBe("ble");
    const h = s.hud(perfMs(10001));
    expect(h.hrState).toBe("none");
    expect(h.bpm).toBeNull();
  });

  it("is live within 3 s of a reading", () => {
    const s = withOneReading();
    expect(s.hud(perfMs(0)).hrState).toBe("live");
    expect(s.hud(perfMs(3000)).hrState).toBe("live");
    expect(s.hud(perfMs(3001)).hrState).toBe("holding");
  });

  it("with no reading ever: effort 0, points 0, simulated, no calories", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 5000, () => 1);
    const r = s.advance(songMs(5000), perfMs(5000));
    for (const x of r.samples) {
      expect(x.effort).toBe(0);
      expect(x.points).toBe(0);
      expect(x.hrSource).toBe("simulated");
    }
    const h = s.hud(perfMs(5000));
    expect(h.hrSource).toBe("simulated");
    expect(h.hrState).toBe("none");
    expect(h.bpm).toBeNull();
    expect(h.caloriesKcal).toBe(0);
  });
});

describe("finish (FR-31, FR-35, FR-37)", () => {
  it("quitting early earns no points but keeps time and calories", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 7400, () => 1);
    play(s, 7400, 150);
    const res = s.finish(opts(false));
    expect(res.completed).toBe(false);
    expect(res.totalPoints).toBe(0);
    expect(res.durationSec).toBe(7);
    expect(res.caloriesKcal).toBeGreaterThan(0);
    expect(res.samples.every((x) => x.points > 0)).toBe(true);
    expect(() => assertSessionResult(res)).not.toThrow();
  });

  it("a completed finish advances to the end of the dance", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 20000, () => 1);
    const beats = [];
    for (let t = 100; t <= 19200; t += 100) beats.push(...s.advance(songMs(t), perfMs(t)).beats);
    expect(beats).toHaveLength(38);
    const res = s.finish(opts(true));
    expect(res.durationSec).toBe(20);
    expect(res.samples[19].tSec).toBe(20);
    expect(s.advance(songMs(20000), perfMs(20000)).beats).toEqual([]); // beats 38–39 already emitted by finish
  });

  it("accuracyPct is the mean of all non-null frame scores", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    for (let i = 0; i < 100; i++) s.addFrameScore(songMs(i * 100), i % 2 === 0 ? 1 : 0.5);
    s.addFrameScore(songMs(10000), null);
    const res = s.finish(opts(true));
    expect(res.accuracyPct).toBe(75);
    expect(res.level).toBe("gold");
  });

  it("starts the final 15-second highlight at 15s in a 30-second session", () => {
    const s = createDanceSession({ ...FAKE_DANCE, lengthSec: 30 }, p);
    feedScores(s, 0, 30_000, () => 1);
    for (let second = 1; second <= 30; second++) {
      const now = perfMs(second * 1000);
      s.addHeartRate({ bpm: second <= 15 ? p.restingHr : 150, source: "ble", atMs: now });
      s.advance(songMs(second * 1000), now);
    }
    const result = s.finish(opts(true));
    expect(result.bestWindowStartSec).toBe(15);
    expect(result.samples.at(-1)?.tSec).toBe(30);
  });

  it("bestWindowStartSec is 0 when findBestWindowStartSec throws", () => {
    vi.spyOn(bestWindow, "findBestWindowStartSec").mockImplementation(() => { throw new Error("stub"); });
    const s = createDanceSession(FAKE_DANCE, p);
    expect(s.finish(opts(true)).bestWindowStartSec).toBe(0);
  });

  it("bestWindowStartSec comes from findBestWindowStartSec otherwise", () => {
    vi.spyOn(bestWindow, "findBestWindowStartSec").mockReturnValue(4);
    const s = createDanceSession(FAKE_DANCE, p);
    expect(s.finish(opts(true)).bestWindowStartSec).toBe(4);
  });

  it("returns the same object when called twice", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    const a = s.finish(opts(true));
    expect(s.finish(opts(false))).toBe(a);
  });
});

describe("hud", () => {
  it("points are an integer equal to the floor of the running sum", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 20000, (t) => (t % 2000 < 1000 ? 1 : 0.3));
    let sum = 0;
    for (let t = 1000; t <= 20000; t += 1000) {
      s.addHeartRate({ bpm: 140, source: "simulated", atMs: perfMs(t) });
      for (const x of s.advance(songMs(t), perfMs(t)).samples) sum += x.points;
      const h = s.hud(perfMs(t));
      expect(Number.isInteger(h.points)).toBe(true);
      expect(h.points).toBe(Math.floor(sum));
      expect(h.hrSource).toBe("simulated");
      expect(h.hrState).toBe("live");
      expect(h.bpm).toBe(140);
    }
  });

  it("accuracyPct is 0 before any sample, then the last sample's accuracy × 100", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    expect(s.hud(perfMs(0)).accuracyPct).toBe(0);
    feedScores(s, 0, 2000, () => 0.5);
    s.advance(songMs(2000), perfMs(2000));
    expect(s.hud(perfMs(2000)).accuracyPct).toBe(50);
  });
});
