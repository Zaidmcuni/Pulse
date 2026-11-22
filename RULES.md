# PULSE — Team Rules

Everyone, and every AI coding assistant, follows this file. It exists so that 4 people can build in parallel and have their code fit together on the first try.

All paths are relative to the repo root (the `PULSE` folder, which is the app). `Description.md` and `Detailed-Tasks.md` are in `Details/`.

**Order of authority:** `Details/Description.md` (what we build) → `RULES.md` (how we build it) → `src/types/pulse.ts` and `src/config.ts` (the code contract). Who does what: `Details/Detailed-Tasks.md`. Your current task: `CURRENT-TASK.md` (from `TASK.md`). If they disagree, stop and ask in the team chat. Don't guess.

---

## 1. Ownership

You only edit files you own. Need a change elsewhere? Ask the owner, or open a PR they review.

| Owner | Files | Screens (routes) |
| --- | --- | --- |
| **Zaid** (camera runtime + audio clock) | `src/vision/poseEngine.ts`, `src/vision/oneEuroFilter.ts`, `src/vision/backgroundLock.ts`, `src/vision/poseRecorder.ts`, `src/vision/SkeletonOverlay.tsx`, `src/audio/songPlayer.ts` | `/dance/:id/ready` (`src/screens/dance/GetReady.tsx`) |
| **Toufic** (segment math, coach, dances) | `src/vision/segments.ts` (+ test), `src/coach/`, `src/clip/`, `public/dances/` | `/dev/extract` (`src/screens/dev/ExtractTool.tsx`) |
| **Mohamed** (scoring, heart rate, integration) | `src/scoring/` (+ tests), `src/hr/` (+ tests), app shell and router (`src/main.tsx`, `src/App.tsx`) | `/profile/setup`, `/watch`, `/dance/:id/play` (`src/screens/setup/`, `src/screens/dance/DancePlay.tsx`) |
| **Ali** (data and social) | `src/data/` (+ tests), `public/seed/` | `/dances`, `/results/:resultId`, `/feed`, `/me`, `/groups`, `/groups/:id` (`src/screens/social/`) |
| **Shared** (change = team ping + every affected owner agrees) | `src/types/pulse.ts`, `src/config.ts`, `src/contracts/`, `src/mocks/`, `package.json`, `tsconfig*.json`, `RULES.md` | — |

Every file in `src/` already exists with its owner, purpose, FRs and **locked signature** in a header comment. Implement the bodies; add new files only inside folders you own.

---

## 2. Contracts

**The code is the contract.** Every type that crosses a module boundary is in `src/types/pulse.ts`; every exported function already exists in its file with its final signature (the body throws `NotImplementedError` until implemented). Do not restate signatures from memory: open the file.

### 2.1 The pipeline (the only way modules connect)

```
Webcam / video file
  -> startPose(video, onRawFrame)              Zaid    vision/poseEngine.ts   emits RawPoseLandmarks
  -> computePoseFrame(raw, mode)               Toufic  vision/segments.ts     returns PoseFrame (mirrored)
  -> player.heardSongTimeMs(raw.tFrameMs)      Zaid    audio/songPlayer.ts    returns SongTimeMs
  -> scoreFrame(frame, tSong, dance, mode)     Mohamed scoring/accuracy.ts    returns 0..1 | null
Heart rate
  -> monitor.subscribe(reading)                Mohamed hr/heartRate.ts        HrReading each second
  -> effortPerSecond + pointsDelta             Mohamed scoring/effort.ts
End of dance
  -> store.saveResult(result) -> /results/:id  Mohamed -> Ali
Templates
  -> ExtractTool: startPose on a video file -> extractSegments(mirror: false) -> parseDance -> public/dances/<id>.json   Toufic
```

The extract tool reuses Zaid's `startPose` and Toufic's `extractSegments`, so templates and live frames go through **the same code**. There is no second implementation of MediaPipe setup or segment math anywhere.

### 2.2 How mismatches are made impossible

