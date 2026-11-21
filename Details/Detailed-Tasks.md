# PULSE — Task split

> Export of the Tasks tab in the team's Claude doc (master copy). FR numbers refer to the Requirements tab. App code lives at the repo root (the `PULSE` folder); all paths below are relative to it.

## 1. How the split works

Each person owns one slice and codes against the typed skeleton already in `src/`: every shared type and every exported function exists with its final signature, so nobody waits for anyone. The vision pipeline is split three ways, so camera, segment math and scoring are built at the same time.

**Principles**

- **The code is the contract:** `src/types/pulse.ts` plus stubs with final signatures. Any mismatch fails `npm run typecheck`.
- **Mocks, not waiting:** fake dance, fake pose stream, simulated heart rate, in-memory store and sample results are all in `src/mocks/`.
- **Same code for templates and live:** the extract tool reuses Zaid's `startPose` and Toufic's `extractSegments`, so template and live vectors can't disagree.
- **Golden tests** prove each module produces the right numbers before integration (`src/contracts/contracts.test.ts`).
- **Demo path first:** Musts before Shoulds. **Ali** gets the self-contained UI work (no camera, audio or Bluetooth).

**Ownership at a glance**

| Person | Owns | Requirements | Builds against | Delivers |
| --- | --- | --- | --- | --- |
| **Zaid** | Camera runtime and audio clock | FR-16 to FR-18, FR-23 to FR-25; FR-22, FR-47 (Should) | His webcam, the fake dance | `poseEngine`, `oneEuroFilter`, `songPlayer`, `SkeletonOverlay`, get-ready screen; `backgroundLock`, `poseRecorder` |
| **Toufic** | Segment math, coach and dances | FR-13 to FR-15, FR-19 to FR-21, FR-26; FR-48 to FR-50 (Should/Could) | Goldens, fake dance, fake pose stream | `segments.ts`, `CoachCanvas`, extract tool, 2–3 real dances; clip replay |
| **Mohamed** | Step 0, scoring, heart rate, integration | Step 0; FR-01 to FR-08, FR-27 to FR-35, FR-37; FR-03 (Should) | Goldens, mocks of every other module | `accuracy.ts`, `effort.ts`, `hr/`, profile and watch screens, dance screen, app shell |
| **Ali** | Catalogue, results and social | FR-09 to FR-12, FR-36, FR-38 to FR-45, FR-51; FR-46, FR-52 (Should) | Seed JSON, memory store, sample results | `data/` store and seed, catalogue, results, post flow, feed, profile page, groups |

## 2. Step 0: shared setup and contracts

The typed skeleton is already in `src/` (types, config, validators, mocks, stubs, golden tests) and compiles under strict TypeScript. Mohamed finishes Step 0 (about 45 min) and pushes it to `main`. Nobody waits: every first task below works without it.

### Step 0 checklist (Mohamed)

- [ ] Scaffold Vite + React + TypeScript at the repo root. When Vite asks about existing files, choose **"Ignore files and continue"** (keep `src/` and the docs)
- [ ] Dependencies: `@mediapipe/tasks-vision` ≥ 0.10.11, `react-router-dom`; dev: `vitest`
- [ ] `tsconfig`: `strict`, `noUnusedLocals`, `noUnusedParameters`. Scripts: `typecheck` (`tsc --noEmit -p .`), `test` (`vitest run`), `build`
- [ ] Copy MediaPipe WASM to `public/wasm/` and `pose_landmarker_lite.task` to `public/models/`; create `public/dances/index.json` (`[]`) and `public/seed/`
- [ ] App shell: `src/main.tsx` + `src/App.tsx` with a route for every screen below and the bottom nav (Feed / Dances / Groups / Profile); call `await store.init()` before rendering
- [ ] `npm run typecheck`, `npm test` (mock tests pass, the rest skipped) and `npm run build` all green; push to `main`; post "Step 0 is in, branch from main"

### Folders and owners

```
PULSE/  (repo root)
  AGENTS.md  CLAUDE.md  RULES.md  TASK.md  CURRENT-TASK.md (local)
  Details/                Description.md, Detailed-Tasks.md, requirements.md, BrainStorming.zip
  src/
    types/pulse.ts  config.ts  contracts/  mocks/     shared: change = team ping
    vision/poseEngine, oneEuroFilter, backgroundLock,
           poseRecorder, SkeletonOverlay              Zaid
    audio/songPlayer                                  Zaid
    vision/segments (+ test)                          Toufic
    coach/  clip/                                     Toufic
    scoring/  hr/                                     Mohamed
    data/                                             Ali
    screens/dance/GetReady                            Zaid
    screens/dev/ExtractTool                           Toufic
    screens/setup/, screens/dance/DancePlay           Mohamed
    screens/social/                                   Ali
  public/models/ public/wasm/      Step 0
  public/dances/                   Toufic
  public/seed/                     Ali
```

