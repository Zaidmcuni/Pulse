# Scoring check on real dancers (#87, input for #112)

Measured 2026-11-21 on `toufic/scoring-tune` (from `main` at `c7aa9b0`), CONFIG unchanged (`toleranceDeg` 30, window −240/+120 ms, rating 0.85/0.65/0.4, level 85/70/50, `pointsAccFloor` 0.4).

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

| Case | Points | Share of perfect |
| --- | ---: | ---: |
| Perfect follower | 2,182 | 100% |
| Follows, leaves at half | 2,158 | 99% |
| Standing still | 1,622 | 74% |
| Wrong dance | 1,520 | 70% |
| Empty frame | 974 | 45% |

The other dances are similar: leaves at half 99–101%, still 69–74%, empty 45–46%.

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
2. **Points barely separate good from bad, and an empty room earns points (#85).** Two causes in `session.ts`:
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
| P1 | **#85:** pay no points while nobody is tracked. Hold the last confident accuracy for a few seconds only (a new `CONFIG` key, e.g. `trackingHoldSec: 3`, or reuse `accRollingSec`). After that, and before the first confident frame of the run, the points delta is 0. A short occlusion still never costs points. | Mohamed (`session.ts`), team (`config.ts`), spec note on FR-30 | **Do before freeze.** FR-30 currently says "hold the last confident acc", with no limit. This narrows it. |
| P2 | `pointsAccFloor` 0.4 → 0.2. On Tip Toe a still body would get ~64% of a perfect run's points instead of 74%. | Team (`config.ts`), Mohamed's tests | Optional. The effort-first design is intentional, and a still person also has a lower HR. Decide after the live runs. |
| P3 | `toleranceDeg`, `rating` and `level` stay as they are. | — | Keep. Revisit `level.gold` only if a seated live run lands in silver. |
| P4 | Shift template times by −100 ms to remove the extraction lag. | Toufic (`public/dances/`) | **Not before freeze**, unless live runs show on-beat dancers scoring low. It helps dancers who are early and hurts those who are late. |

## Live runs (#87): to fill in Chrome on the demo laptop

Use simulated HR unless a watch is connected. Note the browser version and the device. The ready screen waits for a person, so for the empty run open `/dance/dance4/play` directly and step out.

| Dance | Profile / mode | Run | Accuracy % | Level | Points | Beats P/G/O/M | HR source | Browser, device | Notes |
| --- | --- | --- | ---: | --- | ---: | --- | --- | --- | --- |
| Tip Toe | standing | good (follow the coach) | | | | | | | |
| Tip Toe | standing | bad on purpose (random moves) | | | | | | | |
| Tip Toe | standing | standing still | | | | | | | |
| Tip Toe | standing | empty frame | | | | | | | |
| Tip Toe | Jules Roy, seated | good | | | | | | | |
| Tip Toe | Jules Roy, seated | bad on purpose | | | | | | | |
| On The Floor | standing | good | | | | | | | |
| On The Floor | standing | bad on purpose | | | | | | | |

**Pass if:**
- standing good is at least one level above bad;
- seated good is in the same level as standing good;
- the empty run earns ≈ 0 points (fails today, see P1).