| Risk | What stops it |
| --- | --- |
| Wrong argument types or a renamed function | `tsc` in strict mode: the build fails. Signatures exist now, so callers compile against them from minute one. |
| Mixing camera time and song time | Branded types: `PerfTimeMs` (performance.now) and `SongTimeMs` (song file time) are different types. Passing one as the other doesn't compile. Convert only with `player.heardSongTimeMs()`; wrap raw numbers only with `perfMs()` / `songMs()` at the source. |
| Wrong landmark order | `SCORED_LANDMARK_INDICES` and `LM` in `config.ts` define the 12-point order once. `assertLandmarks` checks length 12. |
| Mirroring or aspect-ratio bugs | `SEGMENT_ENDPOINTS`, `LM_MIRROR`, `SEGMENT_MIRROR`, `MODE_SEGMENTS` in `config.ts` + golden tests with hand-computed answers in `src/mocks/fixtures.ts`. |
| Bad data crossing a boundary (non-unit vectors, wrong segments for the mode, unsorted frames, bad dance file) | Validators in `src/contracts/validators.ts`. `parseDance` runs on every dance file at load. |
| Private data leaking into posts | `assertFeedPost` allows only the listed keys. |
| "It works with my mock but not theirs" | Mocks in `src/mocks/` implement the same interfaces (`Store`, `HeartRateMonitor`) and are themselves checked by `src/contracts/contracts.test.ts`. |

**Golden tests** (`src/contracts/contracts.test.ts`): a fixed test pose with known correct outputs. A stub that still throws `NotImplementedError` is skipped; once you implement your function it must pass. Never edit the goldens to make your code pass: if you believe a golden is wrong, stop and tell the team.

### 2.3 Conventions

| Topic | Rule |
| --- | --- |
| **Time** | Camera frames and heart rate: `PerfTimeMs`. Song, templates, beats, scoring: `SongTimeMs`. Scoring loop updates once per whole second of song time |
| **Units in names** | `Ms`, `Sec`, `Kg`, `Cm`, `Bpm`, `Pct` suffixes. Angles: degrees in `config.ts`, radians inside math |
| **Landmarks** | Always the 12 points in `SCORED_LANDMARK_INDICES` order. `l`/`r` = the dancer's own left/right (MediaPipe convention). No person detected: still emit a frame with every point at `v = 0` |
| **Segment vectors** | 2D unit vectors in **pixel space** (x × width, y × height, then normalize). y points down |
| **Mirroring** | Only `computePoseFrame` mirrors (x → 1 − x, swap left/right via `LM_MIRROR`). Templates (`extractSegments` with `mirror: false`) never are |
| **Missing data** | An unusable segment is **absent** from the map, never `null` or `[0, 0]`. `scoreFrame` returns `null` when tracking is uncertain |
| **Percentages** | `accuracy` is 0..1 in code; `accuracyPct` is 0..100 for display only |
| **Heart rate** | Integer BPM; every reading carries its `source` (`"ble"` or `"simulated"`) |
| **Dances** | One file per dance: `public/dances/<id>.json` + audio, listed in `public/dances/index.json`. Loaded into memory by `store.init()`; never stored in localStorage |
| **Privacy** | `FeedPost` never contains age, sex, weight, height or heart rate. Live pose camera frames are discarded immediately; raw webcam video for the side-by-side highlight preview/export is retained **only in transient in-memory browser RAM** during the current tab session (never persisted to `localStorage`, never automatically saved to disk, never transmitted over the network), and users explicitly choose whether to include body landmarks or share/download the clip |

### 2.4 Tuning numbers

