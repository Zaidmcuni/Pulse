# PULSE — ASAP Core MVP Implementation Plan & GitHub Requirements

*CodeJam 16 • Execution-First Specification (Saturday 1:00 AM $\rightarrow$ Sunday 12:00 PM EST)*

> **Core Rule:** Do **not** build 2-player turn-taking, Strava club feeds, or Neon Ghost silhouettes until **Stage 1 (Core Single-Player Adaptive Loop)** runs end-to-end on your demo laptop without crashing.

## 1. Staged Build Scope (Strict Priority Order)

To ship a working product before Sunday at 12:00 PM, divide development into three sequential gates. Nobody starts Stage 2 until Stage 1 passes its exit check; nobody starts Stage 3 until Stage 2 passes its exit check.

| Stage | Focus Area | What Ships in This Stage | Explicitly Deferred | 
| ----- | ----- | ----- | ----- | 
| **Stage 1: Core Software MVP** *(ASAP — Tonight & Sat Morning)* | Single-player adaptive dance engine | Repo scaffold + offline MediaPipe; 1-player profile & exclusions; 5s personal calibration; mirrored webcam skeleton; confidence gate (`tracking uncertain`); seated joint masking; 3 authored move detectors (`rhythmic_arm_press` first); Web Audio beat clock + rhythm grader; 20–30s block effort check-in (`Easier / Comfortable / Harder`) with visible adaptation banner; simple session recap. | 2-player turn-taking, Shared Chorus harmony stem, Strava Club Feed, Kudos, Forum, Neon Ghost replays, wearables. | 
| **Stage 2: 2-Player Co-Op** *(Sat Afternoon)* | Shared musical collaboration | Player 2 profile & turn-taking state machine; equal standing/seated progress bar; pre-synced Shared Chorus audio stem unlock + celebratory lighting. | Strava Club Feed, Kudos, Forum, Neon Ghost replays, wearables. | 
| **Stage 3: Extra Social & Polish** *(Sat Evening — Conditional)* | Strava club loop & silhouette replays | Pre-seeded `localStorage` Strava Club Feed + Kudos + Forum; 10 FPS $\rightarrow$ 60 FPS Neon "Pulse Ghost" duet silhouette cards; Sunday submission freeze & fallback video. | Native smartwatches, cloud backend, multi-person simultaneous camera tracking. | 

## 2. Stage 1 User Requirements (`UR`) — Core Software

* **`UR-01` Under-60-Second Setup:** A user must be able to enter a name, choose a goal (`stamina`, `coordination`, or `active_break`), pick `standing` or `seated` mode, and check any movement exclusions (`no_overhead_reach`, `no_lateral_step`) without mandatory height or weight inputs.

* **`UR-02` Personal Range Calibration:** Before dancing, the user must complete a 5-second comfortable-range check in their chosen posture mode so move thresholds adapt to their own body proportions and mobility limits.

* **`UR-03` Move Preview, Pause & Camera-Free Fallback:** The user must see an animated preview of the move before starting, be able to pause at any moment without losing progress, and toggle camera-free rhythmic participation if they prefer not to use a webcam.

* **`UR-04` Non-Punitive Live Rhythm Feedback:** While dancing, the user must receive clear, encouraging visual and audio feedback (`Locked In`, `On Beat`, `Moving`) that flags poor camera visibility as `Tracking uncertain` rather than penalizing them.

* **`UR-05` User-Controlled Block Adaptation:** Every 20–30 seconds, the user must be able to tap `Easier`, `Comfortable`, or `Harder` and immediately see a plain-language banner explaining how the next block adapted (e.g., *"You asked for easier movement. Next block: half-time beat, smaller range"*).

* **`UR-06` Zero-Video Privacy:** Raw webcam video must be processed strictly in browser memory and never stored or uploaded.

## 3. Stage 1 Functional Requirements (`FR`) — Core Software

### Epic 1: Setup & Calibration

