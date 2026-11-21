# PULSE — Technical & Scientific Research: Synchronization, Points Tracking & Health System

*CodeJam 16 • Engineering & Sports Science Reference*

This document synthesizes the browser-engineering, computer-vision, and sports-science research required to implement three tightly coupled subsystems in **PULSE**:
1. **Audio-Visual-Pose Synchronization:** Keeping music, animated cues, and webcam pose tracking locked together despite browser and camera latency.
2. **Dance Evaluation & Points Tracking:** Fairly grading rhythmic movement across standing, seated, and varying fitness levels while supporting both cooperative play and Strava-style club competition.
3. **The Adaptive Health System:** Grounding effort regulation, active minutes, accessibility guardrails, and optional wearable telemetry in validated exercise physiology rather than inaccurate webcam guesses.

---

## 1. Synchronizing Dancing, Pose Tracking, and Music

A browser-based dance application must reconcile **three independent hardware clocks** that continuously drift apart if managed naively:
1. **Audio Hardware Clock** (`AudioContext.currentTime`, driven by the sound card sample rate).
2. **Display Render Clock** (`requestAnimationFrame` / `performance.now()`, typically $60\text{ Hz}$).
3. **Webcam Capture Clock** (camera hardware exposure and driver pipeline, typically $30\text{ FPS}$).

Driving beats with `setInterval` or `setTimeout` causes noticeable rhythm drift within $20\text{–}30\text{ seconds}$ because main-thread timers stall whenever MediaPipe WASM runs inference or React re-renders.

### 1.1 Master Clock Architecture (Web Audio Lookahead Scheduler)

Following the canonical Web Audio scheduling pattern (*A Tale of Two Clocks*; Wilson, 2013; MDN Web Docs), treat the audio hardware thread as the single source of truth:

* **Low-Latency Context Initialization:** Instantiate `new AudioContext({ latencyHint: 'interactive' })` (or `0.0`) inside the user's *Start Session* click handler to satisfy browser autoplay rules and minimize internal buffer lag.
* **Lookahead Scheduling Loop:** Run a lightweight $25\text{ ms}$ main-thread interval that looks $100\text{ ms}$ ahead (`scheduleAheadTime = 0.1` s). Whenever `nextBeatTime < audioCtx.currentTime + 0.1`, schedule audio triggers onto the audio thread at exact sample-accurate timestamps and push `{ beatIndex, audioTime }` onto a shared visual beat queue.
* **Sample-Locked Stem Layering (Shared Chorus):** Because PULSE maintains a common beat and transitions music only at musical boundaries, decode and start all pre-synced stems (Base Groove, Player Role Layer, Shared Chorus Harmony) simultaneously at $t_{\text{songStart}}$ with locked stems muted (`gain = 0`). When the Shared Chorus unlocks, ramp the chorus `GainNode` cleanly at the next 4-beat bar boundary via `gain.linearRampToValueAtTime(1.0, nextBarTime + 0.03)`—a $20\text{–}30\text{ ms}$ ramp prevents audible pops while guaranteeing zero phase drift.

### 1.2 Bridging the Three Clocks Mathematically

Audio scheduled for `audioCtx.currentTime = 3.0` is **not heard** at $3.0\text{ s}$—it arrives at the user's ears after the browser's internal buffer (`baseLatency`) and the operating system/speaker pipeline delay (`outputLatency`).

1. **Map Audio Time to System Clock (`getOutputTimestamp`):**
   Call `audioCtx.getOutputTimestamp()`, which returns a paired snapshot `{ contextTime, performanceTime }` indicating the exact audio timeline position (`contextTime`, in seconds) currently reaching the speakers at the exact `performance.now()` timestamp (`performanceTime`, in milliseconds).
   * *Fallback:* On initial frames where `contextTime === 0`, approximate heard audio time as `audioCtx.currentTime - (audioCtx.baseLatency ?? 0) - (audioCtx.outputLatency ?? 0)`.
