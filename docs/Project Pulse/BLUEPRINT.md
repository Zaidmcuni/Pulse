# CODEJAM 16 • SENIOR PRODUCT & TECHNICAL ARCHITECTURE BLUEPRINT

# PULSE: Adaptive Social Dance Fitness

> **One beat. Your workout. Our progress.**  
> *A Strava-style social fitness club and local computer vision dance engine that adapts every movement to fit the person while keeping friends moving together.*

| Field | Value | Field | Value |
|---|---|---|---|
| **Hackathon** | CodeJam 16 (ECSESS, McGill University — Trottier Building) | **Date** | November 20–22, 2026 |
| **Primary Track** | People First ($200) | **Secondary / Bonus** | Health (Conditional), Touch Grass, Beginner (Auto) |
| **Core Stack** | Vite, React, TypeScript, MediaPipe Pose Landmarker, Web Audio API | **Submission Cutoff** | GitHub commit before Sunday 12:00 PM EST |

---

## 1. Executive Summary & Pitch

### 1.1 The Cultural & Human Problem
Health and fitness have become deeply social cultural trends: platforms like Strava and neighborhood run clubs transformed solitary running into a community ritual where friends track progress, give kudos, and hold each other accountable. Simultaneously, short-form dance routines dominate TikTok and social feeds. Yet real-world dance fitness remains disconnected from this momentum—it feels intimidating, awkward to practice alone, and rigid to share with friends.

The underlying human bottleneck is **physical asymmetry**. Friends rarely share the same stamina, coordination, confidence, or mobility range. Traditional dance games and group classes enforce a single fixed routine, leaving an experienced mover under-stimulated while leaving a beginner, tired friend, or seated participant struggling and singled out for holding the group back.

### 1.2 Unique Solution & Core Value Proposition
**PULSE** makes dance fitness fun, healthy, and social again—positioning itself as **"Strava for adaptive dance fitness."** Powered by a privacy-first, browser-local computer vision engine, PULSE lets friends pick a health goal (stamina, coordination, or an active break), dance to short TikTok-inspired "Trend Loops," and adapt choreography in real time every 20–30 seconds based on self-reported effort and personal mobility limits.

> **Core Pitch Statement:**  
> *"Fitness is more social and trendy than ever—Strava and run clubs turned solo running into a shared culture, while short dance routines dominate TikTok. Yet actual dance fitness still feels intimidating or rigid. PULSE makes dancing fun, healthy, and social again: it is an adaptive dance-fitness club where friends with different stamina or mobility levels move to the same beat, adapt every block to their body, unlock a collective Shared Chorus, and track real health progress together."*

#### The Signature Interaction ("The Shared Chorus")
Two friends alternate short, personalized movement blocks in front of a single laptop camera. One can perform standing step-touches while the other performs seated arm patterns. Both earn equal active-time credit toward one collective meter—pausing never removes earned progress, and nobody is ever singled out. When the collective meter fills, PULSE unlocks the **Shared Chorus**, layering richer harmonic audio stems and celebratory lighting while keeping everyone on the same beat. Every adaptation is made visibly transparent on screen (*e.g., "You asked for easier movement. Next block: smaller steps, no overhead reach."*).

### 1.3 Target Audience & Competitive Differentiation
* **Primary Hackathon Audience:** University students and friend groups seeking a fun, approachable 5–15 minute social movement session they would genuinely try together on a Friday night—especially pairs with mismatched fitness levels or confidence.
* **Secondary Inclusive Audience (Post-Weekend Validation):** Seated, wheelchair-using, or limited-range-of-motion participants who want full participation in group music workouts without being relegated to an afterthought mode (explicitly avoiding unvalidated clinical or rehabilitation claims).

| Reference / Inspiration | What PULSE Borrows | PULSE's Differentiated Design Choice |
|---|---|---|
| **Just Dance** (Camera Controller) | Immediate camera-based movement feedback and rhythmic choreography cues. | Replaces rigid, competitive accuracy scoring with closed-loop individual adaptation and a cooperative shared goal. |
| **LES MILLS** (Dance Classes) | Approachable, structured movement families and clear musical phrasing. | Adds a 20–30 second effort check-in loop that dynamically modifies the next block's complexity, impact, and range. |
| **Strava & Run Clubs** | Athlete profiles, friend clubs, activity feeds, kudos, streaks, and social accountability. | Applies social fitness culture to dance while prioritizing equal active-time participation and friendly consistency challenges over toxic global leaderboards. |
| **TikTok Dance Trends** | Short, modular 20–30 second rhythmic "Trend Loops" and 9:16 vertical shareable recaps. | Uses original or rights-cleared beats and adapts trend complexity to each person's body; never uploads raw user video. |
| **Cooperative Games** | Collective progress meters and shared audio-visual celebratory milestones. | Uses the Shared Chorus to make individual seated or standing effort feel socially meaningful. |