Every threshold lives in `CONFIG` in `src/config.ts`. **Never hard-code one in a module.** Changing a value = team ping (it changes everyone's results).

```typescript
export const CONFIG = {
  visibilityMin: 0.55,          // skip segment below this
  uncertainUsableRatio: 0.5,    // tracking uncertain below this share of segments
  toleranceDeg: 30,             // segment score reaches 0 at this error
  matchWindowMs: { before: 240, after: 120 },
  camDelaySec: 0.045,
  oneEuro: { minCutoffHz: 1.0, beta: 0.03, dCutoffHz: 1.0 },
  backgroundJump: 0.35,         // share of screen width
  rating: { perfect: 0.85, good: 0.65, ok: 0.4 },
  level: { superstar: 85, gold: 70, silver: 50 },
  accRollingSec: 2,
  pointsScale: 10,
  pointsAccFloor: 0.4,          // points = scale x effort x (floor + (1 - floor) x acc)
  restingHrDefault: 65,
  hrDropHoldSec: 10,
  clipLengthSec: 15,
  clipFps: 12,
  forYou: { lookback: 3, upPct: 80, downPct: 50 },
} as const;
```

---

## 3. Coding standards

- TypeScript strict. No `any`, no `@ts-ignore`. Import shared types from `src/types/pulse.ts`; never redefine them.
- Scoring, effort, For you and leaderboard logic are **pure functions** with unit tests.
- No network calls at runtime. Everything is loaded from `public/`.
- No new npm dependency without a team ping.
- Every module starts with a header comment: owner, purpose, FR ids covered.
- Small functions, plain names, comments only where the *why* isn't obvious.
- UI text follows the tone rules: encouraging, no shaming. "Simulated" and "estimated" labels where the spec says.

---

## 4. Git workflow

1. Branch from `main`: `<name>/<task>` (e.g. `zaid/pose-engine`, `ali/catalogue`).
2. Commit small and often. Message: `[FR-27] score frames against template window`.
3. Before a PR: `git pull origin main`, then `npm run typecheck`, `npm test` and `npm run build` pass locally.
4. PR into `main` using the template below. Someone else glances at it; the owner of any touched shared file must approve.
5. `main` must always build and run. Never push directly to `main`, never `--force`.
6. Feature freeze **Sunday 9:30 AM**. Final push well before **12:00 PM**.

### PR template

```
What:        one sentence
FRs:         FR-xx, FR-yy
Contract:    no changes  |  changed X (pinged team, approved by …)
How to test: steps someone else can follow
Mocks:       still using mock of … / now real
```

---

## 5. Definition of done

A task is done only when all of these are true:

- [ ] Meets the FR's acceptance criterion (Requirements tab / Description.md)
- [ ] No locked signature, type or golden changed; `npm run typecheck` passes
- [ ] Your golden tests in `src/contracts/contracts.test.ts` pass (no longer skipped)
- [ ] Outputs crossing a boundary go through the matching validator in your tests
- [ ] Works with the mocks **and** with the real modules already merged
- [ ] Pure logic has unit tests; `npm run build` and `npm test` pass
- [ ] Merged to `main` through a PR

---

## 6. AI coding assistant rules

Paste this block at the start of every AI session, then add your task.

```
You are helping build PULSE. Read Details/Description.md, RULES.md and CURRENT-TASK.md first.
Scope rules, follow them strictly:
1. I am <NAME>. Only create or edit files in the folders I own (RULES.md section 1).
   If a change is needed elsewhere, stop and tell me instead of doing it.
2. Never modify src/types/pulse.ts, src/config.ts, src/contracts/, src/mocks/, package.json
   or any exported signature. The stubs in my files already have the final signatures:
   implement the bodies only. Never edit golden tests to make code pass.
3. Implement only the task I give you and the FR ids I name. No extra features,
   screens, settings, refactors or "improvements" outside that task.
4. Every threshold comes from CONFIG in src/config.ts. Never invent or hard-code numbers.
5. No new dependencies, no backend, no network calls, no LLM/API calls, no analytics.
6. Follow the conventions table (PerfTimeMs vs SongTimeMs, landmark order, pixel-space vectors,
   mirroring only in computePoseFrame, absent-not-null, units in names, privacy).
   Run npm run typecheck and npm test before reporting.
7. If Details/Description.md is unclear or seems to conflict with the task, stop and ask me.
   Do not guess product decisions.
8. Write unit tests for pure functions. Keep code simple and commented with FR ids.
My task is described in CURRENT-TASK.md. Do only that.
```

### Out of scope — never build these, even if asked by an assistant's suggestion

Several people on one camera · in-dance difficulty adaptation (Easier/Harder) · turn-taking or Shared Chorus · Apple Watch, WHOOP/Garmin cloud APIs · backend, accounts, login · calories in points · persisted or uploaded camera footage · recommendation engine beyond the For you rule · paid features.

---

## 7. Talking to each other

- Blocked more than 30 minutes? Say it in the chat and keep working against the mock.
- Changing anything shared? Post: what, why, who's affected. Wait for those owners' OK.
- Found a bug in someone else's module? Tell them with steps to reproduce. Don't fix it in their folder.
