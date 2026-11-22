/**
 * Owner: Mohamed
 * Purpose: unit tests for session.ts (pure dance session engine).
 * FRs: FR-07, FR-28, FR-29, FR-30, FR-31, FR-35, FR-37
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { perfMs, songMs, type PlayerProfile, type ScoreSample } from "../types/pulse";
import { FAKE_DANCE } from "../mocks/fakeDance";
import { CONFIG, LM } from "../config";
import { assertSessionResult } from "../contracts/validators";
import * as bestWindow from "../clip/bestWindow";
import { effortPerSecond, kcalPerMinute, pointsDelta } from "./effort";
import { NO_WATCH_EFFORT, createDanceSession, resultHasHeartRate, type BeatRating, type DanceSession } from "./session";
import { STANDING_STILL } from "../screens/dev/scoringCheck";
import { hrBadgeText } from "../screens/dance/danceHud";

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
    // #85: the last score is at 2.97 s, so at 6 s it is past CONFIG.trackingHoldSec and accuracy drops to 0.
    expect(r.samples.slice(3).map((x) => [x.tSec, x.accuracy])).toEqual([[4, 1], [5, 1], [6, 0]]);
    const emitted = r.beats.map((b) => b.index);
    for (let i = 7; i < 12; i++) expect(emitted).not.toContain(i); // beats 3.5–6 s
    expect(emitted).toContain(0);
  });
});

describe("tracking hold (#85, FR-30)", () => {
  const holdMs = CONFIG.trackingHoldSec * 1000;

  it("a loss shorter than the hold keeps the points rate", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 4000, () => 1);
    feedScores(s, 4000, 4000 + holdMs - 500, () => null);
    feedScores(s, 4000 + holdMs - 500, 20000, () => 1);
    play(s, 20000, 150);
    const res = s.finish(opts(true));
    const full = pointsDelta(effortPerSecond(150, p), 1);
    expect(res.samples).toHaveLength(20);
    for (const x of res.samples) {
      expect(x.accuracy).toBe(1);
      expect(x.points).toBeCloseTo(full, 10);
    }
  });

  it("a loss longer than the hold earns 0 points and 0 accuracy, but effort and calories still record", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 4000, () => 1);
    feedScores(s, 4000, 20000, () => null);
    play(s, 20000, 150);
    const caloriesBefore = s.hud(perfMs(20000)).caloriesKcal;
    const res = s.finish(opts(true));
    const lastScoreMs = 3993; // feedScores step is 33 ms
    for (const x of res.samples) {
      const tracked = x.tSec * 1000 - lastScoreMs < holdMs;
      expect(x.points > 0).toBe(tracked);
      expect(x.accuracy).toBe(tracked ? 1 : 0);
      expect(x.effort).toBeCloseTo(effortPerSecond(150, p), 10);
      expect(x.heartRate).toBe(150);
    }
    expect(res.samples.filter((x) => x.points > 0).map((x) => x.tSec)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.hud(perfMs(20000)).accuracyPct).toBe(0);
    expect(caloriesBefore).toBeGreaterThan(1);
    expect(res.totalPoints).toBe(Math.floor(6 * pointsDelta(effortPerSecond(150, p), 1)));
  });

  it("nobody in frame for the whole song earns 0 points", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 20000, () => null);
    play(s, 20000, 150);
    const res = s.finish(opts(true));
    expect(res.samples).toHaveLength(20);
    expect(res.samples.every((x) => x.points === 0 && x.accuracy === 0 && x.effort > 0)).toBe(true);
    expect(res.totalPoints).toBe(0);
    expect(res.accuracyPct).toBe(0);
    expect(res.caloriesKcal).toBeGreaterThan(0);
    expect(() => assertSessionResult(res)).not.toThrow();
  });

  it("a pause does not eat into the hold", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 3000, () => 1);
    s.addHeartRate({ bpm: 150, source: "ble", atMs: perfMs(3000) });
    s.advance(songMs(3000), perfMs(3000));
    s.setPaused(true, perfMs(3000));
    for (let t = 4000; t <= 30000; t += 1000) s.advance(songMs(3000), perfMs(t)); // song clock stops
    s.setPaused(false, perfMs(30000));
    feedScores(s, 3000, 6000, () => null);
    s.addHeartRate({ bpm: 150, source: "ble", atMs: perfMs(31000) });
    const r = s.advance(songMs(5000), perfMs(32000));
    expect(r.samples.map((x) => x.tSec)).toEqual([4, 5]);
    expect(r.samples.every((x) => x.accuracy === 1 && x.points > 0)).toBe(true);
  });

  it("practice accuracy drops to 0 after the hold too", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.seek(songMs(12000));
    feedScores(s, 12000, 13000, () => 0.95); // last score at 12.99 s
    s.advance(songMs(13000), perfMs(1000));
    expect(s.hud(perfMs(1000)).accuracyPct).toBe(95);
    s.advance(songMs(12990 + holdMs - 100), perfMs(3000));
    expect(s.hud(perfMs(3000)).accuracyPct).toBe(95);
    s.advance(songMs(12990 + holdMs + 100), perfMs(4000));
    expect(s.hud(perfMs(4000)).accuracyPct).toBe(0);
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

  it("with no reading ever (watch mode): effort 0, points 0, source ble, no calories", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 5000, () => 1);
    const r = s.advance(songMs(5000), perfMs(5000));
    for (const x of r.samples) {
      expect(x.effort).toBe(0);
      expect(x.points).toBe(0);
      expect(x.hrSource).toBe("ble");
    }
    const h = s.hud(perfMs(5000));
    expect(h.hrSource).toBe("ble");
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

  it("accuracyPct is the mean of the rated beats' scores (#112)", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    // Beats 0–4 score 1, beats 5–9 score 0.5; the run stops at 5 s, so no later beat is counted.
    feedScores(s, 0, 5000, (t) => (t < 2500 ? 1 : 0.5));
    s.advance(songMs(5000), perfMs(5000));
    const res = s.finish(opts(false));
    expect(res.accuracyPct).toBe(75);
    expect(res.level).toBe(75 >= CONFIG.level.superstar ? "superstar" : 75 >= CONFIG.level.gold ? "gold" : "silver");
  });

  it("beats with nobody tracked past the hold count 0; beats inside the hold are skipped (#112)", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    // Scores 1 until 4.983 s, then nobody. Beats are 500 ms long: beats 0–9 score 1, beats 10–14 end within
    // CONFIG.trackingHoldSec of the last score (skipped), beats 15–39 end after it (count 0).
    feedScores(s, 0, 5000, () => 1);
    feedScores(s, 5000, 20000, () => null);
    const res = s.finish(opts(true));
    const lastScoreMs = 4983;
    const zeroBeats = FAKE_DANCE.beatsMs.filter((_, i) => {
      const end = i + 1 < FAKE_DANCE.beatsMs.length ? FAKE_DANCE.beatsMs[i + 1] : FAKE_DANCE.lengthSec * 1000;
      return i >= 10 && end - lastScoreMs >= CONFIG.trackingHoldSec * 1000;
    }).length;
    expect(zeroBeats).toBe(25);
    expect(res.accuracyPct).toBeCloseTo((10 / (10 + zeroBeats)) * 100, 1);
  });

  it("accuracyPct is 0 when no beat was rated", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 20000, () => null);
    expect(s.finish(opts(true)).accuracyPct).toBe(0);
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

describe("seek, practice mode, reset, and pause-safe HR", () => {
  it("seek() enters permanent practice mode, zeroes official score/samples/calories, and skips skipped beats while keeping post-seek beat ratings live", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    expect(s.isPracticeMode()).toBe(false);

    // Earn points & calories during first 4 seconds
    s.addHeartRate({ bpm: 150, source: "ble", atMs: perfMs(1000) });
    feedScores(s, 0, 4000, () => 1);
    const preSeek = s.advance(songMs(4000), perfMs(4000));
    expect(preSeek.samples).toHaveLength(4);
    expect(s.hud(perfMs(4000)).points).toBeGreaterThan(0);
    expect(s.hud(perfMs(4000)).caloriesKcal).toBeGreaterThan(0);

    // Forward seek to 12,000 ms (beats are at 0, 500, 1000, ... 19500)
    s.seek(songMs(12_000));
    expect(s.isPracticeMode()).toBe(true);
    expect(s.hud(perfMs(4500)).points).toBe(0);
    expect(s.hud(perfMs(4500)).caloriesKcal).toBe(0);

    // Feed post-seek scores in [12000, 13000) and advance to 13000 ms
    feedScores(s, 12_000, 13_000, () => 0.95);
    const postSeek = s.advance(songMs(13_000), perfMs(5500));
    expect(postSeek.samples).toEqual([]); // practice mode accrues zero official samples
    // Only beats >= 12000 ms that completed by 13000 ms (12000 and 12500) should fire — no skipped beats [8..23]!
    expect(postSeek.beats.map((b) => b.index)).toEqual([24, 25]);
    expect(s.hud(perfMs(5500)).points).toBe(0);
    expect(s.hud(perfMs(5500)).caloriesKcal).toBe(0);
    expect(s.hud(perfMs(5500)).accuracyPct).toBeGreaterThan(0);

    const res = s.finish(opts(true));
    expect(res.totalPoints).toBe(0);
    expect(res.caloriesKcal).toBe(0);
    expect(res.durationSec).toBe(0);
    expect(res.samples).toEqual([]);
  });

  it("rewind seek repositions nextBeat backwards so repeated sections still show live beat pop-ups", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.addHeartRate({ bpm: 145, source: "simulated", atMs: perfMs(1000) });
    feedScores(s, 0, 15_000, () => 0.9);
    s.advance(songMs(15_000), perfMs(15_000));

    // Rewind to 4,000 ms -> beat index 8 (4000 ms) should be next
    s.seek(songMs(4_000));
    feedScores(s, 4_000, 5_000, () => 1);
    const rewound = s.advance(songMs(5_000), perfMs(16_000));
    expect(rewound.beats.map((b) => b.index)).toEqual([8, 9]);
  });

  it("reset() exits practice mode and restores official scoring cleanly", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.addHeartRate({ bpm: 150, source: "ble", atMs: perfMs(1000) });
    s.seek(songMs(5_000));
    expect(s.isPracticeMode()).toBe(true);

    s.reset();
    expect(s.isPracticeMode()).toBe(false);
    expect(s.hud(perfMs(2000)).points).toBe(0);

    s.addHeartRate({ bpm: 150, source: "ble", atMs: perfMs(3000) });
    feedScores(s, 0, 3_000, () => 1);
    const res = s.finish(opts(true));
    expect(res.samples).toHaveLength(20);
    expect(res.totalPoints).toBeGreaterThan(0);
  });

  it("pause freezes points/calories/samples even while 1 Hz HR continues arriving, and re-baselines HR age on resume", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.addHeartRate({ bpm: 155, source: "ble", atMs: perfMs(1000) });
    feedScores(s, 0, 2_000, () => 1);
    s.advance(songMs(2_000), perfMs(2_000));
    const beforePause = s.hud(perfMs(2_000));
    expect(beforePause.points).toBeGreaterThan(0);

    // Case 1: pause for 15 seconds while 1 Hz HR readings continue arriving
    s.setPaused(true, perfMs(2_000));
    for (let sec = 3; sec <= 17; sec++) {
      const now = perfMs(sec * 1000);
      s.addHeartRate({ bpm: 162, source: "ble", atMs: now });
      s.addFrameScore(songMs(2_500), 1); // ignored while paused
      const adv = s.advance(songMs(sec * 1000), now);
      expect(adv.samples).toEqual([]);
      expect(adv.beats).toEqual([]);
    }
    const duringPause = s.hud(perfMs(17_000));
    expect(duringPause.points).toBe(beforePause.points);
    expect(duringPause.caloriesKcal).toBe(beforePause.caloriesKcal);
    expect(duringPause.bpm).toBe(162);
    expect(duringPause.hrState).toBe("live");

    // Case 2: unpause, then test a 20 s pause where NO HR arrives so hrDropHoldSec (10 s) would otherwise expire
    s.setPaused(false, perfMs(17_500));
    s.addHeartRate({ bpm: 148, source: "ble", atMs: perfMs(18_000) });
    s.setPaused(true, perfMs(19_000)); // HR is 1 s old when pause starts
    expect(s.hud(perfMs(35_000)).hrState).toBe("live");

    // Resume 20 seconds later without any intermediate HR packets
    s.setPaused(false);
    feedScores(s, 2_000, 3_000, () => 1);
    const resumed = s.advance(songMs(3_000), perfMs(39_000));
    expect(resumed.samples).toHaveLength(1);
    expect(resumed.samples[0].tSec).toBe(3);
    expect(resumed.samples[0].heartRate).toBe(148);
    expect(s.hud(perfMs(39_000)).hrState).toBe("live");
    // Only 1 second of calories accrued on the resumed sample (no 20 s spike)
    expect(s.hud(perfMs(39_000)).caloriesKcal - beforePause.caloriesKcal).toBeLessThan(0.5);
  });
});

describe("setBaselineHr (FR-29)", () => {
  /** One second of song with a 129.5 bpm reading; returns the emitted sample. */
  function oneSecond(s: DanceSession) {
    s.addHeartRate({ bpm: 129.5, source: "ble", atMs: perfMs(1000) });
    return s.advance(songMs(1000), perfMs(1000)).samples[0];
  }

  it("uses the baseline as restingHr for effort", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setBaselineHr(100);
    const sample = oneSecond(s);
    const expected = effortPerSecond(129.5, { ...p, restingHr: 100 });
    expect(sample.effort).toBeCloseTo(expected, 10);
    expect(sample.effort).toBeLessThan(effortPerSecond(129.5, p));
  });

  it("leaves calories unchanged", () => {
    const plain = createDanceSession(FAKE_DANCE, p);
    const withBaseline = createDanceSession(FAKE_DANCE, p);
    withBaseline.setBaselineHr(100);
    oneSecond(plain);
    oneSecond(withBaseline);
    expect(withBaseline.hud(perfMs(1000)).caloriesKcal).toBe(plain.hud(perfMs(1000)).caloriesKcal);
    expect(plain.hud(perfMs(1000)).caloriesKcal).toBeCloseTo(kcalPerMinute(129.5, p) / 60, 1);
  });

  it("ignores NaN and 0, and keeps the baseline across reset()", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setBaselineHr(NaN);
    s.setBaselineHr(0);
    expect(oneSecond(s).effort).toBeCloseTo(effortPerSecond(129.5, p), 10);

    s.setBaselineHr(100);
    s.reset();
    expect(oneSecond(s).effort).toBeCloseTo(effortPerSecond(129.5, { ...p, restingHr: 100 }), 10);
  });
});