### 1.4 Alignment with CodeJam 16 Principles & Tracks
* **Anti-"AI Slop" & Compute Restraint:** CodeJam 16 explicitly warns against "AI slop," "AI hallucinations," "AI tokenmaxxing," and generic Jarvis clones. PULSE uses zero LLM API calls during live workouts and runs lightweight pose estimation locally in-browser on CPU/WASM, aligning directly with deliberate engineering and visible cause-and-effect.
* **People First ($200) — Primary Track:** Built explicitly as an in-person Friday-night social activity where friends dance together, hype each other via a club feed, and unlock a collective musical celebration.
* **Health ($200) — Conditional Track:** Centers on real physical movement, active minutes, effort-guided pacing, and inclusive seated/limited-mobility participation—while maintaining strict scientific honesty that seated mode alone does not establish clinical improvement without intended-user validation.
* **Touch Grass ($200) — Secondary Angle:** Audio cues and a set-down laptop encourage physical movement away from handheld phone scrolling, though screen-guided choreography keeps this secondary.
* **Beginner ($200) — Automatic Bonus:** Automatically awarded if 100% of team members are first-time hackers and the team places in any track.

---

## 2. Exhaustive Feature Breakdown

Every feature discussed across our planning, architecture, accessibility, wearable, and Strava/TikTok social sessions is cataloged below with explicit priority tiers (**MVP — Ship**, **Secondary — Polish if Gates Pass**, or **Stretch / Deferred — Post-Weekend**) and edge-case rules.

| Feature | Priority | Purpose | How It Works & Edge-Case Guardrails |
|---|---|---|---|
| **1. Onboarding & Health Goal Setup** | **MVP** | Personalize session intent and physical boundaries in under 60 seconds without clinical gatekeeping. | User selects fitness goal (*Stamina*, *Coordination*, or *Active Break*), duration (5–15 min), preferred music style, experience level, mode (*Standing* or *Seated*), and specific movement exclusions (e.g., no overhead reach, no lateral steps, no jumps/squats).<br><br>**Guardrail:** Height and weight fields are strictly optional and never auto-set workout difficulty. |
| **2. Personal Range Calibration & Camera-Free Mode** | **MVP** | Adapt movement scoring to each person's comfortable body geometry and allow privacy-first or accessibility fallback. | A 5-second comfortable-range check in standing or seated mode records personal joint extension bounds (shoulder lift, arm reach, torso sway/step span), followed by a visual move preview. Includes a camera-free participation toggle so users can follow audio/visual cues and earn equal active-time credit without turning on a webcam. |
| **3. Local Pose Tracking & Canvas HUD** | **MVP** | Deliver responsive, private, low-latency movement sensing on a standard laptop CPU. | Runs `@mediapipe/tasks-vision` (`PoseLandmarker`, `pose_landmarker_lite.task`, `numPoses: 1`) locally via bundled WASM to extract 33 3D skeletal landmarks. Evaluates selected joint angles and displacements relative to calibration rather than raw screen coordinates. Renders a live HTML5 Canvas skeleton overlay.<br><br>**Edge Case:** Low landmark confidence flags `"tracking uncertain"` and never deducts score or assumes fatigue. |
| **4. Adaptive Joint-Weight Masking** | **MVP** | Ensure seated, wheelchair, or limited-ROM participants score fairly on the movements they actually perform. | Applies dynamic landmark masks per profile: *Seated Mode* zeroes out lower-body landmarks (hips, knees, ankles) so 100% of detection evaluates upper-body and torso motion while filtering jump/squat cues. *Exclusion Rules* strictly prevent any adaptation step from re-introducing excluded joints or planes of motion. Single-arm/asymmetric mirroring is supported by re-weighting active limb joints against calibration. |
| **5. Authored "Trend Loops" (3 Move Families)** | **MVP** | Make dance fitness approachable, TikTok-inspired, and legally safe without brittle AI choreography. | Three modular 20–30 second move families—**Lateral Step/Tap**, **Alternating Reach**, and **Rhythmic Arm Press**—each authored with standing/seated variants, simpler fallback variants, and two difficulty levels (`gentle`, `standard`). Original or rights-cleared music loops eliminate external account or copyright dependencies. Build `rhythmic_arm_press` first to validate both modes immediately. |
| **6. Closed-Loop Block Adaptation Engine** | **MVP** | Keep every mover in their sustainable challenge zone with transparent cause-and-effect. | After each 20–30s block, player selects *Easier*, *Comfortable*, or *Harder*. Deterministic rules combine self-report with reliable movement trends to step one difficulty level at a time within chosen exclusions. Displays a visible plain-language banner (e.g., *"You asked for easier movement. Next block: smaller steps, no overhead reach."*).<br><br>**Edge Case:** Sustained missed movements trigger a prompt asking if the user wants an easier variant rather than silently downgrading them. |
| **7. Web Audio Beat Clock & Layered Stems** | **MVP** | Maintain seamless musical groove across difficulty shifts and Shared Chorus unlocks. | Web Audio API master clock syncs authored move metadata to audio stems. Maintains a common beat by altering step frequency, physical impact, and complexity before changing tempo. Starts base beat and chorus harmony stems simultaneously at $t = 0$ (chorus muted at `gain = 0`) and ramps chorus gain cleanly on exact musical measure boundaries to eliminate scheduling drift or audio clicks. |
| **8. Two-Player Turn-Taking & Shared Chorus** | **MVP** | Create the emotional social climax on one laptop without multi-person camera occlusion. | Two local player profiles alternate 20–30s blocks in front of one webcam. Both standing and seated blocks contribute equal active-time credit toward one persistent collective meter.<br><br>**Guardrails:** Pausing never removes earned progress; no player is flagged as holding the group back. Filling the meter unlocks the **Shared Chorus** (layered music + celebratory lighting). |
| **9. Strava-Style Athlete / Dancer Profiles** | **MVP** | Build identity, longitudinal health motivation, and personal continuity across sessions. | Each player has a local profile card storing handle, avatar/color badge, fitness goal, preferred mode (standing/seated), movement exclusions, weekly active minutes, completed blocks, and active streak count—persisted in `localStorage`. |
| **10. Strava-Style Club Feed, Kudos & Forum** | **MVP (Lightweight)** | Wrap dance workouts in the social accountability loop that made Strava and run clubs viral. | Dedicated Club Feed tab pre-seeded with 3–4 realistic teammate posts so the club feels alive during judging, with live demo sessions auto-publishing to the top on completion. Each post displays routine title, active minutes, blocks completed, and visible adaptation note—plus one-click "Kudos" reactions and a lightweight club forum thread (e.g., *"Who's joining tonight's 10-min stamina drop?"*). Zero video uploaded. |
| **11. Dance Clubs & Dual-Mode Challenges** | **MVP / Secondary** | Combine cooperative belonging with healthy, inclusive friendly competition among friends. | Organizes local profiles into a named Club (e.g., *"McGill Friday Night Crew"*) featuring: (a) a Cooperative Club Goal bar filled equally by all members' active minutes, and (b) Opt-In Friendly Challenges comparing consistency streaks, active minutes, or beat-timing accuracy rather than raw physical difficulty. |
| **12. Privacy-First 9:16 Shareable Recap Card** | **Secondary** | Capture TikTok/Instagram Story virality while strictly protecting user video privacy. | End-of-session recap generates a vertical 9:16 visual summary card displaying session title, total active time, beat streak, club progress bar, and an animated stick-figure/badge graphic ready to export or share. Never includes webcam footage, raw photos, or body measurements. |
| **13. Web Bluetooth Heart-Rate Telemetry** | **Stretch (Conditional)** | Enrich pacing with live BPM from BLE monitors without building native smartwatch apps. | Optional Chromium Web Bluetooth API (`navigator.bluetooth.requestDevice`) connection to standard BLE GATT `heart_rate` service (`0x180D`), testable with a phone running nRF Connect BLE emulator.<br><br>**Guardrail:** Self-reported effort always ships first; any mocked telemetry must show source, freshness, user override, and an explicit "Simulated" badge. Only add after all 6 MVP acceptance gates pass. |
| **14. Native Wearables (Apple Watch, Garmin, WHOOP)** | **Deferred (Post-MVP)** | Deepen long-term recovery and readiness recommendations after the hackathon. | Apple Watch requires native HealthKit/watchOS code; Garmin Health API requires formal developer approval; WHOOP OAuth provides recovery/sleep/workout summaries (not live BPM streams). Explicitly deferred from weekend build to avoid OAuth or hardware blockers. |
| **15. Simultaneous Multi-Person Tracking & Remote Co-Op** | **Deferred (Post-MVP)** | Enable side-by-side live dancing or remote friend rooms across separate laptops. | `PoseLandmarker` supports `numPoses: 2` and lightweight WebSocket score/BPM rooms can link remote devices, but both are deferred so the hackathon build guarantees rock-solid single-camera framing in Trottier. |
| **16. Out-of-Scope Safety Exclusions** | **Explicitly Excluded** | Maintain technical honesty, legal compliance, and user safety. | Excluded: arbitrary AI-generated choreography, commercial music streaming catalogs, global public leaderboards, exact calorie-burn estimates, and inferring heart rate, medical suitability, or clinical fatigue from webcam motion. |

