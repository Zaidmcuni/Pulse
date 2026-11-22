# Scoring check on real dancers (#87, input for #112)

Measured 2026-11-21 on `toufic/scoring-tune` (from `main` at `c7aa9b0`), CONFIG unchanged (`toleranceDeg` 30, window −240/+120 ms, rating 0.85/0.65/0.4, level 85/70/50, `pointsAccFloor` 0.4).

**Updated 2026-11-22 on `toufic/tracking-hold` (#85, P1 applied):** `CONFIG.trackingHoldSec` = 3. Accuracy and levels are unchanged; the points table below is re-run.

## Current numbers: #112 scoring, calibrated (2026-11-22)

Measured on `mohamed/fair-scoring` (PR #126, merged with `main` at `ed4336a`). Mohamed's #112 algorithm: segment score 1 up to `fullScoreDeg`, linear to 0 at `toleranceDeg`; beat score = mean of the beat's best half of frames; accuracy % = mean of beat scores (still beats and beats untracked past the 3 s hold count 0); points = 10 × effort × (`pointsAccFloor` + (1 − floor) × ramp(acc)); standing still while the coach moves earns 0 points and no pop-ups.

Calibrated CONFIG (Toufic): `fullScoreDeg` 10, `toleranceDeg` 40, `pointsAccRamp` 0.45–0.85, `pointsAccFloor` 0.2, `rating` 0.85/0.65/0.40, `level` 85/70/66. Targets agreed with Mohamed: **late 1 s (the stand-in for a good live dancer, see "Live runs" below) is Gold, and the wrong dance is Bronze**. Late 0.5 s at Superstar is fine. Perfect points are at least 2× a wrong-dance run's. Still and empty earn ≈ 0.

Accuracy % and level (standing | seated), 140 bpm. The wrong dance is the next dance's poses, looped over the whole song:

| Case | On The Floor | Don't Call Me Up | Give Me Everything | Tip Toe |
| --- | --- | --- | --- | --- |
| Perfect follower | 98.8 \| 98.1 superstar | 99.0 \| 98.4 superstar | 98.1 \| 96.8 superstar | 98.8 \| 98.0 superstar |
| Late 0.5 s | 92.9 \| 88.3 superstar | 91.3 \| 86.5 superstar | 89.6 superstar \| 84.5 gold | 92.4 \| 88.9 superstar |
| **Late 1 s** | 83.6 \| 76.0 gold | 72.0 gold \| **60.1 bronze** | 75.6 gold \| **67.5 silver** | 80.5 \| 75.0 gold |
| **Wrong dance** | 58.9 \| 49.2 bronze | 63.2 \| 52.5 bronze | 59.8 \| 48.2 bronze | 58.3 \| 47.5 bronze |
| Standing still | 0.3, 11 pts | 0, 13 pts | 0.2, 8 pts | 0.6, 4 pts |
| Empty frame | 0, 0 pts | 0, 0 pts | 0, 0 pts | 0, 0 pts |
| Follows, leaves at half | 49.8 bronze, 51% pts | 49.3 bronze, 51% | 49.4 bronze, 51% | 49.8 bronze, 52% |

- **Points, perfect / wrong dance (standing):** 2.45× / 2.29× / 2.37× / 2.56×. Seated: 3.5–3.9×. A late-1 s run keeps 56–78% of a perfect run's points standing.
- **Misses:** seated late 1 s on Don't Call Me Up (bronze) and Give Me Everything (silver). Standing wrong dance (58–63) overlaps those seated runs (60–68) in every curve tried, so one cut-off can't fix both; standing was favoured.
- **Margins are 2–3 points:** standing wrong dance tops out 2.8 below silver, and standing late 1 s bottoms out 2.0 above gold. The silver band (66–70) is narrow because good and wrong sit only ≈ 9 points apart.
- **Curve sweep** (standing; lowest late 1 s / highest wrong dance): 12/45 74.7 / 66.6 · 10/45 73.4 / 65.0 · **10/40 72.0 / 63.2** · 10/35 70.4 / 61.0 · 8/40 70.5 / 61.4. The curve barely moves the gap, so the level cut-offs do the separating. 4°/22° is too harsh for webcams.
- **Not checked:** live runs on these values, random flailing (no such case here; the wrong dance is harder to tell apart), and webcam jitter against `still.dancerMin` (Mohamed checks this live).

The sections below are the earlier measurements on the old scoring (tolerance 30°, frame-mean accuracy), kept for reference.

## How the offline check works

- **Source poses:** MediaPipe Pose Landmarker **Heavy** on every frame of each source video (`extract_body.py`), cut to the 12 scored points by `tools/export_scored_landmarks.py`. This model is independent of the Lite/Full extraction the templates came from.
- **Perfect follower:** a dancer who copies the coach like a mirror. The webcam shows the source pose mirrored (x → 1 − x, left/right swapped). `computePoseFrame` mirrors it back, so this is the best a camera can see.
- **Pipeline:** `computePoseFrame` → `scoreFrame` → `createDanceSession`, run at the source frame times (≈24 fps). Simulated HR is held at 140 bpm (age 25, resting 65), so points differences come from accuracy only.
- **Cases:**
  - **Late / early:** the follower shows the pose from that long before or after.
  - **Wrong dance:** the next dance's poses on this dance's template.
  - **Standing still:** arms hanging, facing the camera.
  - **Empty frame:** every point at v = 0.
  - **Leaves at half:** follows perfectly, then the room is empty.
- **Code:** `src/screens/dev/scoringCheck.ts` (runner), `scoringCheck.test.ts` (unit tests, always run), `scoringCheck.heavy.test.ts` (this table, runs only with the data):

```bash
PULSE_SCORING_CHECK_DIR=$TMPDIR/scoring-check npx vitest run src/screens/dev/scoringCheck.heavy.test.ts --reporter=verbose
```

**Not simulated:** One Euro smoothing, camera delay, webcam noise or a different body shape. Real runs will score lower than the perfect follower.

## Results (accuracyPct and level of the SessionResult)

| Case | On The Floor | Don't Call Me Up | Give Me Everything | Tip Toe |
| --- | --- | --- | --- | --- |
| Perfect follower, standing | 81.4 gold | 81.0 gold | 79.6 gold | 82.6 gold |
| Perfect follower, seated | 74.8 gold | 75.0 gold | 72.3 gold | 77.6 gold |
| Late 0.25 s | 84.9 gold | 86.0 superstar | 82.5 gold | 85.6 superstar |
| Late 0.5 s | 69.6 silver | 67.7 silver | 63.6 silver | 68.6 silver |
| Late 1 s | 59.3 silver | 47.8 bronze | 52.1 silver | 55.7 silver |
| Early 0.5 s | 58.5 silver | 50.3 silver | 51.6 silver | 56.6 silver |
| Wrong dance | 39.2 bronze | 39.9 bronze | 38.8 bronze | 37.3 bronze |
| Standing still | 34.9 bronze | 39.6 bronze | 39.9 bronze | 44.3 bronze |
| Empty frame | 0 bronze | 0 bronze | 0 bronze | 0 bronze |
| Follows, leaves at half | 83.1 gold | 80.9 gold | 80.4 gold | 83.0 gold |

Offsets, wrong dance and still are standing. Seated versions of the bad cases are bronze too: wrong dance 29–31, still 35–42.

**Points** at the same heart rate, Tip Toe standing:

| Case | Before #85 | Share | After #85 | Share |
| --- | ---: | ---: | ---: | ---: |
| Perfect follower | 2,182 | 100% | 2,182 | 100% |
| Follows, leaves at half | 2,158 | 99% | 1,128 | 52% |
| Standing still | 1,622 | 74% | 1,622 | 74% |
| Wrong dance | 1,520 | 70% | 1,520 | 70% |
| Empty frame | 974 | 45% | 0 | 0% |

After #85 the other dances are similar: leaves at half 51–52%, empty 0 on all four, seated included. The leaves-at-half run keeps its gold level, because `accuracyPct` is the mean of the frames where the dancer was tracked.

**Beat pop-ups**, perfect follower: all Perfect or Good, no Miss. Standing still: mostly OK and Miss, with up to 31 Good a song. Empty frame: no pop-ups, which is correct.

**Mean over the 4 dances, what-if variants** (offline only, CONFIG not changed):

| Variant | Mode | Perfect | Late 0.25 s | Late 0.5 s | Early 0.25 s | Wrong dance | Still |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| current | standing | 81.2 | 84.8 | 67.4 | 61.3 | 38.8 | 39.7 |
| current | seated | 74.9 | 80.4 | 58.3 | 51.8 | 30.6 | 38.9 |
| templates −100 ms | standing | 84.8 | 82.1 | 63.1 | 71.3 | 39.3 | 40.2 |
| templates −100 ms | seated | 80.5 | 76.3 | 54.3 | 62.1 | 31.3 | 39.6 |
| tolerance 25° | standing | 78.0 | 82.1 | 63.6 | 57.3 | 34.9 | 35.5 |
| tolerance 25° | seated | 71.0 | 77.3 | 54.5 | 48.0 | 28.1 | 36.4 |
| tolerance 20° | standing | 73.5 | 78.4 | 58.8 | 52.1 | 30.6 | 30.9 |
| tolerance 20° | seated | 65.7 | 73.0 | 49.9 | 43.5 | 25.2 | 33.4 |

## What it means

1. **Accuracy separates good from bad.** Gold for a perfect follower, bronze for the wrong dance or standing still: two levels apart on every dance, seated included. Seated perfect (72–78) is in the same band as standing (80–83), so NFR-08 holds offline. Seated is only 2–8 points above the gold line, so it needs the live check.
2. **Points barely separate good from bad, and an empty room earned points (#85, fixed by P1).** Two causes in `session.ts` before the fix:
   - Before the first confident frame, the held accuracy is 0. `pointsDelta` still pays the 0.4 floor, so an empty room earns 45–46% of a perfect run.
   - The last confident accuracy is held **forever**. Leaving halfway keeps 99–101% of the points and the gold level.
3. **Tolerance is fine at 30°.** At 25° or 20°, perfect and still drop by the same amount, so the gap stays ≈ 42 points. A seated perfect follower falls out of gold at 20°.
4. **Templates lag the source video by ≈ 80–120 ms.** Template(t) best matches Heavy(t − 120 ms) on three dances and (t − 80 ms) on Give Me Everything. This is likely the old One Euro lag at extraction time (beta 0.03). The coach is drawn from the body tracks, which are on true video time.
   - Effect: a dancer 0.25 s late scores higher than one exactly on time. One 0.25 s early drops to ~61.
   - Real dancers are usually late (reaction plus camera delay), so this helps them today.
5. **Superstar (≥ 85) is out of reach.** Even a perfect follower reaches it only at the best lag, and only on two dances. With real camera noise, expect nobody to get there.

## Proposals for team agreement (not applied)

| # | Change | Owner | Recommendation |
| --- | --- | --- | --- |
| P1 | **#85:** pay no points while nobody is tracked. Hold the last confident accuracy for a few seconds only (a new `CONFIG` key, e.g. `trackingHoldSec: 3`, or reuse `accRollingSec`). After that, and before the first confident frame of the run, the points delta is 0. A short occlusion still never costs points. | Mohamed (`session.ts`), team (`config.ts`), spec note on FR-30 | **Applied** on `toufic/tracking-hold` (#85) with `trackingHoldSec: 3`. FR-30 in `Details/requirements.md` now notes the limit. |
| P2 | `pointsAccFloor` 0.4 → 0.2. On Tip Toe a still body would get ~64% of a perfect run's points instead of 74%. | Team (`config.ts`), Mohamed's tests | Optional. The effort-first design is intentional, and a still person also has a lower HR. Decide after the live runs. |
| P3 | `toleranceDeg`, `rating` and `level` stay as they are. | — | Keep. Revisit `level.gold` only if a seated live run lands in silver. |
| P4 | Shift template times by −100 ms to remove the extraction lag. | Toufic (`public/dances/`) | **Not before freeze**, unless live runs show on-beat dancers scoring low. It helps dancers who are early and hurts those who are late. |

## Live runs (#87)

Measured 2026-11-22 on `toufic/live-runs` (from `main` at `2e32bc1`, CONFIG unchanged) with `npm run build` + `npm run preview`. Toufic danced; the assistant drove the app. Every run: **Chrome 157 on macOS, MacBook built-in webcam, simulated HR.** Profiles: Amira Bell (standing), Jules Roy (seated).

The runs are short (25–55 s from the start of the song) and were ended with Quit. An ended-early result saves `totalPoints` 0, so **Points** is the sum of the per-second samples (equal to the HUD at the end). Accuracy and level are the saved `SessionResult`. Beat pop-ups were counted in the page. The simulated HR climbs the same way in every run, so points differences come from accuracy only.

**Provisional:** Toufic notes that accuracy, stats and points are known to be off for now and Mohamed (#112) is fixing them. Re-run this table after that fix.

| Dance | Profile / mode | Run | Length | Accuracy % | Level | Points | Beats P/G/O/M | HR source | Browser, device | Notes |
| --- | --- | --- | ---: | ---: | --- | ---: | --- | --- | --- | --- |
| Tip Toe | standing | good (follow the coach) | 0:29 | 56.4 | silver | 120 | not counted | simulated | Chrome 157, MacBook webcam | Beat counter added from run 2 |
| Tip Toe | standing | bad on purpose (random moves) | 0:29 | 48.2 | bronze | 111 | 0/6/25/12 | simulated | Chrome 157, MacBook webcam | |
| Tip Toe | standing | standing still | 0:29 | 45.2 | bronze | 109 | 0/2/30/15 | simulated | Chrome 157, MacBook webcam | |
| Tip Toe | standing | empty frame | 0:25 | 35.0 | bronze | 9 | 0/0/0/3 | simulated | Chrome 157, MacBook webcam | Opened `/play` directly. All 9 points are from 0:01–0:04 (walking out, then the 3 s hold); 0 from 0:05 on |
| Tip Toe | standing | dance, cover the camera, leave and come back | 0:55 | 50.1 | silver | 264 | 0/7/44/17 | simulated | Chrome 157, MacBook webcam | #85 / #110 check, below |
| Tip Toe | Jules Roy, seated | good | 0:29 | 66.8 | silver | 119 | 11/17/14/5 | simulated | Chrome 157, MacBook webcam | |
| Tip Toe | Jules Roy, seated | bad on purpose | 0:30 | 39.9 | bronze | 99 | 0/3/21/25 | simulated | Chrome 157, MacBook webcam | |
| On The Floor | standing | good | 0:29 | 30.3 | bronze | 94 | 0/0/5/57 | simulated | Chrome 157, MacBook webcam | Fails: good is bronze |
| On The Floor | standing | bad on purpose | — | — | — | — | — | — | — | Not run (time) |

**Pass if:**
- standing good is at least one level above bad: **Tip Toe pass** (silver 56.4 vs bronze 48.2 and still 45.2, but only 8–11 points apart). **On The Floor fail:** good is bronze (30.3) with 57 Misses in the first 29 s.
- seated good is in the same level as standing good: **pass** (both silver: 66.8 seated, 56.4 standing). Offline both were gold.
- the empty run earns ≈ 0 points: **pass**. 9 points while walking out and during the 3 s hold, then 0 for 20 s.

**#85 hold (live):** in the 0:55 run Toufic covered the camera several times (each < 3 s) and points never stopped. He walked out once: accuracy held its last value for 3 s (0:43–0:45), then accuracy 0 and no points for 0:46–0:48. **Pass.**

**#110 re-acquire (live):** after walking out, he came back and was tracked again within ~1 s (accuracy 64% and points at 0:49). He came back at the **same** spot. Toufic later tested coming back at a **new** spot himself, and it re-acquired: **pass**.

### What it means

1. Live accuracy is well below the offline perfect follower (Tip Toe standing 56 vs 83) and good vs bad is narrow (8–11 points), but on Tip Toe it still crosses one level.
2. **Points don't separate good from bad** (120 / 111 / 109 on Tip Toe standing; 119 / 99 seated). With the same HR, the `pointsAccFloor` 0.4 floor dominates. This is P2; decide with Mohamed after his #112 fix.
3. **On The Floor good scored bronze.** Only the first 29 s were tried. Next: check whether the opening is hard to follow at 130 BPM, or whether the template or offset is off there (re-run the offline perfect follower for 0–30 s only), before touching CONFIG or P4.
4. No CONFIG change is proposed from these runs: they are short, provisional and from one dancer.