describe("setNoWatch (FR-29)", () => {
  it("accuracy 1 for 5 s -> pointsScale x 0.8 each second; no heart rate, effort or calories", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setNoWatch(true);
    feedScores(s, 0, 5000, () => 1);
    const { samples } = s.advance(songMs(5000), perfMs(5000));
    expect(samples).toHaveLength(5);
    for (const x of samples) {
      expect(x.points).toBeCloseTo(CONFIG.pointsScale * NO_WATCH_EFFORT * 1, 10);
      expect(x.hrSource).toBe("none");
      expect(x.effort).toBe(0);
      expect(x.heartRate).toBe(0);
    }
    expect(NO_WATCH_EFFORT).toBe(0.8);
    const h = s.hud(perfMs(5000));
    expect(h).toMatchObject({ hrSource: "none", bpm: null, hrState: "none", caloriesKcal: 0 });
    const res = s.finish(opts(false));
    expect(res.caloriesKcal).toBe(0);
    expect(resultHasHeartRate(res)).toBe(false);
  });

  it("accuracy 0 -> 0 points (no floor)", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setNoWatch(true);
    feedScores(s, 0, 5000, () => 0);
    for (const x of s.advance(songMs(5000), perfMs(5000)).samples) expect(x.points).toBe(0);
  });

  it("ignores heart-rate readings for scoring, and is kept across reset()", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setNoWatch(true);
    s.reset();
    feedScores(s, 0, 5000, () => 1);
    play(s, 5000, 150);
    for (const x of s.finish(opts(false)).samples) {
      expect(x).toMatchObject({ hrSource: "none", effort: 0, heartRate: 0 });
      expect(x.points).toBeCloseTo(CONFIG.pointsScale * NO_WATCH_EFFORT, 10);
    }
    expect(s.hud(perfMs(5000))).toMatchObject({ hrSource: "none", bpm: null, hrState: "none", caloriesKcal: 0 });
  });

  it("resultHasHeartRate is true for a normal watch result", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 5000, () => 1);
    play(s, 5000, 130);
    expect(resultHasHeartRate(s.finish(opts(false)))).toBe(true);
  });
});