### Routes

| Route | Screen | Owner |
| --- | --- | --- |
| `/profile/setup` | Profile setup | Mohamed |
| `/watch` | Watch connect | Mohamed |
| `/dances` | Catalogue (Popular, For you) | Ali |
| `/dance/:id/ready` | Get ready | Zaid |
| `/dance/:id/play` | Dance | Mohamed |
| `/results/:resultId` | Results + Post | Ali |
| `/feed` | Feed | Ali |
| `/me` | Profile page | Ali |
| `/groups`, `/groups/:id` | Groups, leaderboard, meetups | Ali |
| `/dev/extract` | Template extract tool (dev only) | Toufic |

### Contracts

The code is the contract: open the file, the signature is there. `RULES.md` section 2 explains the pipeline, the branded time types (`PerfTimeMs` vs `SongTimeMs`), validators and goldens. The only way modules connect:

```
startPose(video, raw => {                                    // Zaid
  const frame = computePoseFrame(raw, profile.mode);         // Toufic
  const tSong = player.heardSongTimeMs(raw.tFrameMs);        // Zaid
  const score = scoreFrame(frame, tSong, dance, profile.mode); // Mohamed
});
monitor.subscribe(r => /* each second */ pointsDelta(effortPerSecond(r.bpm, profile), acc)); // Mohamed
store.saveResult(result); navigate(`/results/${result.id}`);  // Mohamed -> Ali
```

## 3. Task lists

In order: do them top to bottom. **Must** items are the demo; start **Should** items only when all your Musts pass. Every task is "done" only when its golden tests pass (not skipped) and `npm run typecheck` is green.

### Zaid: camera runtime and audio clock

**Must**

- [ ] **`initPoseLandmarker`:** lite model + WASM from local files; assert `visibility` is a number; FPS ≥ 24 on the demo laptop (FR-16, NFR-01)
- [ ] **`startPose`:** `requestVideoFrameCallback` loop; 12 landmarks in `SCORED_LANDMARK_INDICES` order; One Euro smoothing via `createOneEuroSmoother`; no person = frame with every `v = 0`; fills `mediaTimeSec`; must also work on a `<video>` playing a file. **Merge this first: Toufic's extract tool uses it** (FR-17, FR-18)
- [ ] **`songPlayer.ts`:** Web Audio load/start/pause/resume, `songTimeMs`, `heardSongTimeMs` via `getOutputTimestamp` + `CONFIG.camDelaySec` with fallback, `onEnd` (FR-24, FR-25)
- [ ] **`SkeletonOverlay` + get-ready screen:** camera preview, skeleton, Start → `/dance/:id/play` (FR-23)
- [ ] **Tune** One Euro on real bodies; with Toufic, check coach and music stay together for a whole song (NFR-02)

**Should**

- [ ] Background lock (FR-22)
- [ ] `poseRecorder` for the highlight clip (FR-47)

### Toufic: segment math, coach and dances

**Must**