* **`FR-01` Single-Player Configuration (`P0`):** The app shall store an active `PlayerProfile` (`id`, `name`, `goal`, `mode: "standing" | "seated"`, `exclusions: string[]`, `currentDifficulty: "gentle" | "standard"`, `cameraFree: boolean`).

* **`FR-02` 5-Second Personal Calibration (`P0`):** The app shall capture neutral shoulder width $W_s = \sqrt{(x_{11}-x_{12})^2 + (y_{11}-y_{12})^2}$, torso center $C_0$, and 90th-percentile comfortable reach/step displacement $R_{\max}$ over 5 seconds.

* **`FR-03` Move Preview & Camera-Free Mode (`P0`):** The app shall render a beat-synced visual guide showing the active move family before and during each block, and allow completing blocks via timed cues without a webcam when `cameraFree === true`.

### Epic 2: Local Computer Vision & Move Detection

* **`FR-04` Offline MediaPipe Pose Overlay (`P0`):** The app shall load `pose_landmarker_lite.task` and WASM files from local `public/` assets (`numPoses: 1`, `runningMode: "VIDEO"`), process real camera frames via `requestVideoFrameCallback`, smooth coordinates with a One Euro (1€) filter (`mincutoff = 1.0`, `beta = 0.03`), and draw a mirrored skeletal overlay on an HTML5 `<canvas>`.

* **`FR-05` Seated Joint Masking (`P0`):** When `mode === "seated"`, the CV pipeline shall completely ignore lower-body landmarks (`23–32`) and evaluate movement and visibility strictly on upper-body joints (`11–16`).

* **`FR-06` Confidence Gate (`P0`):** On every frame, if mean `visibility` across active landmarks is $< 0.55$ (using `@mediapipe/tasks-vision >= 0.10.11`), the detector shall emit `status: "tracking_uncertain"`, freeze negative scoring, and never count camera loss as user fatigue.

* **`FR-07` Three Authored Move Family Detectors (`P0`):** Using Schmitt-trigger hysteresis (upper trigger threshold + lower reset threshold) normalized by $W_s$ and $R_{\max}$, the detector shall recognize:

  1. **`rhythmic_arm_press` (Build First):** Elbow angle $\theta(11,13,15)$ or $\theta(12,14,16)$ extends $> 145^\circ$ (or wrist reach $\ge 0.70\,R_{\max}$) and resets $< 105^\circ$. Works identically standing and seated.

  2. **`alternating_reach`:** Alternating L/R wrist elevation above shoulder ($\ge 0.70\,R_{\max}$, reset $\le 0.35\,R_{\max}$); automatically swaps to horizontal chest-height reach if `no_overhead_reach` is selected.

  3. **`lateral_step_tap`:** Standing torso/hip midpoint shifts laterally $\pm 0.35\,W_s$ from $C_0$ (reset $\pm 0.15\,W_s$); in seated mode or `no_lateral_step`, swaps to seated torso sway ($\pm 0.20\,W_s$) and side hand tap.

### Epic 3: Web Audio Beat Clock & Rhythm Grading

* **`FR-08` Hardware-Locked Web Audio Beat Clock (`P0`):** The audio engine shall schedule beats from `AudioContext.currentTime` using a $25\text{ ms}$ lookahead loop ($100\text{ ms}$ window) and map camera frame timestamps to heard song time via `audioCtx.getOutputTimestamp()`.

* **`FR-09` Latency-Compensated Rhythm Grading (`P0`):** Valid reps shall be graded against the nearest target beat ($\Delta t_{\text{ms}} = t_{\text{peak}} - t_{\text{beat}}$) into `Locked In` ($-120\text{ ms}$ to $+200\text{ ms}$, $100\text{ pts}$), `On Beat` ($-250\text{ ms}$ to $+380\text{ ms}$, $70\text{ pts}$), or `Moving` (valid rep outside window, $40\text{ pts}$), updating a session progress bar and forgiving streak multiplier.