2. **Drive Pose Inference on Real Camera Frames (`requestVideoFrameCallback`):**
   Running MediaPipe inside `requestAnimationFrame` ($60\text{ Hz}$) on a $30\text{ FPS}$ webcam wastes $50\%$ of CPU/GPU cycles re-processing identical frames. Use `video.requestVideoFrameCallback((now, metadata) => ...)` so MediaPipe executes once per genuine new frame and receives `metadata.captureTime` (or `metadata.presentationTime`) in the exact same `performance.now()` clock domain.
3. **Convert Every Pose Frame to Exact Heard Song Time:**
   For a MediaPipe skeleton extracted from a camera frame captured at $t_{\text{frame}}$ (in ms), compute the exact song timestamp the dancer was hearing when their body reached that pose:

   $$t_{\text{song}}(t_{\text{frame}}) = \left(\text{contextTime} + \frac{t_{\text{frame}} - \text{performanceTime}}{1000} - \Delta_{\text{cam}}\right) - t_{\text{songStart}}$$

   where $\Delta_{\text{cam}}$ represents the webcam exposure-to-compositor delay (typically $0.035\text{–}0.060\text{ s}$ on a laptop webcam).
4. **Convert Directly to Beat Space & Signed Timing Error:**

   $$b = t_{\text{song}} \cdot \frac{\text{BPM}}{60}, \qquad \Delta t_{\text{ms}} = \left(b - b_{\text{target}}\right) \cdot \frac{60000}{\text{BPM}}$$

### 1.3 Handling Real-World Browser Latency

Empirical developer testing shows that OS-reported `outputLatency` can still under-report true audio delay—especially on Bluetooth speakers or headphones, where Bluetooth A2DP adds $150\text{–}300\text{ ms}$ of variable delay (compared to roughly $20\text{–}40\text{ ms}$ on built-in wired laptop speakers). Combine three engineering safeguards:

* **Wired Speaker Rule:** Always demo on built-in laptop speakers or a wired portable speaker, never Bluetooth.
* **Asymmetric Hit Window:** Because webcam exposure, MediaPipe inference ($20\text{–}35\text{ ms}$), and landmark smoothing introduce unidirectional lag, bias beat acceptance windows slightly late (e.g., $-120\text{ ms}$ early to $+240\text{ ms}$ late) rather than strictly symmetric around $0\text{ ms}$.
* **4-Beat Sync Calibration & Manual Offset:** During PULSE's pre-session calibration, optionally play 4 audible beats while the dancer performs 4 rhythmic arm presses and set $\Delta_{\text{cam}}$ to the median measured $\Delta t$. Expose a small $\pm 150\text{ ms}$ manual sync slider in settings as a fallback.

---

## 2. Dance Evaluation & Points Tracking Research

### 2.1 Comparative Evaluation of Pose Scoring Methods

Academic dance-learning studies and commercial motion games rely on four primary scoring paradigms:

| Method | Mechanism | Strengths | Why It Fits or Fails for PULSE |
| :--- | :--- | :--- | :--- |
| **1. Joint-Angle & Displacement Peak Detection (Hysteresis)** | Measures specific normalized joint angles or displacements crossing upper/lower trigger thresholds relative to personal calibration. | Sub-millisecond CPU cost; trivially enforces standing/seated joint masks; produces an exact movement peak timestamp $t_{\text{peak}}$ for rhythm scoring. | **Selected for MVP.** Transparent, deterministic, and requires zero labeled training clips. |
| **2. Joint Position & Angular Similarity (PAS: JPSS + JASS)** | Computes weighted sum of normalized joint position and angular similarity against a reference teacher skeleton over short windows. | Proportion-invariant across different body heights; supports custom joint weights. | Requires authored reference skeletons for every variant; still grades static holds unless paired with velocity checks. |
| **3. Confidence-Weighted Cosine / COCO OKS** | Compares L2-normalized pose vectors or Gaussian-decayed keypoint distances weighted by landmark confidence. | Gracefully down-weights occluded limbs; fast per-frame freeze-frame evaluation. | **Static Pose Trap:** A player who freezes in the extended position two beats early scores $100\%$ without dancing to the rhythm. |
| **4. Dynamic Time Warping (DTW)** | Nonlinearly aligns a buffered time series of player poses against a reference curve. | Strong for post-session movement shape comparison across slightly different speeds. | **Anti-Rhythm by Design:** Stretching time to minimize spatial cost inherently forgives dancing off-beat and adds buffering lag. |

