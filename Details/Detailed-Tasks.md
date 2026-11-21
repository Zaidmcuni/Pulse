# PULSE — Task split

> Export of the Tasks tab in the team's Claude doc (master copy). FR numbers refer to the Requirements tab. App code lives at the repo root (the `PULSE` folder); all paths below are relative to it.

## 1. How the split works

Each person owns one slice of the app end to end and codes against fixed contracts and mock data, so nobody waits for anyone. Only Mohamed's dance screen plugs the slices together.

**Principles**

- **Contracts first:** Step 0 locks the shared types and module interfaces before anyone branches. After that, each module can be built and tested alone.
- **Mocks, not waiting:** everyone gets a fake dance JSON, a fake heart-rate stream and seed data on day one. Real pieces replace mocks at checkpoints.
- **Demo path first:** every person's list starts with what the demo needs (solo dance → score → results → post). Should items only start once your Musts pass.
- **Ali** gets the self-contained UI work (catalogue, results, social on seeded data): no camera, audio or Bluetooth, and it plugs in at the end of the flow.

**Ownership at a glance**

| Person | Owns | Requirements | Builds against | Delivers |
| --- | --- | --- | --- | --- |
| **Zaid** | Vision and accuracy | FR-16 to FR-22, FR-27, FR-28, FR-31; FR-47 (Should) | Fake dance JSON, his own webcam | `vision/` pose engine, skeleton overlay, `scoring/accuracy.ts` |
| **Toufic** | Dances, audio and coach | FR-13 to FR-15, FR-24 to FR-26; FR-48 to FR-50 (Should) | Nothing: fully independent | Extraction script, 2–3 real dances, `audio/` player and clock, coach canvas |
| **Mohamed** | Setup, heart rate, effort, dance session (integrator) | Step 0; FR-01, FR-02, FR-04 to FR-08, FR-23, FR-29, FR-30, FR-32 to FR-35, FR-37; FR-03 (Should) | Mocks of the other three modules | Profile + watch screens, `hr/`, `scoring/effort.ts`, get-ready and dance screens, app routing |
| **Ali** | Catalogue, results and social | FR-09 to FR-12, FR-36, FR-38 to FR-45, FR-51; FR-46, FR-52 (Should) | Seed JSON + a fake SessionResult | `data/` store and seed data, catalogue, results screen, post flow, feed, profile page, groups, leaderboards, meetups |

## 2. Step 0: shared setup and contracts

Mohamed does Step 0 first (about 1 hour) and pushes it to `main`. Nobody else waits for it: the first item on each other list needs no app code.

### Step 0 checklist (Mohamed)

- [ ] Scaffold Vite + React + TypeScript (strict) at the repo root; add `@mediapipe/tasks-vision` ≥ 0.10.11 and `react-router-dom`
- [ ] `src/types/pulse.ts`: the spec's data contract, plus `PoseFrame`, `HrReading` and `SessionResult.completed` (below)
- [ ] `src/config.ts` with every tuning number, exactly as listed in `RULES.md`
- [ ] Stub every module below with its exact signature (mock implementation or `throw new Error("TODO")`)
- [ ] Mocks in `src/mocks/`: a 20 s fake dance at 120 BPM (arms up/down, generated in code), a simulated heart-rate monitor, a sample `SessionResult`, an in-memory store
- [ ] App shell: router, bottom nav (Feed / Dances / Groups / Profile), placeholder page per route
- [ ] Push to `main`, post in the team chat: "Step 0 is in, branch from main"

### Folders and owners

```
PULSE/  (repo root)
  AGENTS.md  CLAUDE.md  RULES.md  TASK.md  CURRENT-TASK.md (local)
  Details/                Description.md, Detailed-Tasks.md, BrainStorming.zip
  src/
    types/pulse.ts        shared, changes need a team ping
    config.ts             shared, changes need a team ping
    mocks/                Step 0
    vision/               Zaid
    scoring/accuracy.ts   Zaid
    scoring/effort.ts     Mohamed
    audio/  coach/  clip/ Toufic
    hr/                   Mohamed
    data/                 Ali
    screens/              each person owns their own screens
  scripts/extract/        Toufic
  public/models/ public/wasm/ public/dances/ public/seed/
```