---

## 3. End-to-End User Flows

### Flow A: First-Time Standing User Onboarding, Calibration & First Block
1. **Club & Profile Entry:** User opens PULSE in Chrome/Edge, selects their Club (*"McGill Friday Night Crew"*), and creates or selects Player 1's Athlete Profile (handle, fitness goal: *Stamina*, session length: *5 min*, music style, experience tier, mode: *Standing*, optional height/weight skipped).
2. **Calibration (5 Seconds):** App initializes local MediaPipe WASM pose tracking, displays a live skeleton overlay, and guides Player 1 through a comfortable lateral step and arm reach to record personal extension bounds. A short animated preview demonstrates the opening Trend Loop move.
3. **Active Movement Block (20–30 Seconds):** Web Audio beat clock starts the rights-cleared base stem. Player 1 performs `lateral_step_tap` or `rhythmic_arm_press` while the canvas overlay confirms rhythmic timing alignment and fills the persistent Shared Chorus meter in real time.
4. **Effort Check-In & Adaptation:** At the musical phrase boundary ending Block 1, playback sustains a soft transition loop while three large buttons appear: *Easier*, *Comfortable*, *Harder*. Player 1 selects *Easier*.
5. **Visible Adaptation Feedback:** The adaptation engine steps difficulty down one tier and prints a clear banner: *"You asked for easier movement. Next block: smaller steps, no overhead reach."* The upcoming block updates seamlessly on the next measure boundary without breaking the beat.

