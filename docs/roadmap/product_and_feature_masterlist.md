# PULSE — Complete Product & Feature Masterlist

*One beat. Your workout. Our progress.*

**PULSE** is an inclusive, adaptive social dance-fitness web application—positioned as **"Strava for adaptive dance fitness"** paired with short, TikTok-inspired **"Trend Loops."** It runs 100% locally in the browser using real-time computer vision (`MediaPipe Pose Landmarker`) and hardware-locked `Web Audio`, adapting every movement block to the user's body, stamina, and mobility while connecting friends through clubs, shared musical milestones, and privacy-safe neon silhouette replays.

## 1. Core App Navigation & Screen Architecture

Once a user opens PULSE, the application flows seamlessly between a **Strava-style Social Hub** and an **Interactive Adaptive Dance Studio**:

1. **Registration & Athlete Onboarding Screen** (First-time setup or profile switcher)
2. **Main App Shell (4 Top/Bottom Navigation Tabs):**
   * **Tab 1: `Feed` (Strava-Style Club Stream & Forum)** — Live activity posts from club members, Neon Ghost silhouette previews, one-click Kudos, comments, and IRL active-break meetup pings.
   * **Tab 2: `Dances` (Routine & Trend Loop Catalog)** — Filterable library of 20–30 second modular dance routines categorized by fitness goal, duration, BPM, and desk/seated friendliness.
   * **Tab 3: `Challenges` (Inclusive Club Standings & Segments)** — Cooperative club goal meter, *Local Legend* consistency streaks, Weekly Active Minutes, and *Beat-Drop Segment* accuracy leaderboards.
   * **Tab 4: `Profile` (Dancer Passport & Preferences)** — Personal stats, active streak, movement mode (`Standing` / `Seated`), saved exclusions, and privacy controls.
3. **Pre-Dance Drawer (Mode Confirm & Move Preview)** — Quick check of posture mode, Solo vs. 2-Player Co-Op toggle, Camera-Free toggle, and animated move preview.
4. **5-Second Personal Calibration Screen** — Mirrored webcam setup that measures personal body scale and comfortable reach/step range.
5. **Live Dance HUD (20–30s Movement Blocks)** — Mirrored skeleton overlay, beat-synced pulse ring, Shared Chorus progress meter, confidence status chip, and Pause button.
6. **Between-Block Effort Check-In & Adaptation Banner** — `Easier` / `Comfortable` / `Harder` buttons plus a plain-language *"Why It Adapted"* banner.
7. **The Shared Chorus Climax & Session Recap** — Layered musical stem unlock, 9:16 Neon "Pulse Ghost" silhouette card, health/rhythm summary, and one-tap **Post to Club Feed**.

## 2. Step-by-Step End-to-End User Experience

### Phase A: Registration & Entering the Strava-Style Hub

1. **User Opens the App & Registers:**
   * Enters a display name and handle (e.g., `@alex_moves`), picks a profile color/badge, and joins or creates a local **Dance Club** (e.g., *McGill Friday Night Crew*).
   * Selects a primary **Health Goal**:
     * `Stamina` (continuous rhythmic cardio pacing)
     * `Coordination` (alternating multi-limb timing and precision)
     * `Active Break` (5-minute desk-friendly movement reset)
   * Sets **Default Posture Mode** (`Standing` or `Seated`) and checks any **Movement Exclusions** (`No overhead reach`, `No lateral steps`, `No jumps/squats`).
   * *Optional Body Stats:* Height and weight fields are strictly optional and **never** automatically set workout difficulty.
2. **Gaining Access to the Social Hub (`Feed` Tab):**
   * Upon completing registration, the user lands on the Strava-style **Club Feed**, already populated with recent club sessions, weekly club active-minute progress, and active forum threads so the community feels alive immediately.

### Phase B: Choosing a Dance & Starting a Session

3. **Selecting a Routine in the `Dances` Tab:**
   * The user browses rights-cleared, original **Trend Loops** (e.g., *Friday Groove Drop — 112 BPM*, *5-Min Desk Reset — 100 BPM*, *Midnight Synth Sprint — 124 BPM*), each showing duration, goal focus, and a *"Standing & Seated Ready"* badge.
   * Tapping a dance opens the **Pre-Dance Drawer**, where the user confirms:
     * **Session Mode:** `Solo Session` or `2-Player Turn-Taking Co-Op` (assigning Player 1 and Player 2 profiles).
     * **Posture & Exclusions:** One-tap confirmation of `Standing`, `Seated`, or `Camera-Free Mode` (for users who want audio/visual rhythm cues without turning on a webcam).
     * **Animated Move Preview:** A looping visual guide demonstrating the opening move family before the music starts.