### Routes

| Route | Screen | Owner |
| --- | --- | --- |
| `/profile/setup` | Profile setup | Mohamed |
| `/watch` | Watch connect | Mohamed |
| `/dances` | Catalogue (Popular, For you) | Ali |
| `/dance/:id/ready` | Get ready | Mohamed |
| `/dance/:id/play` | Dance | Mohamed |
| `/results/:resultId` | Results + Post | Ali |
| `/feed` | Feed | Ali |
| `/me` | Profile page | Ali |
| `/groups`, `/groups/:id` | Groups, leaderboard, meetups | Ali |

The only hand-off between screens: the dance screen saves a `SessionResult` with `store.saveResult()` and navigates to `/results/:resultId`.

### Module contracts

```typescript
// ---- additions to src/types/pulse.ts ----
export interface PoseFrame {
  tFrameMs: number;                               // performance.now() domain, from requestVideoFrameCallback
  segments: Partial<Record<SegmentId, Vec2>>;     // smoothed, mirrored; only usable segments
  usableRatio: number;                            // usable / segments scored in this mode
  tracking: "ok" | "uncertain";                   // uncertain when usableRatio < 0.5
  points: { x: number; y: number; v: number }[];  // the 12 scored landmarks, for overlay and clip
}
export interface HrReading { bpm: number; source: HeartRateSource; atMs: number; }
// SessionResult gains: completed: boolean  // false = quit early: time + calories only

// ---- vision/poseEngine.ts (Zaid) ----
export function startPose(video: HTMLVideoElement, mode: PosturalMode,
  onFrame: (f: PoseFrame) => void): () => void;     // returns stop()
// ---- vision/SkeletonOverlay.tsx (Zaid) ----
export function SkeletonOverlay(props: { frame: PoseFrame | null }): JSX.Element;

// ---- scoring/accuracy.ts (Zaid), pure functions ----
export function scoreFrame(f: PoseFrame, tSongMs: number, dance: Dance,
  mode: PosturalMode): number | null;              // 0..1, null when tracking is uncertain
export function rateBeat(frameScores: number[]): MoveRating;
export function accuracyLevel(pct: number): AccuracyLevel;

// ---- audio/songPlayer.ts (Toufic) ----
export interface SongPlayer {
  load(dance: Dance): Promise<void>;
  start(): void; pause(): void; resume(): void;
  songTimeMs(): number;                             // song position now
  heardSongTimeMs(tFrameMs: number): number;        // FR-25
  onEnd(cb: () => void): void;
}
export function createSongPlayer(): SongPlayer;
// ---- coach/CoachCanvas.tsx (Toufic) ----
export function CoachCanvas(props: { dance: Dance; getSongTimeMs: () => number }): JSX.Element;

// ---- hr/heartRate.ts (Mohamed) ----
export interface HeartRateMonitor {
  connect(): Promise<void>; disconnect(): void;
  subscribe(cb: (r: HrReading) => void): () => void;
  status(): "live" | "disconnected" | "simulated";
}
export function createBleMonitor(): HeartRateMonitor;
export function createSimulatedMonitor(): HeartRateMonitor;

// ---- scoring/effort.ts (Mohamed), pure functions ----
export function effortPerSecond(bpm: number, p: PlayerProfile): number;   // TRIMP
export function pointsDelta(effort: number, acc: number): number;        // 10 × effort × (0.4 + 0.6 × acc)
export function kcalPerMinute(bpm: number, p: PlayerProfile): number;    // Keytel

// ---- data/store.ts (Ali): the only code that touches localStorage ----
export interface Store {
  listProfiles(): PlayerProfile[]; getActiveProfile(): PlayerProfile | null;
  saveProfile(p: PlayerProfile): void; setActiveProfile(id: string): void;
  listDances(): Dance[]; getDance(id: string): Dance | undefined;
  saveResult(r: SessionResult): void; getResult(id: string): SessionResult | undefined;
  listResults(playerId: string): SessionResult[];
  createPost(p: Omit<FeedPost, "id" | "kudosCount" | "createdAtIso">): FeedPost;
  listFeed(groupId?: string): FeedPost[]; toggleKudos(postId: string, playerId: string): void;
  listGroups(): Group[]; joinGroup(groupId: string, playerId: string): void; leaveGroup(groupId: string, playerId: string): void;
  weeklyLeaderboard(groupId: string, danceId: string): { playerId: string; points: number }[];
  listMeetups(groupId: string): Meetup[]; toggleRsvp(meetupId: string, playerId: string): void;
  listBadges(playerId: string): EarnedBadge[]; awardBadge(b: EarnedBadge): void;
  resetDemo(): void;
}
export const store: Store;
```