### Flow B: Seated / Limited-Mobility User Turn-Taking & Exclusion Enforcement
1. **Player Switch Cue:** After Player 1's block check-in, the session controller announces Player 2's turn with a large visual banner and audio cue so friends can step in and out cleanly without touching the keyboard repeatedly.
2. **Seated Profile & Joint Mask Activation:** Player 2's profile loads with `mode: "seated"` and `exclusions: ["no_overhead_reach", "no_lateral_step"]`. The vision pipeline zeroes out lower-body landmark weights and applies Player 2's seated calibration bounds.
3. **Seated Trend Loop Execution:** Player 2 performs seated `rhythmic_arm_press` or modified `alternating_reach`. Despite lower-body exclusion, every active second adds the **exact same credit** to the collective Shared Chorus meter as Player 1's standing block.
4. **Boundary-Safe Progression:** If Player 2 selects *Harder* after their block, the adaptation engine increases rhythmic cadence or alternating arm complexity strictly within seated, non-overhead boundaries—never overriding user exclusions.

### Flow C: Unlocking the Shared Chorus & Strava-Style Club Feed Publishing
1. **Collective Threshold Trigger:** As Player 1 and Player 2 complete alternating blocks, the shared progress bar reaches 100%.
2. **Measure-Aligned Audio-Visual Climax:** At the exact next musical bar boundary, the Web Audio engine ramps the pre-synced chorus harmony stem from `gain = 0` to `1.0` and shifts UI lighting into celebratory chorus styling while both friends finish the final groove.
3. **Session Recap & 9:16 Card:** Session concludes with a concise summary displaying total active minutes, blocks completed, adaptation history, each player's equal contribution, and a privacy-safe 9:16 shareable PULSE Recap Card (zero video captured or stored).
4. **Automatic Club Feed Post & Kudos:** Clicking *"Share to Club"* publishes a structured workout entry to the top of the Club Feed, updates both players' weekly active-minute totals and streak counters, updates the Club's friendly streak/timing challenge board, and lets teammates tap *"Kudos"* or comment in the club forum.

### Flow D: Edge-Case Flows (Tracking Uncertainty, Pause & Camera-Free Mode)
* **Occlusion / Dim Lighting ("Tracking Uncertain"):** If a passerby blocks the camera or room lighting drops landmark visibility below threshold (e.g., $< 0.55$), the HUD displays a calm neutral status—*"Tracking uncertain — keep moving to the beat"*—freezes negative scoring, and preserves active-time contribution rather than misinterpreting poor camera sightlines as user fatigue.
* **Sustained Missed Movements:** If landmark confidence is high but the user repeatedly skips reps across a block, PULSE does not silently downgrade them; instead, the check-in prompt gently highlights *Easier* and asks whether they want a simpler variant next block.
* **Instant Pause:** Pressing Pause (or spacebar) immediately suspends the block timer and softens audio without subtracting a single second from earned Shared Chorus progress.
* **Camera-Free Participation:** If a user declines webcam permissions or prefers camera-free mode during Step 2, PULSE bypasses MediaPipe entirely, runs the exact same Web Audio beat clock, visual coach preview, effort check-ins, and equal Shared Chorus meter progression.

### Flow E: Social Club Engagement & Optional Simulated Wearable Flow
* **Club Forum & Challenge Check:** Between sessions, friends browse the Club Feed to see teammates' completed Trend Loops, tap Kudos, post a quick meetup message in the Club Forum (e.g., *"Who's down for a 10-min stamina session after class?"*), and inspect opt-in friend rankings on consistency streaks and beat-timing accuracy.
* **Optional Wearable / Simulated Telemetry (Stretch):** If enabled after core MVP gates pass, a user connects a BLE heart-rate monitor via Web Bluetooth or toggles a clearly labeled *"Simulated Wearable"* preview. The UI displays data source, timestamp freshness, and a one-click override so self-reported effort always remains the primary authority.

---

## 4. System Architecture & Tech Stack

PULSE is engineered as a **local-first, zero-backend-dependency client architecture** for the hackathon weekend, ensuring sub-50ms pose feedback, complete video privacy, and zero failure risk from crowded venue Wi-Fi or third-party API outages.

