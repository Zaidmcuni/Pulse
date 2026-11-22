/**
 * Owner: Toufic
 * Purpose: #87 coach-vs-template table from offline MediaPipe Heavy landmarks of the source videos (dev only).
 *          Runs only when PULSE_SCORING_CHECK_DIR points at the output of dance-sources/tools/export_scored_landmarks.py:
 *          PULSE_SCORING_CHECK_DIR=$TMPDIR/scoring-check npx vitest run src/screens/dev/scoringCheck.heavy.test.ts
 * FRs: FR-27, FR-28, NFR-08
 */

import { describe, expect, it, vi } from "vitest";
import type { Dance, PlayerProfile, PosturalMode } from "../../types/pulse";
import { songMs } from "../../types/pulse";
import { CONFIG } from "../../config";
import { parseDance } from "../../contracts/validators";
import { emptyFrame, follower, randomMover, runScoringCheck, STANDING_STILL, stillPose, type CameraPose, type SourcePoses } from "./scoringCheck";
import d1 from "../../../public/dances/dance1.json";
import d2 from "../../../public/dances/dance2.json";
import d3 from "../../../public/dances/dance3.json";
import d4 from "../../../public/dances/dance4.json";

// What-if runs only: CONFIG is a mutable copy in this file, so a variant can try another tolerance. The app's CONFIG is untouched.
vi.mock("../../config", async (importOriginal) => {
  const actual: typeof import("../../config") = await importOriginal();
  return { ...actual, CONFIG: { ...actual.CONFIG } };
});
const mutableConfig = CONFIG as { toleranceDeg: number };
const BASE_TOLERANCE_DEG = CONFIG.toleranceDeg;

const DIR: string | undefined = import.meta.env.PULSE_SCORING_CHECK_DIR;
const DANCES: Dance[] = [d1, d2, d3, d4].map((d) => parseDance(d));
const PROFILE: PlayerProfile = {
  id: "check", handle: "check", displayName: "Check", age: 25, sex: "other", weightKg: 70, heightCm: 175,
  restingHr: 65, mode: "standing", groupIds: [],
};
const HR_BPM = 140;

async function loadSources(): Promise<SourcePoses[]> {
  const src: SourcePoses[] = [];
  for (const d of DANCES) {
    // The export stores each point as [x, y, visibility] to stay small.
    const mod: { default: Omit<SourcePoses, "frames"> & { frames: ([number, number, number][] | null)[] } } =
      await import(/* @vite-ignore */ `${DIR}/${d.id}.json`);
    const j = mod.default;
    src.push({ ...j, frames: j.frames.map((f) => f && f.map(([x, y, v]) => ({ x, y, v }))) });
  }
  return src;
}