- [ ] **`segments.ts`:** `extractSegments` + `computePoseFrame` using `SEGMENT_ENDPOINTS`, `LM_MIRROR`, `MODE_SEGMENTS`; all 5 segment goldens pass (FR-19 to FR-21). Needs nothing: start now
- [ ] **`CoachCanvas`:** silhouette from the template frame at the current song time, interpolated, built against the fake dance (FR-26)
- [ ] **Extract tool (`/dev/extract`):** video file + BPM + first-beat offset + metadata → `startPose` (use `fakePoseStream` until Zaid's lands) → `extractSegments(mirror: false)` → `parseDance` → download `<id>.json`; audio via `ffmpeg -i video.mp4 -vn -c:a copy <id>.m4a` (FR-13 to FR-15)
- [ ] **Pick 2–3 Just Dance solo videos** (clean, front-facing, upper-body-heavy) and ship the **first real dance** to `public/dances/` + `index.json` as early as possible
- [ ] Remaining 1–2 dances

**Should**

- [ ] Highlight clip: best 15 s window (FR-48), 9:16 silhouette replay reusing the coach drawing code (FR-49)

**Could**

- [ ] Clip export with `MediaRecorder` (FR-50)

### Mohamed: Step 0, scoring, heart rate, integration

**Must**

- [ ] **Step 0** (section 2)
- [ ] **`scoring/accuracy.ts`:** `scoreFrame`, `rollingAccuracy`, `rateBeat`, `accuracyLevel`; accuracy goldens pass + own tests (FR-27, FR-28, FR-31)
- [ ] **`scoring/effort.ts` + `hr/`:** `maxHeartRate`, TRIMP `effortPerSecond`, `pointsDelta`, Keytel `kcalPerMinute`; `parseHeartRate`; BLE monitor (from `hr-test.html`, verified with the WHOOP) + simulated monitor (FR-04 to FR-08, FR-29, FR-32)
- [ ] **Profile setup and watch connect screens** (FR-01, FR-02)
- [ ] **Dance screen:** the pipeline above; per beat a rating pop-up; per second points, holding the last good accuracy when uncertain; 10 s heart-rate hold; HUD, Pause/spacebar, quit-early rule, save `SessionResult`, go to results (FR-30, FR-33 to FR-35, FR-37)
- [ ] **Swap mocks for real modules** at each checkpoint; run the full demo twice in a row (NFR-11)

**Should**

- [ ] Profile switcher (FR-03)

### Ali: catalogue, results and social

**Must**

- [ ] **Seed data JSON:** 5–6 profiles, 3 groups (friends: "McGill Friday Night Crew"; city: Montreal; dance type: hip-hop), 8–10 posts, 2–3 meetups, past results for leaderboards, all matching the types
- [ ] **`data/store.ts`:** every `Store` method on localStorage; `init()` loads the seed on first run and every dance in `/dances/index.json` through `parseDance` (dances stay in memory, never in localStorage); results through `assertSessionResult`, posts through `assertFeedPost` (FR-51)
- [ ] **`forYou.ts` + `leaderboard.ts`** with unit tests (FR-12, FR-44)
- [ ] **Catalogue screen:** cards, difficulty sort/filter, Popular, For you (FR-09 to FR-12)
- [ ] **Results screen:** completed view and quit-early view (time and calories only, no Post) (FR-35, FR-36)
- [ ] **Post flow:** pick groups, calories and clip toggles off by default (FR-38)
- [ ] **Feed with kudos, profile page** (FR-39 to FR-41)
- [ ] **Groups:** list, join/leave, group feed, weekly leaderboard, meetups with RSVP (FR-42 to FR-45)

**Should**

- [ ] Badges (FR-46); seed one profile that already has On Fire
- [ ] Reset demo data (FR-52)
- [ ] Repo README: point to Description.md, tech stack, how to run, AI-assistance disclosure (SR-08)

## 4. Checkpoints

| Phase | Zaid | Toufic | Mohamed | Ali |
| --- | --- | --- | --- | --- |
| 1. Start | MediaPipe test page | Segment math, goldens pass | Step 0 scaffold, shell, model files | Seed data JSON |
| 2. Build vs mocks | Pose engine, smoother, song player | Coach canvas, extract tool, dance 1 | Accuracy, effort, heart rate, setup screens | Store, catalogue, results, post flow |
| 3. Integrate | Overlay, get ready, tuning, sync check | More dances, sync check | **Dance screen with real modules** | Feed, profile page, groups |
| 4. Should + polish | Background lock, clip recording | Highlight clip | Profile switcher, demo runs | Badges, reset, README |

| Checkpoint | What's on `main` | Unblocks |
| --- | --- | --- |
| **CP0** | Step 0: scaffold, app shell, model files (types, stubs, mocks and goldens already in `src/`) | Everyone branches and codes against mocks |
| **CP1** | Zaid's pose engine + song player; Toufic's segments (goldens pass) + first real dance; Mohamed's accuracy (goldens pass) | Mohamed swaps mocks for real modules in the dance screen; tuning on real bodies starts |
| **CP2** | Full demo path: catalogue → get ready → dance → results → post → feed | Should features may start; demo rehearsals begin |
| **Freeze** | Everything that's going in | Sunday 9:30 AM; final push well before 12:00 PM |

Aim for CP2 by Saturday evening so Sunday morning is only polish and rehearsal.

## 5. If we fall behind, cut in this order

1. Clip export (FR-50), then the whole highlight clip (FR-47 to FR-49)
2. Badges (FR-46), profile switcher (FR-03), reset (FR-52), background lock (FR-22)
3. Meetups (FR-45), then group feeds (FR-43)
4. Third dance, then second dance

Never cut: solo dance → live scoring with heart rate → results → post to feed. That's the demo.

Working rules (branches, contracts, PRs, AI assistants) are in `RULES.md`.