| Architectural Layer | Selected Technology | Why We Chose It & Key Implementation Notes |
|---|---|---|
| **Frontend Framework** | **Vite + React + TypeScript** | Fast HMR iteration, strict compile-time enforcement of the shared data contract across parallel branches, and clean component separation between pose HUD and Strava-style club UI. |
| **Computer Vision Engine** | **`@mediapipe/tasks-vision`** (`PoseLandmarker`) | Extracts 33 3D skeletal landmarks directly in-browser via WebAssembly on standard laptop CPUs. Bundle `pose_landmarker_lite.task` and WASM binaries locally in `public/models/` and `public/wasm/` so the demo works **100% offline in Trottier**. Configured with `runningMode: "VIDEO"` and `numPoses: 1`. |
| **Pose Scoring & Normalization Math** | **Pure TypeScript vector/angle math** (zero external ML training) | Converts landmarks into shoulder/elbow/hip/knee joint angles and calibration-normalized displacement ratios; applies seated/exclusion joint-weight masks and evaluates beat-window alignment without raw-pixel brittleness. |
| **Session & Adaptation Controller** | **Deterministic Finite-State Machine** (TypeScript) | Guarantees predictable transitions across `IDLE` $\rightarrow$ `ONBOARD` $\rightarrow$ `CALIBRATE` $\rightarrow$ `ACTIVE_BLOCK` $\rightarrow$ `EFFORT_CHECK` $\rightarrow$ `PLAYER_SWITCH` $\rightarrow$ `SHARED_CHORUS` $\rightarrow$ `RECAP`. Transparent rule engine prevents opaque AI hallucinations and makes adaptation explainable to judges. |
| **Audio & Beat Timing Engine** | **Native Web Audio API** (`AudioContext`) | Hardware-accurate audio clock avoids JavaScript `setTimeout` drift. Pre-synced audio stems (base rhythm + chorus harmony) launch simultaneously at $t = 0$ with chorus gain muted; unlocking Shared Chorus ramps gain cleanly on musical measure boundaries. |
| **Persistence & Social State** | **`localStorage` + Seeded JSON Club Store** (Hackathon) | Zero database hosting setup or network failure points during judging. Pre-loads 3–4 realistic teammate posts, forum threads, and club challenge standings while saving live demo sessions immediately across refreshes. |
| **Post-MVP Backend (Deferred)** | Lightweight Node/WebSocket + PostgreSQL | Planned post-hackathon upgrade for remote multi-device rooms, cross-user Strava-style clubs, and persistent campus recreation cohorts. |
| **Wearable APIs (Stretch / Deferred)** | Web Bluetooth GATT `0x180D` (Stretch); HealthKit / Garmin / WHOOP (Deferred) | Web Bluetooth avoids native watch SDKs on Chromium browsers (testable via nRF Connect phone emulator). Native Apple Watch, Garmin approval queues, and WHOOP OAuth summary APIs are deferred so they never jeopardize the core demo. |

### 4.1 Privacy, Safety & Compute Efficiency Architecture
* **Strict On-Device Video Disposal:** Webcam frames enter an in-memory `<video>` element, are sampled by MediaPipe WASM into numeric coordinates, drawn to a local `<canvas>`, and discarded immediately. Zero frames or recordings ever leave the browser.
* **Privacy-Safe Social Sharing:** Only non-identifying workout metadata (routine title, active minutes, blocks completed, adaptation summary, and Kudos) posts to the Club Feed—never body measurements (optional height/weight), raw video, or wearable recovery scores.
* **Zero-Token Live Execution:** Because pose recognition, adaptation rules, and audio layering run deterministically on the local CPU, operational cost and cloud carbon footprint per session are effectively zero.

---

## 5. Data Models & Schema

To prevent merge conflicts across parallel workstreams (vision pipeline vs. session/audio/social UI), all modules share a single locked TypeScript contract in `src/types/pulse.ts`:

```typescript
export type PosturalMode = "standing" | "seated";
export type FitnessGoal = "stamina" | "coordination" | "active_break";
export type DifficultyLevel = "gentle" | "standard";
export type MoveFamily = "lateral_step_tap" | "alternating_reach" | "rhythmic_arm_press";
export type EffortFeedback = "easier" | "comfortable" | "harder";
export type TrackingStatus = "confident" | "tracking_uncertain" | "camera_free";

export interface CalibrationBaseline {
  mode: PosturalMode;
  maxShoulderElevation: number; // normalized vertical wrist-to-shoulder delta
  maxArmExtensionRatio: number; // comfortable horizontal reach span
  maxLateralShiftRatio: number; // 0 when seated
  calibratedAtIso: string;
}

export interface PlayerProfile {
  id: string;
  handle: string; // e.g., "@maya_moves"
  displayName: string;
  goal: FitnessGoal;
  mode: PosturalMode;
  experience: "beginner" | "intermediate";
  exclusions: string[]; // e.g., ["no_overhead_reach", "no_lateral_step"]
  currentDifficulty: DifficultyLevel;
  calibration?: CalibrationBaseline;
  cameraFreePreferred: boolean;
  optionalHeightCm?: number; // strictly optional; NEVER sets difficulty
  optionalWeightKg?: number; // strictly optional; NEVER sets difficulty
  weeklyActiveMinutes: number;
  streakDays: number;
}

export interface PoseSample {
  timestampMs: number;
  trackingConfidence: number; // 0..1 average landmark visibility
  status: TrackingStatus;    // < 0.55 => "tracking_uncertain", never penalized
  moveDetected: boolean;
  timingAccuracy: number;     // 0..1 alignment to Web Audio beat window
  rangeRatio: number;         // displacement relative to CalibrationBaseline
}

export interface BlockPlan {
  blockIndex: number;
  playerId: string;
  trendLoopTitle: string;     // e.g., "Friday Groove Drop"
  moveFamily: MoveFamily;
  mode: PosturalMode;
  difficulty: DifficultyLevel;
  durationSec: number;        // 20-30 seconds
  bpm: number;                // common beat across both players
  activeExclusions: string[];
  adaptationReason?: string;  // plain-language UI explanation
}

export interface ContributionEvent {
  playerId: string;
  timestampIso: string;
  activeSeconds: number;
  completedBlock: boolean;
  sharedMeterDelta: number;   // normalized credit added to collective Shared Chorus
}

export interface FeedPost {
  id: string;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatarColor: string;
  routineTitle: string;
  activeMinutes: number;
  blocksCompleted: number;
  adaptationNote: string;     // e.g., "Adapted to Seated Rhythmic Press"
  kudosCount: number;
  hasKudosGiven: boolean;
  createdAtIso: string;
}
```