4. **5-Second Personal Range Calibration:**
   * Clicking **Start Dance** initializes local webcam pose tracking (zero video recorded or sent to any server).
   * Over a 5-second countdown, the user holds a ready posture and performs one comfortable reach or step.
   * PULSE records their **neutral shoulder width** ($W_s$) and **personal comfortable range** ($R_{\max}$) so all subsequent scoring adapts to *their* exact body geometry and distance from the laptop.

### Phase C: Dancing, Real-Time Adaptation & The Shared Chorus

5. **Live Movement Block 1 (20–30 Seconds):**
   * The Web Audio master clock launches the base rhythm loop, and a visual beat ring pulses on screen in tight hardware sync.
   * MediaPipe tracks active joints locally, rendering a smooth mirrored skeleton overlay:
     * If `Seated` is active, lower-body joints (hips, knees, ankles) are completely masked out so desks or chairs never interfere with tracking.
     * If room lighting drops or someone walks behind the user (`visibility < 0.55`), the HUD displays a calm **`Tracking uncertain — keep moving!`** chip and pauses grading without deducting points.
   * Every completed rep grades into **`Locked In`** (on-beat peak), **`On Beat`**, or **`Moving`** (valid movement outside the beat window—never a harsh red "MISS"), filling the collective **Chorus Meter** and building **Flow Score**.
6. **Effort Check-In & Visible Block Adaptation (3–5 Seconds):**
   * At the end of Block 1, the beat continues softly while three large buttons appear: **`Easier`** | **`Comfortable`** | **`Harder`**.
   * The adaptation engine combines the user's button choice with reliable block completion trends to modify **Block 2** by one step while preserving the exact song BPM:
     * **Choosing `Easier`:** Shifts from full-beat cadence to half-time cadence (every 2 beats), lowers required reach/step range to $0.85 \, R_{\max}$, and removes overhead cues.
     * **Choosing `Harder`:** Steps up from half-time to full-beat cadence or expands lateral step/reach variety strictly within declared exclusions.
     * **Sustained Missed Reps (High Confidence):** Prompts *"Want a smoother pace next round?"* rather than silently downgrading the user without consent.
   * A visible **"Why It Adapted"** banner explains the exact change on screen (e.g., *"You asked for easier movement. Next block: half-time pace, smaller range, no overhead reach"*).
7. **2-Player Turn-Taking & Unlocking the Shared Chorus:**
   * In 2-Player Co-Op, PULSE cues **Player 2** to step in for Block 2 (e.g., Player 1 danced standing; Player 2 dances seated). Both earn **equal active-time credit** toward the exact same Chorus Meter, and pausing never erases earned progress.
   * When the collective meter hits 100%, PULSE unlocks the **Shared Chorus** on the next musical bar boundary: the Web Audio mixer smoothly fades in layered chorus harmonies and synth stems alongside a celebratory visual lighting shift.

### Phase D: Session Recap, Pulse Ghost Replay & Club Publishing

8. **Session Recap & 9:16 Neon "Pulse Ghost" Card:**
   * At song end, the user views a summary of **Active Minutes**, **Blocks Completed**, **Flow Score**, **Beat-Drop Segment Accuracy (%)**, **PULSE Effort Load**, and a log of how the routine adapted.
   * If camera tracking was active, PULSE displays a looping, vertical **9:16 Neon "Pulse Ghost" Silhouette Replay** (with standing and seated partners dancing side by side in Duet mode)—generated purely from anonymized 2D joint vectors with zero raw video captured.
9. **Auto-Posting to the Strava-Style Feed:**
   * Tapping **Post to Club Feed** saves the session locally, updates weekly active minutes and streaks, and publishes the workout card to the top of the **Feed** tab where teammates can tap **Kudos** or reply in the comments.

## 3. Exhaustive Feature & Engine Specifications

### 3.1 Social & Strava-Inspired Community Features

* **Dancer Profiles & Streaks:** Tracks handle, fitness goal, preferred mode, total active minutes, completed blocks, and consecutive active days.
* **Club Activity Feed & One-Click Kudos:** Displays completed routines, equal standing/seated participation badges, visible adaptation notes, animated Neon Ghost thumbnails, and live Kudos counters.
* **Club Forum & IRL "10-Min Active Break" Pings:** Lightweight discussion thread inside the club where friends coordinate quick in-person sessions (e.g., *"10-min desk reset in the lounge at 8 PM"*).
* **Inclusive Club Challenges (Zero Toxic Leaderboards):**
  * *Cooperative Club Goal:* Shared weekly active-minute target filled equally by all members.
  * *Local Legend Crown:* Awarded for consistency and active days rather than peak physical difficulty.
  * *Beat-Drop Segments:* 15-second peak chorus sections inside each song where friends compare personal rhythm accuracy (%) relative to their own calibration.

### 3.2 Adaptive Dance & Computer Vision Capabilities