### Shared conventions (Zaid and Toufic must match exactly)

- **Segment vectors in pixel space:** MediaPipe x and y are normalized to the frame's width and height separately, so multiply by width and height *before* making unit vectors; otherwise directions are distorted on a 16:9 camera.
- **Same 9 segments, same landmark pairs, same names** (`SegmentId` in the types).
- **Templates are not mirrored;** only the live user is mirrored (x → 1 − x, swap left/right).
- **Template time** `tMs` = milliseconds from the start of the song audio file.

## 3. Task lists

In order: do them top to bottom. **Must** items are the demo; start **Should** items only when all your Musts pass. The first item on each list needs no app code, so it can start right away.

### Zaid: vision and accuracy

**Must**

- [ ] **Test page (no repo needed):** MediaPipe lite from local files + webcam; confirm `visibility` is a number on every landmark and FPS ≥ 24 on the demo laptop (FR-16, NFR-01)
- [ ] **`vision/poseEngine.ts`:** `requestVideoFrameCallback` loop, One Euro filter, 12 landmarks → 9 segment unit vectors (pixel space), mirror, seated mask (5 segments), skip visibility < 0.55, `usableRatio` and `tracking` (FR-17 to FR-21)
- [ ] **`SkeletonOverlay`** component for the get-ready and dance screens (FR-23)
- [ ] **`scoring/accuracy.ts`:** `scoreFrame` (best match from t − 240 to t + 120 ms, 30° tolerance), `rateBeat`, `accuracyLevel`, with unit tests against the fake dance (FR-27, FR-28, FR-31)
- [ ] **Mirror check:** raise your right arm against a template raising the matching arm; it must score high
- [ ] **Tune** tolerance and thresholds on Toufic's real dances with 2 teammates: doing it well must clearly beat doing it badly

**Should**

- [ ] Background lock (FR-22)
- [ ] Record `PoseFrame.points` at 10–12 FPS for the highlight clip and expose them to Toufic (FR-47)

### Toufic: dances, audio and coach

**Must**

- [ ] **Extraction script (no repo needed), `scripts/extract/`:** video + BPM + first-beat offset + metadata → Dance JSON (song time + 9 segment vectors per frame, missing when visibility < 0.55) + audio file, following the shared conventions (FR-13 to FR-15)
- [ ] **Pick 2–3 Just Dance solo videos** with the team (clean, front-facing coach, upper-body-heavy) and ship the **first real dance** to `public/dances/` as early as possible
- [ ] **`audio/songPlayer.ts`:** Web Audio load/start/pause/resume, `songTimeMs`, `heardSongTimeMs` via `getOutputTimestamp` (camDelay 0.045 s, with fallback), `onEnd` (FR-24, FR-25)
- [ ] **`CoachCanvas`:** silhouette drawn from the template frame at the current song time, interpolated between frames (FR-26)
- [ ] **Sync check:** coach and music stay together for the whole song on the demo laptop (NFR-02)
- [ ] Remaining 1–2 dances

