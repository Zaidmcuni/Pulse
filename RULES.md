# PULSE — Team Rules

Everyone, and every AI coding assistant, follows this file. It exists so that 4 people can build in parallel and have their code fit together on the first try.

All paths are relative to the repo root (the `PULSE` folder, which is the app). `Description.md` and `Detailed-Tasks.md` are in `Details/`.

**Order of authority:** `Details/Description.md` (what we build) → `RULES.md` (how we build it) → `src/types/pulse.ts` and `src/config.ts` (the code contract). Who does what: `Details/Detailed-Tasks.md`. Your current task: `CURRENT-TASK.md` (from `TASK.md`). If they disagree, stop and ask in the team chat. Don't guess.

---

## 1. Ownership

You only edit files you own. Need a change elsewhere? Ask the owner, or open a PR they review.

| Owner | Folders / files | Screens (routes) |
| --- | --- | --- |
| **Zaid** | `src/vision/`, `src/scoring/accuracy.ts` | — (provides `SkeletonOverlay`) |
| **Toufic** | `src/audio/`, `src/coach/`, `src/clip/`, `scripts/extract/`, `public/dances/` | — (provides `CoachCanvas`) |
| **Mohamed** | `src/hr/`, `src/scoring/effort.ts`, `src/mocks/`, app shell and router | `/profile/setup`, `/watch`, `/dance/:id/ready`, `/dance/:id/play` |
| **Ali** | `src/data/`, `public/seed/` | `/dances`, `/results/:resultId`, `/feed`, `/me`, `/groups`, `/groups/:id` |
| **Shared** (change = team ping + every affected owner agrees) | `src/types/pulse.ts`, `src/config.ts`, `package.json`, `RULES.md` | — |

Screens live in `src/screens/setup/` and `src/screens/dance/` (Mohamed) and `src/screens/social/` (Ali). Every file in `src/` already exists as a skeleton with its owner, purpose and FRs in a header comment: code in those files, and add new files only inside folders you own. The only hand-off between screens: the dance screen calls `store.saveResult(result)` then navigates to `/results/:resultId`.

---

## 2. Contracts

Code against these signatures exactly. Until the real module is merged, use the mock from `src/mocks/`.

```typescript
// vision/poseEngine.ts (Zaid)
startPose(video: HTMLVideoElement, mode: PosturalMode, onFrame: (f: PoseFrame) => void): () => void  // returns stop()
// vision/SkeletonOverlay.tsx (Zaid)
SkeletonOverlay(props: { frame: PoseFrame | null }): JSX.Element
// scoring/accuracy.ts (Zaid), pure
scoreFrame(f: PoseFrame, tSongMs: number, dance: Dance, mode: PosturalMode): number | null   // 0..1, null = uncertain
rateBeat(frameScores: number[]): MoveRating
accuracyLevel(pct: number): AccuracyLevel

// audio/songPlayer.ts (Toufic)
createSongPlayer(): SongPlayer
interface SongPlayer {
  load(dance: Dance): Promise<void>; start(): void; pause(): void; resume(): void;
  songTimeMs(): number; heardSongTimeMs(tFrameMs: number): number; onEnd(cb: () => void): void;
}
// coach/CoachCanvas.tsx (Toufic)
CoachCanvas(props: { dance: Dance; getSongTimeMs: () => number }): JSX.Element

// hr/heartRate.ts (Mohamed)
createBleMonitor(): HeartRateMonitor
createSimulatedMonitor(): HeartRateMonitor
interface HeartRateMonitor {
  connect(): Promise<void>; disconnect(): void;
  subscribe(cb: (r: HrReading) => void): () => void;
  status(): "live" | "disconnected" | "simulated";
}
// scoring/effort.ts (Mohamed), pure
effortPerSecond(bpm: number, p: PlayerProfile): number
pointsDelta(effort: number, acc: number): number
kcalPerMinute(bpm: number, p: PlayerProfile): number

// data/store.ts (Ali): the ONLY code that touches localStorage
export const store: Store   // full interface in src/data/store.ts, frozen after Step 0
```

### Conventions (where integration bugs come from)

| Topic | Rule |
| --- | --- |
| **Time: camera frames** | `tFrameMs` = `performance.now()` domain, from `requestVideoFrameCallback` |
| **Time: song** | `tSongMs` / template `tMs` = milliseconds from the start of the song audio file. Convert frames with `songPlayer.heardSongTimeMs(tFrameMs)` only |
| **Time: scoring loop** | Points and effort update once per second of song time |
| **Units in names** | `Ms`, `Sec`, `Kg`, `Cm`, `Bpm`, `Pct` suffixes. Angles: degrees in `config.ts`, radians inside math |
| **Segment vectors** | 2D unit vectors in **pixel space**: multiply MediaPipe x by frame width and y by frame height *before* normalizing. Image coordinates, y points down |
| **Mirroring** | Only the live user is mirrored (x → 1 − x, swap left/right). Templates are never mirrored |
| **Missing data** | A segment that isn't usable is **absent** from `segments`, never `null` or `[0, 0]`. `scoreFrame` returns `null` when tracking is uncertain |
| **Percentages** | `accuracy` is 0..1 in code; `accuracyPct` is 0..100 for display only |
| **Heart rate** | Integer BPM; every reading carries its `source` (`"ble"` or `"simulated"`) |
| **Privacy** | `FeedPost` never contains age, sex, weight, height or heart rate. Camera frames are never stored |

### Tuning numbers

Every threshold lives in `src/config.ts`. **Never hard-code one in a module.** Changing a value = team ping (it changes everyone's results).

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
  restingHrDefault: 65,
  hrDropHoldSec: 10,
  clipLengthSec: 15,
  clipFps: 12,
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
3. Before a PR: `git pull origin main`, then `npm run build` and `npm test` pass locally.
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
- [ ] Matches the contract signatures and conventions above
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
2. Never modify src/types/pulse.ts, src/config.ts, package.json or another
   module's exported signatures. Use the contracts in RULES.md section 2 exactly.
3. Implement only the task I give you and the FR ids I name. No extra features,
   screens, settings, refactors or "improvements" outside that task.
4. Every threshold comes from CONFIG in src/config.ts. Never invent or hard-code numbers.
5. No new dependencies, no backend, no network calls, no LLM/API calls, no analytics.
6. Follow the conventions table (time domains, pixel-space vectors, mirroring,
   absent-not-null, units in names, privacy).
7. If Details/Description.md is unclear or seems to conflict with the task, stop and ask me.
   Do not guess product decisions.
8. Write unit tests for pure functions. Keep code simple and commented with FR ids.
My task is described in CURRENT-TASK.md. Do only that.
```

### Out of scope — never build these, even if asked by an assistant's suggestion

Several people on one camera · in-dance difficulty adaptation (Easier/Harder) · turn-taking or Shared Chorus · Apple Watch, WHOOP/Garmin cloud APIs · backend, accounts, login · calories in points · camera footage of any kind · recommendation engine beyond the For you rule · paid features.

---

## 7. Talking to each other

- Blocked more than 30 minutes? Say it in the chat and keep working against the mock.
- Changing anything shared? Post: what, why, who's affected. Wait for those owners' OK.
- Found a bug in someone else's module? Tell them with steps to reproduce. Don't fix it in their folder.