### 5.1 End-to-End Runtime Data Flow
1. **Setup Phase:** Onboarding writes two `PlayerProfile` objects and optional `CalibrationBaseline` records into local React state and `localStorage`.
2. **Inference Loop (30–60 FPS):** Webcam frame $\rightarrow$ MediaPipe `PoseLandmarker` $\rightarrow$ joint-angle & mask evaluator $\rightarrow$ emits `PoseSample` $\rightarrow$ updates Canvas skeleton overlay and rolling block metrics.
3. **Adaptation Boundary (Every 20–30s):** Block ends on musical bar $\rightarrow$ user submits `EffortCheck` $\rightarrow$ deterministic rule engine computes next `BlockPlan` (respecting `exclusions`, stepping max 1 level, writing `adaptationReason`) and emits a `ContributionEvent`.
4. **Chorus & Social Commit:** Cumulative `ContributionEvent.sharedMeterDelta` crosses 100% $\rightarrow$ Web Audio ramps chorus stem gain on measure boundary $\rightarrow$ session finishes $\rightarrow$ generates 9:16 Recap Card + appends a new `FeedPost` to the Club store and increments both players' `weeklyActiveMinutes` and `streakDays`.

---

## 6. UI/UX & Design Considerations

PULSE follows a **"Friends in the room, screens in the background"** philosophy. Because users stand or sit several feet back from a laptop while dancing, live workout screens prioritize oversized visual guides, bold typography, clear audio cues, and minimal keyboard/mouse clicks—while pre- and post-workout tabs deliver a crisp Strava-inspired social club experience.

### 6.1 Screen-by-Screen Breakdown

| Screen / View | Layout Structure | Key UI Elements & UX Details |
|---|---|---|
| **1. Club Home & Athlete Profiles** | Top navigation bar (*Workout*, *Club Feed*, *Challenges*); two-column player selector for local session launch. | Club banner (*"McGill Friday Night Crew"*), collective weekly club progress bar, Player 1 & Player 2 profile cards (mode badge, streak, active minutes), and prominent **Start Shared Session** CTA. |
| **2. Quick Setup & Exclusions** | Single-column wizard engineered for <60-second start. | Toggle pills for Goal, Duration (5–15m), Music Style, Standing/Seated mode, and Movement Exclusion checkboxes; collapsed/clearly marked Optional Stats (*Height/Weight — never sets difficulty*) section. |
| **3. 5-Second Calibration & Preview** | Split view: live mirrored webcam canvas (left) + simple animated stick-figure/coach guide (right). | Real-time visual range arc confirming comfortable reach, clear *"Ready"* indicator, and a visible **Switch to Camera-Free Mode** button. |
| **4. Active Dance HUD** | Full-bleed high-contrast layout readable from 6–8 feet away. | Top persistent **Shared Chorus Collective Meter**; large animated move preview synced to the beat; corner mirrored webcam feed with skeletal overlay; active player name & mode indicator; subtle confidence chip (*Tracking uncertain* when occluded); prominent **Pause** button (explicitly reassuring *"Progress saved"*). |
| **5. Effort Check-In & Adaptation Banner** | Centered modal overlay over softly pulsing beat background between 20–30s blocks. | Three oversized touch/click/keyboard targets (`1` *Easier*, `2` *Comfortable*, `3` *Harder*); plain-language **Adaptation Reason Banner** explaining exact next-block changes; clear Player Switch countdown cue. |
| **6. Shared Chorus Celebration** | Dynamic full-screen lighting shift synchronized to layered music stem entry. | Pulsing beat visualizer, collective milestone banner (*"SHARED CHORUS UNLOCKED!"*), and celebration indicator showing both players' equal active-time contribution. |
| **7. Session Recap & 9:16 Share Card** | Two-part summary: workout stats + vertical 9:16 TikTok/Story-style preview card. | Displays active minutes, completed blocks, adaptation log, equal standing/seated split, animated stick-figure badge, **Download Recap Card** button, and **Post to Club Feed** CTA (explicitly noting *"No video uploaded"*). |
| **8. Strava-Style Club Feed & Forum** | Vertical social stream + compact sidebar/tab for Friendly Club Challenges & Forum Thread. | Workout activity cards with routine title, active minutes, adaptation highlights, one-click **Kudos** button with counter; simple club message input for meetup planning; opt-in leaderboard tabs strictly for *Streaks*, *Active Minutes*, and *Timing Accuracy*. |

### 6.2 Non-Negotiable UX Trust & Accessibility Rules
* **Non-Punitive Feedback Language:** Never show red failure X's, "Missed!" penalties, or comparative difficulty shames. Use supportive rhythmic cues (*"In the groove"*, *"Keep moving"*, *"Tracking uncertain"*).
* **Trottier Table Framing Compatibility:** Because judging tables and hacker floors can be crowded, default seated mode and upper-body moves (`rhythmic_arm_press`) must look crisp and uncropped from a laptop perched on a standard desk.
* **Wearable Transparency (If Demonstrated):** Any mocked heart-rate widget must visibly display a **"Simulated"** label, source name, timestamp freshness, and an override toggle.