### Epic 4: Block Effort Adaptation & Session Recap

* **`FR-10` Closed-Loop Block Adaptation & Recap (`P0`):** Every $20\text{–}30\text{ seconds}$, the block pauses on a musical bar boundary to display `Easier`, `Comfortable`, and `Harder` buttons. Selecting an option steps difficulty/cadence (full-beat vs. half-time every 2 beats) or range by at most one level within active exclusions, renders a plain-language `adaptationReason` banner, and outputs a final single-player recap (active minutes, completed blocks, rhythm consistency %, adaptation log).

## 4. Non-Functional Requirements (`NFR`)

* **`NFR-01` Frame Rate & Latency:** Pose inference and canvas rendering shall sustain $\ge 24\text{ FPS}$ on the demo laptop.

* **`NFR-02` Audio-Visual Sync:** Visual move cues and audio beats shall stay aligned within $\pm 25\text{ ms}$ across a 15-minute session.

* **`NFR-03` Time-to-Move:** Onboarding + calibration shall take $< 60\text{ seconds}$ for a first-time user.

* **`NFR-04` 100% Offline Execution:** Zero external CDN or API requests required during runtime; model weights, WASM binaries, and audio loops reside in `public/`.

* **`NFR-05` Zero-Video Privacy:** Raw webcam frames remain strictly in transient memory and are never persisted or transmitted.

* **`NFR-06` Non-Clinical Safety:** The system shall never infer heart rate, calories, or medical fitness from the webcam and shall strictly enforce user movement exclusions.

* **`NFR-07` CodeJam 16 Compliance:** Final commit pushed to GitHub before **Sunday 12:00 PM EST** with AI-tooling disclosure in `README.md` and a **3:15–3:45** demo flow.

## 5. System Requirements (`SR`)

* **`SR-01` Hardware:** Laptop with $\ge 720\text{p}$ $30\text{ FPS}$ webcam, WebGL 2.0 GPU support, and **wired** speakers (Bluetooth audio prohibited during live demo due to $150\text{–}300\text{ ms}$ lag).

* **`SR-02` Browser:** Desktop Google Chrome or Microsoft Edge (v120+) supporting WebGL 2.0, `AudioContext.getOutputTimestamp()`, and `requestVideoFrameCallback()`.

* **`SR-03` Frontend Stack:** Node.js v20+, Vite, React 18+, TypeScript 5+ (strict mode).

* **`SR-04` Vision Bundle:** `@mediapipe/tasks-vision` (`>= 0.10.11`) with local `public/models/pose_landmarker_lite.task` and `public/wasm/*`.

* **`SR-05` Audio Assets:** Rights-cleared, exact-BPM loop files in `public/audio/` (plus procedural Web Audio synth fallback).

## 6. Exact Step-by-Step Build Order (How to Implement Stage 1 ASAP)

### Step 0: Clean Repo & Scaffold App (15 Minutes)

Run these commands once on `main` so your existing markdown files move cleanly into `docs/` and the React-TypeScript app sits at the repository root:

```bash
mkdir -p docs
git mv "Project Pulse" "ideas" "possible implementation" "secondary ideas" docs/
npm create vite@latest . -- --template react-ts
npm install
npm install @mediapipe/tasks-vision

mkdir -p public/models public/wasm public/audio
curl -L "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" -o public/models/pose_landmarker_lite.task
cp node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/
```

### Step 1: Lock `src/types/pulse.ts` (10 Minutes)

Commit this minimal Stage 1 contract to `main` before creating feature branches:

```typescript
export type PosturalMode = "standing" | "seated";
export type FitnessGoal = "stamina" | "coordination" | "active_break";
export type DifficultyLevel = "gentle" | "standard";
export type MoveFamily = "rhythmic_arm_press" | "alternating_reach" | "lateral_step_tap";
export type EffortFeedback = "easier" | "comfortable" | "harder";
export type BeatTier = "locked_in" | "on_beat" | "moving" | "tracking_uncertain";

export interface PlayerProfile {
  id: string;
  name: string;
  goal: FitnessGoal;
  mode: PosturalMode;
  exclusions: string[]; // e.g., ["no_overhead_reach", "no_lateral_step"]
  currentDifficulty: DifficultyLevel;
  cameraFree: boolean;
}

export interface CalibrationBaseline {
  shoulderWidth: number; // W_s
  torsoCenterX: number;  // C_0.x
  torsoCenterY: number;  // C_0.y
  maxRangeRatio: number; // R_max
}

export interface BlockPlan {
  blockIndex: number;
  moveFamily: MoveFamily;
  mode: PosturalMode;
  difficulty: DifficultyLevel; // "standard" = every beat, "gentle" = half-time (every 2 beats)
  durationSec: number;         // 20-30s
  bpm: number;
  adaptationReason?: string;
}

export interface BeatResult {
  beatIndex: number;
  tier: BeatTier;
  points: number;
  progressDelta: number;
}
```

### Step 2: Vertical Slice 1 — One Move + One Beat + Skeleton (Next 60 Minutes)

Do not build multi-screen navigation yet. Build a single working screen (`App.tsx` wired to `poseEngine.ts`, `beatClock.ts`, and `moveDetectors.ts`) that proves:

1. Webcam opens mirrored on `<canvas>` with MediaPipe drawing landmarks offline from `/models/pose_landmarker_lite.task`.

2. Pressing **Start** resumes `AudioContext`, plays a steady BPM beat loop, and pulses a visual circle on every beat.

3. Performing a **`rhythmic_arm_press`** triggers a hit counter and increments a progress bar.

### Step 3: Vertical Slice 2 — Calibration, Seated Mask & Effort Adaptation (Saturday Morning)

Once Vertical Slice 1 works reliably on your demo laptop:

1. Add the **5-second calibration** step ($W_s$, $C_0$, $R_{\max}$) and the **Quick Setup** form (`standing`/`seated`, exclusions, camera-free toggle).

2. Add **Seated Joint Masking** (ignore indices `23–32`) and the **Confidence Gate** (`visibility < 0.55` $\rightarrow$ `"Tracking uncertain"` pill, zero score loss).

3. Wire the **25-second block timer** $\rightarrow$ **Effort Check-In modal (`Easier` / `Comfortable` / `Harder`)** $\rightarrow$ **Adaptation Engine** that switches `standard` $\leftrightarrow$ `gentle` (half-time cadence + `0.85x` range + removes overhead reach) and shows the plain-language explanation banner.

### Step 4: Vertical Slice 3 — Remaining 2 Moves & Recap Screen (Late Saturday Morning)

1. Add `alternating_reach` (with `no_overhead_reach` horizontal swap) and `lateral_step_tap` (standing step vs. seated sway).

2. Add the **Session Recap** view showing active minutes, completed blocks, rhythm consistency %, and adaptation history.

> **Stage 1 Exit Gate:** A teammate who did not write the CV code can open the app, set up in $< 60\text{s}$, dance for one block, tap **Easier**, see the next block visibly adapt with a clear reason banner, and finish the recap without errors. **Only after this works, unlock Stage 2.**

## 7. Copy-Paste GitHub Issues & Team Task Board

Create these issues in GitHub right now and assign them across your teammates:

### Stage 1 Issues — Core Software MVP (`Do First`)