describe.runIf(DIR)("scoring check on Heavy landmarks (#87)", () => {
  it("prints the coach-vs-template table", async () => {
    const src = await loadSources();
    const rows: string[] = ["| Dance | Mode | Case | accuracyPct | Level | Points | Live acc | Null frames | Beats P/G/O/M/none |", "|---|---|---|---:|---|---:|---:|---:|---|"];
    const out: Record<string, number> = {};
    DANCES.forEach((dance, k) => {
      const s = src[k];
      // Wrong dance: the next dance's poses, looped so they cover the whole song (no empty tail).
      const w = src[(k + 1) % src.length];
      const wrong: CameraPose = (t) => follower(w)(t % (w.frames.length * w.frameMs));
      const cases: [string, CameraPose][] = [
        ["perfect follower", follower(s)],
        ["late 0.25 s", follower(s, 250)],
        ["late 0.5 s", follower(s, 500)],
        ["late 1 s", follower(s, 1000)],
        ["early 0.5 s", follower(s, -500)],
        [`wrong dance (${DANCES[(k + 1) % DANCES.length].id})`, wrong],
        ["random moves", randomMover(s.width / s.height)],
        ["standing still", stillPose(STANDING_STILL)],
        ["empty frame", emptyFrame],
        ["follows, leaves at half", (t) => (t < dance.lengthSec * 500 ? follower(s)(t) : null)],
      ];
      for (const mode of ["standing", "seated"] as PosturalMode[]) {
        for (const [name, cam] of cases) {
          const r = runScoringCheck(dance, cam, { mode, profile: { ...PROFILE, mode }, hrBpm: HR_BPM, width: s.width, height: s.height, frameMs: s.frameMs });
          out[`${dance.id}|${mode}|${name.split(" (")[0]}`] = r.accuracyPct;
          const b = r.beats;
          rows.push(`| ${dance.id} | ${mode} | ${name} | ${r.accuracyPct} | ${r.level} | ${r.totalPoints} | ${r.meanLiveAccuracyPct} | ${r.nullFramePct}% | ${b.perfect}/${b.good}/${b.ok}/${b.miss}/${b.none} |`);
        }
      }
    });
    console.log(rows.join("\n"));
    for (const d of DANCES) expect(out[`${d.id}|standing|perfect follower`]).toBeGreaterThan(out[`${d.id}|standing|wrong dance`]);
  }, 120_000);

  it("checks all four dances with separate render and scoring clocks", async () => {
    const src = await loadSources();
    // Model a 30 ms output-clock lead plus the configured camera offset.
    const timing = { renderLeadMs: 30 + CONFIG.camDelaySec * 1000 };
    const rows = ["| Dance | Mode | Case | Accuracy | Level | Points | P/G/O/M/none |",
      "|---|---|---|---:|---|---:|---|"];
    function record(dance: Dance, mode: PosturalMode, label: string, r: ReturnType<typeof runScoringCheck>): void {
      const b = r.beats;
      rows.push(`| ${dance.id} | ${mode} | ${label} | ${r.accuracyPct} | ${r.level} | ${r.totalPoints} | ${b.perfect}/${b.good}/${b.ok}/${b.miss}/${b.none} |`);
    }
    for (const [k, dance] of DANCES.entries()) {
      const s = src[k];
      const w = src[(k + 1) % src.length];
      const wrongPose = follower(w);
      const wrong: CameraPose = (t) => wrongPose(t % (w.frames.length * w.frameMs));
      const perfect = follower(s);
      for (const mode of ["standing", "seated"] as const) {
        const opts = { mode, profile: { ...PROFILE, mode }, hrBpm: HR_BPM, width: s.width, height: s.height, frameMs: s.frameMs, timing };
        const full = (label: string, cam: CameraPose) => {
          const result = runScoringCheck(dance, cam, opts);
          record(dance, mode, label, result);
          return result;
        };
        const delayedFollower = follower(s, 1000);
        const good = full("late 1 s", delayedFollower);
        const wrongRun = full("wrong dance", wrong);
        const random = full("random moves", randomMover(s.width / s.height));
        const still = full("still", stillPose(STANDING_STILL));
        const empty = full("empty", emptyFrame);
        const perfectRun = full("perfect", perfect);
        const left = full("leaves at half", (t) => t < dance.lengthSec * 500 ? perfect(t) : null);
        expect(good.accuracyPct).toBeGreaterThanOrEqual(CONFIG.level.gold);
        expect(wrongRun.level).toBe("bronze");
        expect(random.level).toBe("bronze");
        expect(still.totalPoints).toBeLessThan(perfectRun.totalPoints * 0.01);
        expect(empty).toMatchObject({ totalPoints: 0, accuracyPct: 0, beats: { none: dance.beatsMs.length } });
        expect(perfectRun.totalPoints).toBeGreaterThan(wrongRun.totalPoints * 2);
        expect(left.level).toBe("bronze");
        expect(left.totalPoints / perfectRun.totalPoints).toBeCloseTo(0.5, 1);

        const noWatch = { ...opts, noWatch: true };
        const goodMoves = runScoringCheck(dance, delayedFollower, noWatch);
        const wrongMoves = runScoringCheck(dance, wrong, noWatch);
        record(dance, mode, "late 1 s (no watch)", goodMoves);
        record(dance, mode, "wrong dance (no watch)", wrongMoves);
        expect(goodMoves.accuracyPct).toBe(good.accuracyPct);
        expect(wrongMoves.accuracyPct).toBe(wrongRun.accuracyPct);
        expect(goodMoves.totalPoints).toBeGreaterThan(wrongMoves.totalPoints);
        expect(runScoringCheck(dance, emptyFrame, noWatch).totalPoints).toBe(0);

        if (k === 0) {
          const opening = { ...noWatch, durationMs: 29_000 };
          const old = runScoringCheck(dance, perfect, { ...opening, timing: { ...timing, useRenderClock: true } });
          const aligned = runScoringCheck(dance, perfect, opening);
          const openingWrong = runScoringCheck(dance, wrong, opening);
          const openingEmpty = runScoringCheck(dance, emptyFrame, opening);
          record(dance, mode, "opening perfect (render clock)", old);
          record(dance, mode, "opening perfect", aligned);
          record(dance, mode, "opening wrong dance", openingWrong);
          record(dance, mode, "opening empty", openingEmpty);
          expect(aligned.level).toBe("superstar");
          expect(aligned.totalPoints).toBeGreaterThan(openingWrong.totalPoints);
          expect(openingEmpty).toMatchObject({ totalPoints: 0, accuracyPct: 0 });
        }
      }
    }
    console.log(rows.join("\n"));
  }, 120_000);

  // The tolerance variants change the standing curve only; seated rows always use CONFIG.seatedCurve.
  it("prints what-if variants (template shift, tolerance)", async () => {
    const src = await loadSources();
    const variants: { name: string; shiftMs: number; toleranceDeg: number }[] = [
      { name: "current", shiftMs: 0, toleranceDeg: BASE_TOLERANCE_DEG },
      { name: "templates -100 ms", shiftMs: -100, toleranceDeg: BASE_TOLERANCE_DEG },
      { name: "tolerance 25", shiftMs: 0, toleranceDeg: 25 },
      { name: "tolerance 20", shiftMs: 0, toleranceDeg: 20 },
      { name: "templates -100 ms, tolerance 25", shiftMs: -100, toleranceDeg: 25 },
    ];
    const caseNames = ["perfect", "late 0.25 s", "late 0.5 s", "early 0.25 s", "wrong dance", "standing still"];
    const rows = [`| Variant | Mode | ${caseNames.join(" | ")} |`, `|---|---|${caseNames.map(() => "---:").join("|")}|`];
    for (const v of variants) {
      mutableConfig.toleranceDeg = v.toleranceDeg;
      for (const mode of ["standing", "seated"] as PosturalMode[]) {
        const sums = caseNames.map(() => 0);
        DANCES.forEach((d, k) => {
          const dance: Dance = { ...d, frames: d.frames.map((f) => ({ ...f, tMs: songMs(f.tMs + v.shiftMs) })).filter((f) => f.tMs >= 0) };
          const s = src[k];
          const cams: CameraPose[] = [follower(s), follower(s, 250), follower(s, 500), follower(s, -250), follower(src[(k + 1) % src.length]), stillPose(STANDING_STILL)];
          cams.forEach((cam, c) => {
            sums[c] += runScoringCheck(dance, cam, { mode, profile: { ...PROFILE, mode }, hrBpm: HR_BPM, width: s.width, height: s.height, frameMs: s.frameMs }).accuracyPct;
          });
        });
        rows.push(`| ${v.name} | ${mode} | ${sums.map((x) => (x / DANCES.length).toFixed(1)).join(" | ")} |`);
      }
    }
    mutableConfig.toleranceDeg = BASE_TOLERANCE_DEG;
    console.log("Mean accuracyPct over the 4 dances\n" + rows.join("\n"));
    expect(rows.length).toBe(2 + variants.length * 2);
  }, 300_000);
});