### 2.2 The Three-Gate Per-Beat Detection Pipeline

To avoid the static-pose trap and legacy console camera frustration (such as PlayStation Camera penalizing users when lighting fluctuated), every target beat must pass **three ordered gates**:

1. **Gate 1 — Active-Joint Confidence Gate (Non-Punitive):**
   Compute mean MediaPipe landmark `visibility` **strictly on active joints** for the user's mode (pin `@mediapipe/tasks-vision >= 0.10.11`, since earlier `0.10.x` builds omit `visibility`). In seated mode, completely exclude occluded lower-body indices (`23–32`) and evaluate only upper-body joints (`11–16`) plus head anchor (`0`). If mean active visibility drops below $0.55$, mark the beat `tracking_uncertain`: freeze negative grading, show *"Tracking uncertain — keep moving!"*, and never deduct points or assume fatigue.
2. **Gate 2 — Calibration-Relative Spatial + Velocity Gate (Schmitt-Trigger Hysteresis):**
   Normalize live displacements by calibrated shoulder width $W_s$ and grade range against the user's 5-second calibrated comfortable maximum $R_{\max}$:

   $$\text{rangeRatio} = \frac{d_{\text{live}}}{R_{\max}}$$

   A valid repetition registers only when the smoothed landmark signal (filtered via a **One Euro 1€ Filter**, Casiez et al., 2012, with `mincutoff = 1.0` Hz and `beta = 0.03`) transitions from `READY` into `TRIGGERED` by crossing the upper threshold ($\text{rangeRatio} \ge 0.70$ or elbow extension $> 145^\circ$) with positive velocity, and resets back to `READY` only after returning below a lower threshold ($\text{rangeRatio} \le 0.35$ or elbow flexion $< 105^\circ$). This prevents standing still or micro-jitter from double-counting reps.
3. **Gate 3 — Latency-Compensated Temporal Gate:**
   Compare the mapped song time of the detected movement peak $t_{\text{peak}}$ against the target beat $b_{\text{target}}$:
   * **Locked In (`Perfect`):** $-120\text{ ms} \le \Delta t_{\text{ms}} \le +200\text{ ms}$
   * **On Beat (`Good`):** $-250\text{ ms} \le \Delta t_{\text{ms}} \le +380\text{ ms}$ (outside Locked In bounds)
   * **Moving (`Active`):** Valid calibrated rep detected outside the rhythm window—still rewarded as healthy movement so beginners never face discouraging red "MISS" banners.

### 2.3 Dual-Currency Points Tracking (Co-Op Equality + Fair Strava Competition)

Mixing cooperative inclusivity with competitive leaderboards breaks if raw physical intensity dictates points. PULSE resolves this by decoupling scoring into **two independent currencies** fed by the same per-beat event stream:

#### Currency 1: Shared Chorus Progress (100% Equal Co-Op)
* Every active beat graded `Locked In`, `On Beat`, or `Moving` adds an **identical base increment** ($+1$ active beat unit) to the collective **Shared Chorus Meter**—regardless of standing vs. seated mode or `gentle` (half-time) vs. `standard` (quarter-note) difficulty.
* Pausing suspends the beat clock without subtracting earned progress, and `tracking_uncertain` frames never reduce the meter.
* Result: Neither friend is ever singled out for holding the group back, and both unlock the layered musical Shared Chorus equally.

#### Currency 2: Personal Flow Score & Club Competition (Relative Mastery)
To let a seated beginner and a high-stamina standing friend compete fairly on Strava-style club challenges and **Beat-Drop Segments**, score **rhythm accuracy and streak consistency relative to each player's own calibration**:

$$\text{BeatPoints} = B_{\text{tier}} \times M_{\text{streak}}$$

* **Base Tier Points ($B_{\text{tier}}$):** `Locked In` $= 100$, `On Beat` $= 70$, `Moving` $= 40$.
* **Forgiving Streak Multiplier ($M_{\text{streak}}$):** Advances across consecutive on-beat reps ($0\text{–}3 \rightarrow 1.0\times$, $4\text{–}7 \rightarrow 1.25\times$, $8\text{–}11 \rightarrow 1.5\times$, $12+ \rightarrow 2.0\times$). Rather than resetting harshly to $1.0\times$ on a single off-beat rep, step down **one multiplier tier** to keep momentum positive while still rewarding sustained rhythm flow.
* **Inclusive Club Leaderboards:** Rank friends strictly on **Consistency Streaks ("Local Legend")**, **Weekly Active Minutes**, and **Beat-Drop Segment Accuracy (%)**—explicitly avoiding raw difficulty or global public leaderboards.

---

## 3. Research on the Adaptive Health System

PULSE's health system is designed around one guiding principle: **deliver scientifically honest, accessible movement tracking without inventing fake biometric claims from a webcam.**

### 3.1 Public Health Foundation: Active Minutes Over Fake Calories

1. **WHO & CDC Inclusive Activity Guidelines:**
   Both the World Health Organization (*WHO Guidelines on Physical Activity and Sedentary Behaviour*) and the CDC (*Physical Activity Guidelines for Adults with Disabilities*) recommend $150\text{–}300\text{ minutes/week}$ of moderate-intensity aerobic activity (or $75\text{–}150\text{ minutes/week}$ of vigorous activity, where $1\text{ min vigorous} \approx 2\text{ min moderate}$), plus muscle-strengthening activities on $\ge 2\text{ days/week}$. Crucially, modern guidelines explicitly affirm:
   * **Every Bout Counts:** Short movement bouts of *any duration* (such as PULSE's $5\text{–}15\text{ minute}$ sessions and seated desk resets) accumulate toward weekly health targets.
   * **Inclusivity First:** Physical activity guidelines apply to adults of all abilities, and *"some physical activity is better than none."*
2. **Why PULSE Deliberately Rejects Webcam Calorie Estimates:**
   Landmark Stanford validation research by Shcherbina et al. (2017) tested seven leading wrist-worn fitness trackers against gold-standard indirect calorimetry and found that while $6$ of $7$ devices measured heart rate within $5\%$ error, **none measured energy expenditure accurately—median calorie errors ranged from $27.4\%$ to $92.6\%$**, with seated/cycling errors spiking around $52\%$ and later free-living reviews (Murakami et al., 2019; O'Driscoll et al., 2020) confirming $19\%\text{–}100\%$ error ranges. If optical heart-rate wearables cannot estimate calorie burn reliably, guessing calories from a monocular webcam is scientifically indefensible. PULSE therefore tracks **Active Minutes**, **Completed Movement Blocks**, **Rhythm Consistency**, and **Perceived Effort Load** instead.

### 3.2 Validated Self-Regulated Intensity: Borg RPE, Talk Test & sRPE

Without requiring expensive smartwatches, sports science provides three gold-standard methods for monitoring and regulating workout intensity that work equally well for standing and seated exercisers:

* **Borg RPE & Perceptually Regulated Exercise (PRET):**
  Gunnar Borg's Rating of Perceived Exertion (original $6\text{–}20$ scale and modified Category-Ratio **CR-10** $0\text{–}10$ scale) integrates heart rate, breathing rate, muscle fatigue, and sweat into a single validated psychophysiological metric. Research on Perceptually Regulated Exercise Testing (PRET) confirms that clamping exercise to perceived exertion reliably regulates aerobic intensity across sedentary beginners, endurance athletes, cardiac rehab participants, and **wheelchair/paraplegic athletes** alike.
* **The CDC / ACSM Talk Test (Intuitive In-Block Anchoring):**
  Because numeric RPE scales can feel abstract during a fun dance session, anchor PULSE's simple 3-button block check-in (*Easier / Comfortable / Harder*) to the validated **Talk Test** (CDC; Reed & Pipe, 2014):

| PULSE Check-In Option | Talk Test Breathing Anchor | Equivalent CR-10 RPE | Intensity Zone ($1\text{ MET} = \text{rest}$) | Engine Adaptation Response |
| :--- | :--- | :--- | :--- | :--- |
| **Harder** *(Too Light)* | *"Could easily sing along"* | $1\text{–}3$ (Light) | $< 3\text{ METs}$ | Step up max $1$ tier within chosen exclusions (e.g., half-time $\rightarrow$ full-beat cadence). |
| **Comfortable** *(Target Zone)* | *"Can talk, but cannot sing"* | $4\text{–}6$ (Moderate) | $3\text{–}6\text{ METs}$ | Maintain current block level; counts $1\times$ toward weekly moderate active minutes. |
| **Easier** *(Too Intense)* | *"Can only say a few words before catching breath"* | $7\text{–}9$ (Vigorous) | $> 6\text{ METs}$ | Step down max $1$ tier (smaller range, half-time beat, remove overhead cues); show plain-language banner. |

* **Foster's Session-RPE (sRPE) & Strava-Style "PULSE Effort Score":**
  Foster et al. (2001) validated **Session-RPE** against heart-rate-derived Training Impulse (TRIMP) as a modality-independent measure of internal training load—the exact conceptual foundation behind Strava's *Relative Effort* score:

  $$\text{PULSE Effort Load (AU)} = \text{Active Duration (min)} \times \text{Session CR-10 RPE (1–10)}$$

  * *Why this powers inclusive health tracking:* Because internal load reflects *what the individual experienced* rather than external speed or jump height, a 10-minute seated session at moderate effort ($\text{RPE } 5 \Rightarrow 50\text{ AU}$) and a 10-minute standing session at moderate effort ($\text{RPE } 5 \Rightarrow 50\text{ AU}$) register identical health effort.
  * *Longitudinal Progression Guardrail (Post-MVP):* Rolling weekly load tracks sustainable progression via the **Acute:Chronic Workload Ratio** ($\text{ACWR} = \text{Current Week Load} / \text{4-Week Average Load}$), targeting the $0.80\text{–}1.30$ safe adaptation zone and warning against sudden weekly spikes exceeding $10\%$ (or $5\%$ when returning from rest/injury).

### 3.3 Inclusive Adaptation, Safety & Privacy Guardrails

To keep PULSE credible for both **People First** and conditional **Health** evaluation:

1. **Goal-Specific Pacing Profiles:**
   * *Stamina:* Prioritizes continuous 20–30 s rhythmic loops targeting Talk-Test moderate intensity ($4\text{–}6$ CR-10).
   * *Coordination:* Emphasizes alternating multi-limb rhythm patterns (`alternating_reach` + `lateral_step_tap`) and Beat-Drop timing consistency over high cadence.
   * *Active Break (5-Min Desk Reset):* Prioritizes low-friction upper-body and seated mobility blocks designed to interrupt prolonged sitting with zero equipment.
2. **Strict Boundary & Consent Rules:**
   * Optional height and weight inputs **never** automatically assign workout difficulty or infer fitness level.
   * Selecting *Harder* never overrides declared movement exclusions (e.g., `no_overhead_reach`, `no_lateral_step`, `seated`).
   * Sustained missed reps under high camera confidence trigger a **consent prompt** (*"Want a smoother pace next round?"*) rather than silently downgrading the user.
   * Webcam motion is **never** presented as heart rate, clinical fatigue, medical clearance, or rehabilitation therapy.
3. **Optional Wearable Telemetry Policy (Stretch Layer):**
   * Self-reported effort always ships first as the primary health input.
   * Optional live BPM integration uses the browser-native **Web Bluetooth API** (`navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })`, GATT Service `0x180D`, Characteristic `0x2A37`), parsing bit 0 of byte 0 to extract 8-bit or little-endian 16-bit BPM.
   * Native Apple Watch (HealthKit/watchOS), Garmin Health API (approval-gated), and WHOOP OAuth (recovery/sleep summaries, not live BPM) are deferred post-weekend. Any wearable display must show **source**, **timestamp freshness**, **user override**, and an explicit **"Simulated"** label whenever mocked data is used.

---

## 4. Unified Data Pipeline: Connecting Sync, Points & Health

All three subsystems communicate through one deterministic loop so vision, audio, scoring, and health records never diverge:

| Pipeline Stage | Frequency | Subsystem Owner | Key Output & Consumer |
| :--- | :--- | :--- | :--- |
| **1. Beat Scheduling** | Every $25\text{ ms}$ ($100\text{ ms}$ lookahead) | `beatClock.ts` & `stemMixer.ts` | Schedules audio stems on `audioCtx.currentTime` and queues `{ beatIndex, audioTime }` for Canvas animations and scoring. |
| **2. Frame Capture & Mapping** | $30\text{ FPS}$ (`requestVideoFrameCallback`) | `poseEngine.ts` + `oneEuroFilter.ts` | Extracts active landmarks, applies 1€ smoothing, and maps `metadata.presentationTime` to exact heard song time $t_{\text{song}}$. |
| **3. Three-Gate Evaluation** | Per target beat | `moveDetectors.ts` + `rhythmGrader.ts` | Runs Confidence Gate $\rightarrow$ Hysteresis Spatial/Velocity Gate $\rightarrow$ Asymmetric Temporal Gate; emits `BeatEvaluation`. |
| **4. Dual-Currency Update** | Per beat | `sessionMachine.ts` | Adds equal $+1$ active unit to **Shared Chorus Meter** (triggering bar-aligned chorus stem ramp at $100\%$) and updates **Flow Score**. |
| **5. Block Health Check-In** | Every $20\text{–}30\text{ s}$ | `adaptationEngine.ts` | Combines user's Talk-Test effort tap (`easier` / `comfortable` / `harder`) with high-confidence block completion to generate next `BlockPlan` and plain-language explanation. |
| **6. Session Health & Club Commit** | End of session | `clubStore.ts` + `ghostRecorder.ts` | Computes Active Minutes, PULSE Effort Load (sRPE), Beat-Drop accuracy, and zero-video Neon Ghost JSON; publishes privacy-safe `FeedPost` to Club Feed. |

### Core TypeScript Interface Bridge (`src/types/syncPointsHealth.ts`)

```typescript
export interface ClockBridgeSnapshot {
  songStartAudioSec: number;
  contextTimeSec: number;        // from audioCtx.getOutputTimestamp()
  performanceTimeMs: number;     // paired DOMHighResTimeStamp
  cameraOffsetSec: number;       // calibrated delta_cam (default ~0.045s)
  bpm: number;
}

export type BeatTier = "locked_in" | "on_beat" | "moving" | "tracking_uncertain" | "unmatched";

export interface BeatEvaluation {
  beatIndex: number;
  moveFamily: "rhythmic_arm_press" | "alternating_reach" | "lateral_step_tap";
  activeVisibility: number;      // computed ONLY on mode-active landmarks
  rangeRatio: number;            // live displacement / personal calibrated R_max
  timingDeltaMs: number | null;  // signed (t_peak - t_targetBeat) in ms
  tier: BeatTier;
  sharedMeterIncrement: number;  // equal across standing/seated for any active tier
  flowPointsAwarded: number;     // tier base points * forgiving streak multiplier
}

export interface SessionHealthSummary {
  playerId: string;
  mode: "standing" | "seated";
  goal: "stamina" | "coordination" | "active_break";
  activeMinutes: number;         // WHO/CDC accumulative active time
  completedBlocks: number;
  rhythmConsistencyPct: number;  // % of confident beats hitting locked_in/on_beat
  sessionRpeCr10?: number;       // optional post-session CR-10 (1..10)
  pulseEffortLoadAu?: number;    // activeMinutes * sessionRpeCr10 (Foster sRPE)
  adaptationLog: string[];       // plain-language record of block adjustments
  wearable?: {
    source: "web_bluetooth_ble" | "simulated";
    avgBpm: number;
    freshnessIso: string;
    userOverridden: boolean;
  };
}
```

---

## 5. Technical & Scientific References

1. **Casiez, G., Roussel, N., & Vogel, D. (2012).** *1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems.* Proceedings of ACM CHI 2012, 2527–2530. https://gery.casiez.net/publications/CHI2012-casiez.pdf
2. **Centers for Disease Control and Prevention (CDC).** *Increasing Physical Activity among Adults with Disabilities.* https://www.cdc.gov/disability-and-health/conditions/physical-activity.html
3. **Centers for Disease Control and Prevention (CDC).** *Measuring Physical Activity Intensity (The Talk Test).* https://www.cdc.gov/physicalactivity/basics/measuring/index.html
4. **Cleveland Clinic (2023).** *Rated Perceived Exertion (RPE) Scale (Borg 6–20 & Modified CR-10).* https://my.clevelandclinic.org/health/articles/17450-rated-perceived-exertion-rpe-scale
5. **Eston, R. (2012).** *Use of Ratings of Perceived Exertion in Sports* (including Perceptually Regulated Exercise Testing across able-bodied and paraplegic athletes). International Journal of Sports Physiology and Performance / ResearchGate. https://www.researchgate.net/publication/225064358_Use_of_Ratings_of_Perceived_Exertion_in_Sports
6. **Foster, C., Florhaug, J. A., Franklin, J., et al. (2001).** *A New Approach to Monitoring Exercise Training (Session-RPE).* Journal of Strength and Conditioning Research; summarized in Elite Coaching Hub sRPE Guide: https://elitecoachinghub.com/resources/srpe
7. **Google AI Edge (2026).** *Pose Landmarker — MediaPipe Solutions Web Documentation.* https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
8. **Kabe-Tech (2026).** *MediaPipe Pose 33 Landmarks: Index List and Measured Visibility Behavior (`>= 0.10.11`).* https://kabe-tech.com/blog/poseMirror/mediapipe-landmarks-en
9. **MDN Web Docs.** *AudioContext: `getOutputTimestamp()` method.* https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
10. **MDN Web Docs.** *HTMLVideoElement: `requestVideoFrameCallback()` method.* https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
11. **MDN Web Docs.** *Web Audio API — Advanced Techniques (Lookahead Scheduling).* https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques
12. **MDN Web Docs.** *Web Bluetooth API.* https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
13. **Reed, J. L., & Pipe, A. L. (2014).** *The Talk Test: A Useful Tool for Prescribing and Monitoring Exercise.* Current Opinion in Cardiology (PubMed 25010379). https://pubmed.ncbi.nlm.nih.gov/25010379/
14. **Shcherbina, A., Mattsson, C. M., Waggott, D., et al. (2017).** *Accuracy in Wrist-Worn, Sensor-Based Measurements of Heart Rate and Energy Expenditure in a Diverse Cohort.* Journal of Personalized Medicine / Stanford Medicine News. https://med.stanford.edu/news/all-news/2017/05/fitness-trackers-accurately-measure-heart-rate-but-not-calories-burned.html
15. **Strava Help Center (2026).** *What Is Relative Effort on Strava? (Heart Rate & Perceived Exertion).* https://support.strava.com/en-us/articles/15401794-what-is-relative-effort-on-strava
16. **Wilson, C. (2013).** *A Tale of Two Clocks — Scheduling Web Audio with Precision.* web.dev. https://web.dev/articles/audio-scheduling
17. **World Health Organization (WHO).** *WHO Guidelines on Physical Activity and Sedentary Behaviour (Adults Living with Disability).* NCBI Bookshelf. https://www.ncbi.nlm.nih.gov/books/NBK566048/