**Should**

- [ ] Highlight clip: pick the best 15 s window (FR-48), 9:16 silhouette replay reusing the coach drawing code (FR-49)

**Could**

- [ ] Clip export with `MediaRecorder` (FR-50)

### Mohamed: setup, heart rate, effort, dance session

**Must**

- [ ] **Step 0** (section 2)
- [ ] **`hr/heartRate.ts`:** Web Bluetooth monitor (8/16-bit parsing, connection status, drop banner, 10 s hold) + simulated monitor labeled "Simulated" (FR-04 to FR-08). Test the WHOOP and Garmin on a bare page as soon as they arrive
- [ ] **`scoring/effort.ts`:** TRIMP effort, points delta, Keytel calories, with unit tests (FR-29, FR-32)
- [ ] **Profile setup and watch connect screens** (FR-01, FR-02)
- [ ] **Get-ready screen:** camera permission, `SkeletonOverlay`, Start (FR-23)
- [ ] **Dance screen:** wires `SongPlayer` + `CoachCanvas` + `startPose` + `scoreFrame` + heart rate. Per frame: score; per beat: rating pop-up; per second: points, holding the last good accuracy when uncertain. HUD, Pause/spacebar, quit-early rule, build and save the `SessionResult`, go to results (FR-30, FR-33 to FR-35, FR-37)
- [ ] **Swap mocks for real modules** at each checkpoint; run the full demo twice in a row (NFR-11)

**Should**

- [ ] Profile switcher (FR-03)

### Ali: catalogue, results and social

**Must**

- [ ] **Seed data JSON (no repo needed):** 5–6 profiles, 3 groups (friends: "McGill Friday Night Crew"; city: Montreal; dance type: hip-hop), 8–10 posts, 2–3 meetups, past results for leaderboards, all matching the types
- [ ] **`data/store.ts`:** every `Store` method on localStorage, seed loaded on first run, weekly leaderboard = best points per member, Monday–Sunday (FR-51, FR-44 logic)
- [ ] **Catalogue screen:** cards, difficulty sort/filter, Popular, For you rule with unit tests (FR-09 to FR-12)
- [ ] **Results screen:** completed view (points, accuracy, level, time, calories labeled private and estimated) and quit-early view (time and calories only, no Post) (FR-35, FR-36)
- [ ] **Post flow:** pick groups, calories and clip toggles off by default, never body stats or heart rate (FR-38)
- [ ] **Feed with kudos, profile page** (FR-39 to FR-41)
- [ ] **Groups:** list, join/leave, group feed, weekly leaderboard, meetups with RSVP (FR-42 to FR-45)

**Should**

- [ ] Badges: award rules, results-screen pop-up, profile display; seed one profile that already has On Fire (FR-46)
- [ ] Reset demo data (FR-52)
- [ ] Repo README: point to Description.md, tech stack, how to run, AI-assistance disclosure (SR-08)

## 4. Checkpoints

| Phase | Zaid | Toufic | Mohamed | Ali |
| --- | --- | --- | --- | --- |
| 1. Start (no repo) | MediaPipe test page | Extraction script, pick videos | Step 0 | Seed data JSON |
| 2. Build vs mocks | Pose engine, overlay, accuracy | First real dance, song player, coach | Heart rate, effort, profile, get ready | Store, catalogue, results, post flow |
| 3. Integrate | Tune on real dances | Sync check, more dances | **Dance screen with real modules** | Feed, profile page, groups |
| 4. Should + polish | Background lock, clip recording | Highlight clip | Profile switcher, demo runs | Badges, reset, README |

| Checkpoint | What's on `main` | Unblocks |
| --- | --- | --- |
| **CP0** | Step 0: types, config, stubs, mocks, app shell | Everyone branches and codes against mocks |
| **CP1** | Toufic's first real dance + song player; Zaid's pose engine + accuracy | Mohamed swaps mocks for real modules; Zaid starts tuning |
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