---

## 7. Hackathon Execution & Demo Plan

### 7.1 CodeJam 16 Rules & Compliance Checklist
* **Hard Timelines:** All project code must be written after Friday 7:00 PM; no reusing prior projects; final submission must be pushed to **GitHub before Sunday 12:00 PM EST** (strictly no edits after noon).
* **Judging Logistics:** Presentations must be a minimum of **3 minutes** and maximum of **5 minutes**, with shorter pitches encouraged to leave ample room for judge Q&A. Check assigned judging location on [codejam.mcgilleus.ca](https://codejam.mcgilleus.ca).
* **Popular Vote Readiness:** The committee selects 5 projects from each of the 8 categories not already awarded a track prize for a **2-minute maximum** audience demo (1st \$300, 2nd \$200, 3rd \$100).
* **AI Tooling & Prize Rules:** Accurately disclose AI-assisted workstreams (Codex/Claude) in the README; confirm multi-track submission eligibility with organizers in Room 1060 (ECSESS/CSUS Lounge); ensure at least one registered teammate with valid ID attends closing ceremonies to collect prize funds.

### 7.2 Workstream Ownership & Phased Build Roadmap

| Workstream / Owner | Core Scope & Deliverables |
|---|---|
| **Camera & Movement** *(Codex Workstream)* | Offline-bundled MediaPipe `PoseLandmarker` hook, Canvas skeleton overlay, 5-second range calibration, seated/exclusion joint-weight masking, `tracking_uncertain` confidence gating, deterministic adaptation engine, and automated rule verification tests. |
| **Session, Sound & Social** *(Claude Workstream)* | Finite-state session controller, Web Audio beat clock with pre-synced measure-aligned stems, onboarding flow, animated coach guide, Shared Chorus visuals, 9:16 Recap Card, and `localStorage` Strava-style Club Feed, Kudos, Forum, and Challenges UI. |
| **Human Team Governance** | Lock `src/types/pulse.ts` on `main` first; select rights-cleared audio loops and authored move thresholds; own main branch merges; test on real bodies under Trottier lighting; verify all 6 acceptance gates; rehearse timed live demo. |

| Time Allocation | Phase | Concrete Milestones & Exit Criteria |
|---|---|---|
| **First 20%** *(Fri Night)* | **Contract & First Move** | Initialize GitHub repo; lock `src/types/pulse.ts`; bundle MediaPipe model/WASM offline; detect `rhythmic_arm_press` reliably on the actual demo laptop; verify one Web Audio loop stays synced with its visual guide. |
| **Next 40%** *(Sat Morning–Afternoon)* | **Full Vertical Slice** | Wire complete path end-to-end: `setup` $\rightarrow$ `calibration` $\rightarrow$ `movement block` $\rightarrow$ `effort check-in` $\rightarrow$ `visible easier next block` $\rightarrow$ `recap`. Then layer in `lateral_step_tap`, `alternating_reach`, seated mode, and exclusion rules. |
| **Next 25%** *(Sat Evening)* | **Shared Chorus & Strava Club Layer** | Integrate second player turn-taking, equal-credit collective meter, pre-synced Shared Chorus stem unlock, and Strava-style Club Feed (pre-seeded with 3–4 realistic posts + auto-publish on recap + Kudos + forum thread). |
| **Final 15%** *(Sun Morning)* | **Freeze, Hardening & Rehearsal** | Hard feature freeze by 9:30 AM Sunday. Verify all 6 acceptance gates; finalize GitHub README & AI disclosure; push final commit well before 12:00 PM; capture a clearly labeled recorded fallback video; rehearse timed 3:30 and 2:00 pitches. |

#### Six Mandatory Acceptance Gates (Must Pass Before Adding Any Stretch Feature):
1. A new tester launches a session in under 60 seconds.
2. Requesting *Easier* or *Harder* visibly updates the next block with an explicit explanation.
3. Seated and standing profiles earn equal contribution on the shared meter.
4. Camera tracking loss displays `tracking uncertain` and never registers a negative score.
5. Two alternating players unlock the Shared Chorus with a clean musical layer transition.
6. The full end-to-end demo completes twice consecutively without crashing.

### 7.3 Technical Bottlenecks, Risks & Mitigations

| Risk / Bottleneck | Failure Mode | Concrete Mitigation Strategy |
|---|---|---|
| **Trottier Wi-Fi Congestion** | MediaPipe CDN fails to download WASM or `.task` weights during judging. | Serve `pose_landmarker_lite.task` and WASM files directly from local `public/` assets; keep all club data in `localStorage` so demo works **100% offline**. |
| **Tight Judging Booth Framing** | Full-body standing footwork gets cropped out on a desk laptop webcam. | Validate upper-body `rhythmic_arm_press` and Seated Mode first; angle laptop slightly back for Player 1 and demo seated framing cleanly for Player 2. |
| **Web Audio Transition Drift / Clicks** | Dynamically loading or starting a chorus track mid-song causes audible stutter or off-beat sync. | Start base beat and chorus harmony stems simultaneously at $t = 0$ with chorus muted (`gain = 0`); ramp chorus gain up cleanly on the next musical bar boundary. |
| **Lighting & Passerby Occlusion** | Drop in pose confidence penalizes the dancer mid-demo. | Enforce confidence gating ($< 0.55 \Rightarrow$ `"tracking uncertain"`) and maintain a clearly labeled recorded demo fallback clip in case hardware fails. |
| **Judge Participation Overrunning Clock** | Inviting a judge to test a move eats 45+ seconds, hitting the 5-minute ceiling and cutting Q&A time. | Rehearse a tight 3:15–3:30 core run-through; offer a quick 15-second judge try-it only during Q&A or if ahead of schedule. |
| **Scope Creep (Wearables / Multi-Pose)** | Chasing HealthKit, OAuth approvals, or simultaneous 2-person tracking breaks the core loop. | Enforce the 6 acceptance gates strictly; ship self-reported effort first and keep Web Bluetooth/simulated wearables strictly optional. |

### 7.4 Timed Pitch & Live Demo Script (Target: 3:30–4:00)

| Timestamp | Beat | Live Stage Action & Spoken Narrative |
|---|---|---|
| **0:00 – 0:35** | **Cultural Hook & Setup** | Deliver the Strava + TikTok opening: *"Health and fitness are social trends now—Strava made running fun with friends, and short dances dominate TikTok—yet dance fitness still forces everyone into one rigid routine."* Introduce two teammates: Player 1 (standing) and Player 2 (seated), joined in the McGill Friday Night Crew club. |
| **0:35 – 1:25** | **Live Pose Tracking** | Start the Trend Loop music. Show real-time local MediaPipe skeleton overlay recognizing Player 1's standing moves and filling the persistent Shared Chorus meter. |
| **1:25 – 2:20** | **Visible Adaptation & Seated Switch** | Hit *Easier* at block check-in; point directly at the transparent banner (*"Next block: smaller steps, no overhead reach"*). Switch to Player 2 demonstrating the seated variant—showing equal contribution filling the exact same collective bar. |
| **2:20 – 3:10** | **Shared Chorus & Strava Feed Post** | Cross 100% to unlock the **Shared Chorus** so the judges hear the harmonic music layer kick in on beat. Show the 9:16 Recap Card, click *Post to Club*, and watch the live session appear at the top of the Club Feed with Kudos and updated club streak standings. |
| **3:10 – 3:45** | **Architecture & Close** | Highlight 100% local browser processing (zero uploaded video, zero cloud token burn), realistic weekend scope, and post-weekend validation plan. Close: *"One beat. Your workout. Our progress."* Leave 1:15+ for judge Q&A (and offer a judge to try a quick seated move during Q&A). |

#### 2-Minute Popular Vote Condensed Script (If Selected):
- **0:00 – 0:20:** Strava + TikTok hook.
- **0:20 – 0:55:** Live standing tracking + clicking *Easier* to show visible adaptation.
- **0:55 – 1:35:** Seated teammate jumps in to unlock the audible Shared Chorus.
- **1:35 – 2:00:** Auto-post to the Club Feed with 9:16 Recap Card and closing tagline.

### 7.5 Judge Q&A Defense Matrix & Post-Hackathon Validation

| Anticipated Judge Question | Crisp, Defensible Answer |
|---|---|
| **"Why not just play Just Dance?"** | Just Dance scores everyone against fixed choreography. PULSE adapts complexity and range block-by-block while letting standing and seated friends build one shared musical goal—and wraps it in a Strava-style club loop that drives repeat sessions. |
| **"How do you know the workout is safe?"** | We never infer medical suitability, heart rate, or clinical fatigue from a webcam. Users explicitly choose movement exclusions, control intensity every 20–30 seconds, can pause anytime without losing progress, and can participate camera-free. |
| **"What personal data or video do you store?"** | Zero video leaves the laptop—MediaPipe processes frames locally in WebAssembly and discards them immediately. The Club Feed shares only workout summaries and active minutes, never video, body measurements, or recovery scores. |
| **"Why single-camera turn-taking instead of tracking two people at once?"** | Simultaneous multi-person tracking causes frequent skeletal occlusion on laptop webcams in small rooms. Turn-taking with two profiles keeps tracking rock-solid today while letting friends cheer each other on between 20–30s blocks; multi-device sync is next. |
| **"What about Apple Watch, Garmin, or WHOOP?"** | Native watchOS/HealthKit, Garmin developer approvals, and WHOOP summary OAuth cannot provide reliable live browser streams in 36 hours. We ship self-reported effort first, support optional Chromium Web Bluetooth heart-rate sensors as a stretch layer, and label any mocked telemetry clearly as *Simulated*. |

#### Post-Hackathon Validation Plan:
1. **Student Playtests:** Run structured playtests with five mismatched-fitness student pairs to measure comfort, fairness of adaptation, and 7-day repeat return rate.
2. **Accessibility Interviews:** Conduct dedicated user interviews with seated and limited-mobility participants before making any formal accessibility or Health-track clinical claims.
3. **Campus Club Pilot:** Launch a campus recreation club pilot (e.g., McGill Athletics/intramural dance clubs) to validate recurring group retention before introducing paid community or club-host tiers.