describe("watch mode before the first reading (FR-06)", () => {
  it("first reading at 2.5 s: samples 1 and 2 are ble with heartRate 0; HUD says Waiting for watch", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    feedScores(s, 0, 4000, () => 1);
    const early = s.advance(songMs(2000), perfMs(2000)).samples;
    expect(early).toHaveLength(2);
    for (const x of early) expect(x).toMatchObject({ hrSource: "ble", heartRate: 0, effort: 0 });
    const h = s.hud(perfMs(2000));
    expect(h).toMatchObject({ hrSource: "ble", bpm: null, hrState: "none" });
    expect(hrBadgeText(h.hrSource, h.hrState)).toBe("Waiting for watch");

    s.addHeartRate({ bpm: 120, source: "ble", atMs: perfMs(2500) });
    const later = s.advance(songMs(3000), perfMs(3000)).samples;
    expect(later[0]).toMatchObject({ tSec: 3, hrSource: "ble", heartRate: 120 });
    const res = s.finish(opts(false));
    expect(res.samples.some((x) => x.hrSource === "none")).toBe(false);
    expect(resultHasHeartRate(res)).toBe(true);
  });
});

describe("still detection and status (#112)", () => {
  const ASPECT = 16 / 9;
  const STILL = STANDING_STILL;
  /** Wrists swing a whole shoulder span every 100 ms: clearly dancing. */
  const moving = (t: number) => STILL.map((pt, j) =>
    j === LM.lWrist || j === LM.rWrist ? { ...pt, x: pt.x + (Math.floor(t / 100) % 2 ? 0.1 : -0.1) } : pt);

  /** Real-time run: a frame every 33 ms (score + optional pose), HR each second, advance each frame. */
  function run(s: DanceSession, toMs: number, pose: ((t: number) => typeof STILL) | null, score: number | null = 1, fromMs = 0) {
    const samples: ScoreSample[] = [], beats: BeatRating[] = [];
    for (let t = fromMs + 33; t <= toMs; t += 33) {
      if (Math.floor(t / 1000) !== Math.floor((t - 33) / 1000)) s.addHeartRate({ bpm: 140, source: "ble", atMs: perfMs(t) });
      s.addFrameScore(songMs(t), score);
      if (pose) s.addPose(songMs(t), pose(t), ASPECT);
      const r = s.advance(songMs(t), perfMs(t));
      samples.push(...r.samples);
      beats.push(...r.beats);
    }
    return { samples, beats };
  }

  it("a still dancer while the coach moves: 0 points and no beats from the 2nd second", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    const { samples, beats } = run(s, 10_000, () => STILL);
    expect(samples[0].points).toBeGreaterThan(0); // 1st low second still counts (holdSec = 2)
    expect(samples.slice(CONFIG.still.holdSec - 1).every((x) => x.points === 0)).toBe(true);
    expect(Math.max(...beats.map((b) => b.index))).toBeLessThan(4); // nothing ending after 2 s
    expect(s.hud(perfMs(10_000)).status).toBe("still");
  });

  it("still beats count 0 in the final accuracy", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    run(s, 20_000, () => STILL);
    // Beats 0–2 (ending by 1.5 s) score 1; the other 37 beats are still -> 0.
    expect(s.finish(opts(true)).accuracyPct).toBe(round1Pct(3 / 40));
  });

  it("also gives 0 points without a watch", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setNoWatch(true);
    const { samples } = run(s, 5000, () => STILL);
    expect(samples.slice(1).every((x) => x.points === 0)).toBe(true);
    expect(samples.slice(1).every((x) => x.accuracy === 0)).toBe(true);
    expect(s.hud(perfMs(5000)).accuracyPct).toBe(0);
  });

  it("does not restore a still dancer's accuracy or points when the camera briefly loses them", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.setNoWatch(true);
    run(s, 2500, () => STILL);
    expect(s.hud(perfMs(2500)).status).toBe("still");
    const { samples } = s.advance(songMs(4000), perfMs(4000));
    expect(samples).toHaveLength(2);
    expect(samples.every((x) => x.accuracy === 0 && x.points === 0)).toBe(true);
    expect(s.hud(perfMs(4000)).status).toBe("still");
    run(s, 6500, moving, 1, 4000);
    expect(s.hud(perfMs(6500))).toMatchObject({ status: "dancing", accuracyPct: 100 });
  });

  it("mutes still poses in practice and recovers when the dancer moves", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    s.seek(songMs(1000));
    const stay = run(s, 4000, () => STILL, 1, 1000);
    expect(stay.samples).toEqual([]);
    expect(stay.beats.every((b) => b.index < 5)).toBe(true); // suppressed starting with the beat ending at 3 s
    expect(s.hud(perfMs(4000))).toMatchObject({ status: "still", accuracyPct: 0, points: 0 });
    const resume = run(s, 6500, moving, 1, 4000);
    expect(resume.beats.length).toBeGreaterThan(0);
    expect(s.hud(perfMs(6500))).toMatchObject({ status: "dancing", accuracyPct: 100, points: 0 });
  });

  it("a moving dancer scores normally", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    const { samples, beats } = run(s, 10_000, moving);
    expect(samples.every((x) => x.points > 0)).toBe(true);
    expect(beats).toHaveLength(19); // beats ending by 9.5 s
    expect(s.hud(perfMs(10_000)).status).toBe("dancing");
    expect(s.hud(perfMs(10_000)).debug.dancerMotion!).toBeGreaterThan(CONFIG.still.dancerMin);
  });

  it("never calling addPose behaves as before: still rule off", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    const { samples, beats } = run(s, 10_000, null);
    expect(samples.every((x) => x.points > 0)).toBe(true);
    expect(beats).toHaveLength(19);
    expect(s.hud(perfMs(10_000)).status).toBe("dancing");
    expect(s.hud(perfMs(10_000)).debug.dancerMotion).toBeNull();
  });

  it("the still streak ends as soon as the dancer moves again", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    run(s, 5000, (t) => (t <= 3000 ? STILL : moving(t)));
    expect(s.hud(perfMs(5000)).status).toBe("dancing");
  });

  it("reports no-player and paused", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    run(s, 5000, () => STILL, null);
    expect(s.hud(perfMs(5000)).status).toBe("no-player");
    s.setPaused(true, perfMs(5000));
    expect(s.hud(perfMs(5000)).status).toBe("paused");
  });

  it("the HUD debug carries the last beat's score and rating", () => {
    const s = createDanceSession(FAKE_DANCE, p);
    run(s, 2000, null, 0.7);
    const d = s.hud(perfMs(2000)).debug;
    expect(d.lastBeatScore).toBeCloseTo(0.7, 9);
    expect(d.lastBeatRating).toBe("good");
  });

  it("rates beats and points identically after a stall across stillness, motion and tracking loss", () => {
    const realtime = createDanceSession(FAKE_DANCE, p);
    const stalled = createDanceSession(FAKE_DANCE, p);
    realtime.setNoWatch(true);
    stalled.setNoWatch(true);
    const samples: ScoreSample[] = [], beats: BeatRating[] = [];
    for (let t = 33; t < 10_000; t += 33) {
      const pose = t < 3000 ? STILL : moving(t);
      for (const s of [realtime, stalled]) {
        s.addFrameScore(songMs(t), t < 6000 ? 1 : null);
        if (t < 6000) s.addPose(songMs(t), pose, ASPECT);
      }
      const emitted = realtime.advance(songMs(t), perfMs(t));
      samples.push(...emitted.samples);
      beats.push(...emitted.beats);
    }
    const tail = realtime.advance(songMs(10_000), perfMs(10_000));
    samples.push(...tail.samples);
    beats.push(...tail.beats);
    expect(samples[1].points).toBe(0); // still
    expect(samples[3].points).toBeGreaterThan(0); // moving
    expect(samples[9].points).toBe(0); // beyond the tracking hold
    expect(stalled.advance(songMs(10_000), perfMs(10_000))).toEqual({ samples, beats });
    expect(stalled.finish(opts(false)).accuracyPct).toBe(realtime.finish(opts(false)).accuracyPct);
  });
});

const round1Pct = (x: number): number => Math.round(x * 1000) / 10;