| Issue | Title & Branch | Reqs | Definition of Done | 
| ----- | ----- | ----- | ----- | 
| **`#1`** | **Repo Cleanup, Vite Scaffold & Offline MediaPipe** (`main`) | `SR-03`, `SR-04`, `NFR-04` | Existing docs moved to `docs/`; Vite React-TS runs locally; `.task` and WASM files load offline from `public/`. | 
| **`#2`** | **Commit Shared Stage 1 Contract (`src/types/pulse.ts`)** (`main`) | `FR-01`–`FR-10` | Core single-player interfaces committed to `main` before branching. | 
| **`#3`** | **Webcam Mirror, MediaPipe Loop & 1€ Smoothing** (`feat/cv-core`) | `FR-04`, `NFR-01`, `NFR-05` | Mirrored skeleton renders at $\ge 24\text{ FPS}$ via `requestVideoFrameCallback` with One Euro smoothing; zero video saved. | 
| **`#4`** | **Web Audio Beat Clock & Latency-Shifted Rhythm Grader** (`feat/audio-core`) | `FR-08`, `FR-09`, `NFR-02` | `AudioContext.currentTime` scheduler pulses visual beat ring on time; grades `Locked In` / `On Beat` / `Moving`. | 
| **`#5`** | **`rhythmic_arm_press` Detector + Confidence Gate** (`feat/cv-core`) | `FR-06`, `FR-07` | Hysteresis detector counts arm presses in sync with beat clock; covering camera shows `Tracking uncertain` without penalty. | 
| **`#6`** | **5s Personal Calibration & Seated Joint Masking** (`feat/cv-core`) | `FR-02`, `FR-05`, `NFR-06` | Captures $W_s$, $C_0$, $R_{\max}$ in 5s; `seated` mode completely ignores indices `23–32`. | 
| **`#7`** | **Block Timer, Effort Check-In & Adaptation Engine** (`feat/audio-core`) | `FR-10`, `NFR-06` | 25s block triggers `Easier / Comfortable / Harder`; updates next block by 1 level within exclusions and outputs plain-English `adaptationReason`. | 
| **`#8`** | **Add `alternating_reach` & `lateral_step_tap` Detectors** (`feat/cv-core`) | `FR-07` | All 3 move families work in standing and seated/exclusion modes. | 
| **`#9`** | **Single-Player Setup, Live HUD & Recap UI** (`feat/ui-core`) | `FR-01`, `FR-03`, `NFR-03` | End-to-end single-player flow (`Setup` $\rightarrow$ `Calibrate` $\rightarrow$ `Dance` $\rightarrow$ `Effort Check` $\rightarrow$ `Adapted Block` $\rightarrow$ `Recap`) runs in $< 60\text{s}$ setup time. | 

### Stage 2 Issues — 2-Player Co-Op (`Unlock Only After #1–#9 Pass`)

| Issue | Title & Branch | Definition of Done | 
| ----- | ----- | ----- | 
| **`#10`** | **2-Player Turn-Taking & Equal Co-Op Meter** (`feat/coop`) | Alternates Player 1 (standing) and Player 2 (seated) blocks; both contribute equal progress to one shared meter; pause preserves progress. | 
| **`#11`** | **Pre-Synced Shared Chorus Stem & Celebration** (`feat/coop`) | Base + chorus stems launch together at $t=0$; filling the shared meter ramps chorus gain smoothly on a bar boundary with celebratory UI lighting. | 

### Stage 3 Issues — Strava Club & Extras (`Unlock Only After #10–#11 Pass`)

| Issue | Title & Branch | Definition of Done | 
| ----- | ----- | ----- | 
| **`#12`** | **Strava-Style Club Feed, Profiles, Kudos & Forum** (`feat/social`) | Pre-seeded `localStorage` club feed (3 teammate posts) + live session auto-post + working Kudos & club forum replies. | 
| **`#13`** | **Neon "Pulse Ghost" Silhouette Duet Cards** (`feat/ghosts`) | Captures 10 FPS normalized joint JSON during blocks and renders 60 FPS interpolated neon standing/seated duet silhouettes in Recap & Feed. | 
| **`#14`** | **Sunday Freeze, Fallback Video & Final Push** (`main`) | Hard freeze Sunday morning; record backup demo clip; update `README.md` with AI disclosure; push final commit before **Sunday 12:00 PM EST**. | 