* **Three Authored Move Families (Standing + Seated + Exclusion Variants):**
  1. **`rhythmic_arm_press`:** Elbow flexion/extension cycle ($> 145^\circ$ trigger, $< 105^\circ$ reset) or forward chest press ($\ge 0.70 \, R_{\max}$). Identical in standing and seated modes.
  2. **`alternating_reach`:** Alternating left/right wrist elevation above shoulder height; automatically converts to horizontal chest-height reach if `no_overhead_reach` is active.
  3. **`lateral_step_tap`:** Standing hip/torso lateral shift ($\pm 0.35 \, W_s$ from calibrated center); automatically converts to seated torso sway ($\pm 0.20 \, W_s$) and side hand tap in seated mode or when `no_lateral_step` is active.
* **Noise & Latency Engineering:**
  * **One Euro ($1\text{€}$) Filter:** Speed-adaptive low-pass smoothing (`mincutoff = 1.0` Hz, `beta = 0.03`) that eliminates standing/seated tremor at rest without adding lag during fast beats.
  * **Schmitt-Trigger Hysteresis:** Separate upper trigger and lower reset thresholds prevent landmark jitter from double-counting reps.
  * **Background Person Lock:** Rejects sudden centroid jumps from people walking behind the dancer so `numPoses: 1` stays locked onto the active player.

### 3.3 Precision Audio & Dual-Currency Scoring

* **Hardware-Locked Beat Clock:** Uses `AudioContext.currentTime` with a $25\text{ ms}$ lookahead scheduler, `audioCtx.getOutputTimestamp()`, and `video.requestVideoFrameCallback()` to map every camera frame to heard song time and compensate for browser/webcam latency ($-120\text{ ms}$ to $+200\text{ ms}$ `Locked In` window).
* **Sample-Locked Stem Layering:** Starts base and Shared Chorus stems simultaneously at $t = 0$ (chorus muted at `gain = 0`) and ramps chorus gain smoothly on 4-beat bar boundaries—plus optional low-pass filtering during `Easier` half-time blocks.
* **Dual-Currency Points System:**
  1. **Shared Chorus Progress (Co-Op):** Equal $+1$ active beat credit for standing and seated players across any active movement tier (`Locked In`, `On Beat`, `Moving`).
  2. **Flow Score (Personal & Club Segments):** $\text{BasePoints} \times \text{ForgivingStreakMultiplier}$ ($100 / 70 / 40$ pts with $1.0\times \rightarrow 1.25\times \rightarrow 1.5\times \rightarrow 2.0\times$ multipliers that step down gently by one tier rather than resetting to zero).

### 3.4 Evidence-Based Health & Privacy Guardrails

* **Scientifically Honest Metrics:** Tracks **Active Minutes** (WHO/CDC accumulative bout standard), **Rhythm Consistency %**, **Talk-Test Perceived Effort** (`Easier` / `Comfortable` / `Harder`), and **Foster Session-RPE Effort Load** ($\text{Active Minutes} \times \text{CR-10 RPE}$).
* **Strict Safety Exclusions:** Never guesses calorie burn, heart rate, or clinical fatigue from a webcam; never lets `Harder` override user-selected movement exclusions.
* **Optional Wearable Telemetry (Stretch):** Supports Chromium **Web Bluetooth** heart-rate monitors (`0x180D` GATT service) or a clearly labeled **`Simulated`** telemetry preview with source, freshness timestamp, and user override.
* **Zero-Video Privacy Guarantee:** Webcam frames are processed ephemerally in browser memory and discarded immediately; Neon "Pulse Ghost" replays store only quantized 2D skeletal vectors ($\approx 15\text{ KB}$ per 30s block) in `localStorage`.

## 4. Weekend Build Priority Mapping

To ensure a rock-solid live demo before the **Sunday 12:00 PM** GitHub submission cutoff, the features above are built in three sequential stages:

| Priority Stage | Included Capabilities | Unlock Gate |
| :--- | :--- | :--- |
| **Stage 1: Core Software MVP** *(Build First)* | Offline MediaPipe pose tracking, 1-player profile + exclusions, 5s personal calibration, seated joint masking, confidence gate (`tracking uncertain`), 3 move detectors, Web Audio beat clock, 20–30s block effort check-in (`Easier / Comfortable / Harder`) with visible adaptation banner, and basic recap. | Full single-player adaptive loop runs twice back-to-back without errors. |
| **Stage 2: 2-Player Co-Op** *(Build Second)* | Turn-taking state machine for Player 1 & Player 2, equal standing/seated progress bar, and bar-aligned Shared Chorus stem swell + celebration lighting. | Alternating standing + seated players unlock the audible Shared Chorus cleanly. |
| **Stage 3: Strava Hub & Pulse Ghosts** *(Build Third)* | Full Strava-style `Feed` / `Dances` / `Challenges` / `Profile` tabs (`localStorage` with pre-seeded club posts), Kudos, Forum, Beat-Drop Segments, and 9:16 Neon "Pulse Ghost" silhouette duet replays. | Hard feature freeze Sunday morning + recorded fallback video + final GitHub push before 12:00 PM. |
