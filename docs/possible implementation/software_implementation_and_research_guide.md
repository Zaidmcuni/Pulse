# PULSE: Software Implementation & Technical Research Guide

*CodeJam 16 • Software Engineering & Methods Research Monograph*

> A deep-dive architectural analysis evaluating candidate implementation pathways, researched computer vision and signal-processing methods, precision audio synchronization, deterministic adaptive scoring, and zero-video social silhouette pipelines.

* **Target Platform:** Desktop Chromium Browser (Offline-First)
* **Hackathon Cutoff:** Sunday 12:00 PM EST (GitHub)
* **Date:** November 21, 2026

---

## 1. System Architecture Options & Implementation Topologies

Before writing application code, the engineering team must choose an execution topology that balances real-time frame rate, audio-visual synchronization accuracy, privacy guarantees, and reliability under congested hackathon venue Wi-Fi. Three viable architectural pathways exist for building PULSE.

| Architecture Option | Core Stack | Strengths | Trade-Offs & Hackathon Risk |
| :--- | :--- | :--- | :--- |
| **Option A: 100% Client-Side Local-First App** *(Recommended MVP)* | Vite + React + TypeScript + `@mediapipe/tasks-vision` (WASM/WebGL) + Web Audio API + `localStorage` | Sub-35 ms pose latency; zero network calls during judging; absolute video privacy (frames never leave browser memory); native hardware audio clock sync. | Social club feed and profiles live on the local demo laptop rather than syncing across separate devices until a backend is added post-weekend. |
| **Option B: Client CV + Lightweight Cloud Sync** *(Post-MVP Upgrade)* | Option A frontend + Supabase / Firebase or Node.js WebSocket server | Enables live multi-device Strava-style club feeds, remote friend turn-taking rooms, and persistent athlete profiles across laptops. | Introduces OAuth/database boilerplate, schema migrations, CORS debugging, and live failure risk if Trottier Wi-Fi drops during the 3–5 minute judging slot. |
| **Option C: Python CV Backend + Web UI** *(Not Recommended)* | FastAPI + OpenCV/MediaPipe Python + WebSocket frame streaming + React UI | Familiar to teams stronger in Python than TypeScript; direct access to desktop OpenCV and NumPy utilities. | Encoding and streaming webcam frames over local WebSockets adds 40–100 ms jitter, complicates Web Audio beat sync, and adds multi-process startup fragility. |

> **Recommended Implementation Decision:** Build **Option A (100% Client-Side Browser App)** for CodeJam 16 with strict TypeScript data contracts and offline-bundled MediaPipe assets inside `public/`. Architect the social persistence layer behind a thin repository interface (`ClubStore`) so swapping `localStorage` for a REST/WebSocket backend after the hackathon requires changing only one file.

### 1.1 Recommended Modular Codebase Structure

Separating perception, signal math, audio timing, state control, and social UI into isolated modules allows parallel development across teammates (and AI coding workstreams) without merge conflicts:

```text
pulse-app/
├── public/
│   ├── models/pose_landmarker_lite.task     # Offline-bundled MediaPipe weights
│   ├── wasm/                                # Local MediaPipe WASM binaries (zero CDN)
│   └── audio/                               # Rights-cleared pre-synced WAV/OGG stems
└── src/
    ├── types/pulse.ts                       # Locked shared contract (profiles, poses, blocks)
    ├── vision/
    │   ├── poseEngine.ts                    # MediaPipe VIDEO runner + GPU/CPU check
    │   ├── oneEuroFilter.ts                 # Adaptive landmark smoothing (Casiez 2012)
    │   ├── jointMasks.ts                    # Standing vs. Seated landmark isolation
    │   └── calibration.ts                   # 5s shoulder-width & personal range capture
    ├── scoring/
    │   ├── moveDetectors.ts                 # Hysteresis rules for 3 authored move families
    │   ├── rhythmGrader.ts                  # Latency-shifted beat windows + Flow Score
    │   └── adaptationEngine.ts              # Deterministic block step-up / step-down rules
    ├── audio/
    │   ├── beatClock.ts                     # Lookahead scheduler (AudioContext.currentTime)
    │   └── stemMixer.ts                     # Parallel stems + bar-aligned Shared Chorus gain
    ├── engine/
    │   └── sessionMachine.ts                # Finite-state controller (turn-taking & pause)
    ├── ghost/
    │   ├── ghostRecorder.ts                 # 10 FPS quantized vector capture (~15 KB/block)
    │   ├── ghostRenderer.ts                 # 60 FPS lerped 9:16 neon Duet canvas
    │   └── ghostExporter.ts                 # captureStream + MediaRecorder local export
    ├── social/
    │   └── clubStore.ts                     # Seeded Strava-style feed, kudos, forum, streaks
    └── ui/                                  # Onboarding, Live HUD, Check-in, Recap, Club views
```

---

## 2. Research on Computer Vision & Pose Estimation Methods

### 2.1 Historical Lineage: From Dedicated Console Hardware to Monocular RGB

Understanding how commercial dance platforms solved human motion tracking clarifies why PULSE's browser architecture is both feasible and superior to legacy console cameras:

* **Nintendo Wii Remote (2006) — Inertial Only:** Used a 3-axis accelerometer (plus MotionPlus gyroscope) to score right-hand acceleration curves against reference files, allowing seated wrist-flicking while ignoring actual body posture.
* **Xbox Kinect (2010–2013) — Active Infrared Depth & Seated Isolation:** [Shotton et al. (2011)](#ref-shotton2011) demonstrated per-pixel Randomized Decision Forests on $640 \times 480$ active infrared depth frames to infer 3D skeletal joint proposals in under 5 ms with zero markers. Crucially, the Kinect SDK formalized separate **Standing (20-joint)** and **Seated (10-joint upper-body)** pipelines so chairs and desks did not corrupt lower-body tracking—the exact isolation pattern PULSE adopts.
* **PlayStation 4 Camera (2013) — Dual RGB Stereo:** Lacked active IR depth, causing visible-light silhouette segmentation to drop users mid-song under uneven lighting, cluttered backgrounds, or varying heights.
* **Ubisoft *Just Dance 2026* Camera Controller (2025):** [Ubisoft Paris (2025)](#ref-ubisoft2025) replaced dedicated depth sensors with a deep-learning 3D skeletal estimator running on ordinary monocular RGB smartphone cameras, paired with a custom ML scoring model trained on thousands of recorded volunteer dance clips.

### 2.2 Comparative Research: Browser & Local Pose Estimation Methods

| Method / Runtime | Landmarks | Technical Characteristics | Suitability for PULSE |
| :--- | :--- | :--- | :--- |
| **MediaPipe Pose Landmarker (BlazePose)** `@mediapipe/tasks-vision` | 33 3D points (image + metric world coords) | Lightweight CNN combining heatmap training with direct keypoint regression ([Bazarevsky et al., 2020](#ref-bazarevsky2020)). Runs locally in WASM/WebGL with Lite, Full, and Heavy variants ([Google AI Edge, 2026](#ref-mediapipe-docs)). | **Best Choice.** Captures shoulders, elbows, wrists, hand direction, hips, knees, and ankles cleanly at 30–60 FPS on laptop browsers with zero data leaving the device. |
| **TensorFlow.js MoveNet** (Lightning / Thunder) | 17 2D COCO points | Optimized for ultra-fast single-person 2D tracking on mobile web and WebViews, reaching 30–50+ FPS on phones ([PoseTracker, 2026](#ref-posetracker2026)). | **Strong Fallback** if targeting low-end smartphones, but lacks hand/foot orientation points and 3D depth estimates useful for forward arm presses. |
| **ONNX Runtime Web + YOLOv8-pose / RTMPose** | 17 COCO points (multi-person) | Strong single-stage multi-person detection on desktop GPUs, but requires manual model export, letterbox preprocessing, and NMS post-processing. | **Over-Engineered** for a 36-hour hackathon since PULSE intentionally uses single-person turn-taking (`numPoses: 1`) for Trottier framing reliability. |
| **Classical OpenCV** (Optical Flow / Contours) | Dense motion vectors / blobs | Zero neural network weights; ultra-fast CPU execution via Lucas-Kanade optical flow or frame differencing. | **Insufficient Alone.** Cannot distinguish specific limbs, enforce seated joint exclusions, or ignore passersby walking in the background. |

### 2.3 Critical MediaPipe Implementation Details & Undocumented Pitfalls

Measured behavior across `@mediapipe/tasks-vision` releases reveals five engineering nuances that must be handled explicitly in `poseEngine.ts`:

* **Pin Package Version $\ge 0.10.11$ for Landmark Visibility:** Empirical testing by [Kabe-Tech (2026)](#ref-kabetech2026) documented that versions `0.10.0–0.10.10` omit the per-joint `visibility` key (returning `undefined`), causing checks like `lm.visibility > 0.5` to fail silently on every frame. Pin `@mediapipe/tasks-vision` to `>= 0.10.11` (or `1.x`) and assert `typeof lm.visibility === "number"` during initialization.
* **Bundle WASM & Lite Model Locally:** Pass local paths to `FilesetResolver.forVisionTasks("/wasm")` and `modelAssetPath: "/models/pose_landmarker_lite.task"`. Choose the **Lite** model first for maximum FPS on laptop integrated graphics; upgrade to **Full** only if live testing shows stable $\ge 30$ FPS with WebGL enabled.
* **`VIDEO` Running Mode & Monotonic Timestamps:** Use `runningMode: "VIDEO"` with `detectForVideo(videoEl, performance.now())`, invoking inference only when `videoEl.currentTime !== lastVideoTime` to avoid redundant calls on duplicate webcam frames ([Google AI Edge, 2026](#ref-mediapipe-docs)).
* **Kinect-Style Active Joint Isolation:** When seated behind a desk, MediaPipe still hallucinates coordinates for occluded hips, knees, and ankles with lower visibility ([Kabe-Tech, 2026](#ref-kabetech2026)). PULSE's `jointMasks.ts` reads only indices `11–16` (shoulders, elbows, wrists) plus nose anchor `0` in seated mode, completely excluding `23–32` from both scoring and confidence averaging.
* **Horizontal Mirroring & Background Lock:** Mirror the rendered canvas via `ctx.scale(-1, 1)` so reaching left appears on the left side of the screen, and swap left/right feedback cues accordingly. To stop background passersby from hijacking `numPoses: 1`, store the dancer's calibrated shoulder midpoint and reject sudden single-frame centroid jumps exceeding `0.35` normalized screen width until the primary mover returns.

---

## 3. Signal Smoothing, Calibration & Noise Resilience

### 3.1 Research on Real-Time Landmark Smoothing Filters

Raw webcam pose coordinates exhibit high-frequency pixel jitter when a dancer holds still, which causes flickering skeletons and false movement triggers. However, heavy fixed smoothing introduces phase lag that makes dancers feel "late" against a musical beat.

| Filtering Method | Mechanism | Jitter vs. Lag Trade-Off for Dance |
| :--- | :--- | :--- |
| **One Euro (1€) Filter** ([Casiez et al., 2012](#ref-casiez2012)) *(Recommended)* | Adaptive first-order low-pass filter that scales its cutoff frequency dynamically from estimated movement speed (derivative). | **Optimal for Interactive Motion.** Uses a low cutoff at rest to eliminate skeleton tremor, then raises the cutoff during fast arm presses or steps to preserve crisp beat timing with minimal lag. |
| **Exponential Moving Average (EMA)** | Fixed smoothing factor: $y_t = \alpha x_t + (1 - \alpha) y_{t-1}$ | Simplest 1-line fallback ($\alpha \approx 0.35$), but cannot simultaneously silence rest jitter and track fast hits without noticeable lag. |
| **Moving Average / Savitzky-Golay** | Averages or fits a polynomial across the last $N$ frames. | Introduces a constant delay of $(N - 1) / 2$ frames ($\approx 80\text{–}150\text{ ms}$), degrading perceived rhythm responsiveness. |
| **Kalman Filter** | Recursive state-space estimator predicting position and velocity under Gaussian noise covariances. | Strong theoretical optimality, but requires tuning process/measurement covariance matrices per joint—unnecessary complexity over the two-parameter 1€ filter. |

#### Exact Mathematical Implementation of the 1€ Filter

Per [Casiez, Roussel, and Vogel (2012)](#ref-casiez2012), each landmark coordinate channel ($x$, $y$) maintains an independent filter instance updated at frame interval $T_e = \Delta t$ (in seconds):

1. **Smoothing Factor Helper:**
   $$\alpha(f_c) = \frac{1}{1 + \tau / T_e}, \quad \text{where } \tau = \frac{1}{2\pi f_c}$$
2. **Filtered Speed (Derivative):**
   $$\hat{dx}_i = \alpha(f_d) \cdot \left(\frac{x_i - \hat{x}_{i-1}}{T_e}\right) + \left(1 - \alpha(f_d)\right) \cdot \hat{dx}_{i-1} \quad (\text{with } f_d = 1.0\text{ Hz})$$
3. **Adaptive Cutoff Frequency:**
   $$f_c = f_{c_{\min}} + \beta \cdot |\hat{dx}_i|$$
4. **Filtered Position Output:**
   $$\hat{x}_i = \alpha(f_c) \cdot x_i + \left(1 - \alpha(f_c)\right) \cdot \hat{x}_{i-1}$$

**Recommended Starting Parameters for PULSE:** Set `mincutoff = 1.0` Hz (reduces standing/seated tremor) and `beta = 0.03` (reduces lag during brisk arm reaches and lateral steps). Tuning protocol: first adjust `mincutoff` while standing still until skeleton jitter vanishes, then increase `beta` during rapid arm presses until the overlay tracks the wrists crisply.

### 3.2 Personal Range Calibration & Scale-Invariant Normalization

To eliminate the height and camera-distance failures that plagued legacy RGB camera systems, Step 2 runs a 5-second calibration capture computing three personalized scalars:

* **Shoulder Scale Anchor:**
  $$W_s = \sqrt{(x_{11} - x_{12})^2 + (y_{11} - y_{12})^2}$$
* **Neutral Torso Midpoint:**
  $$C_0 = \left(\frac{x_{11} + x_{12}}{2},\ \frac{y_{11} + y_{12}}{2}\right)$$
* **Personal Comfortable Range:**
  $$R_{\max} = \text{90th-percentile peak normalized displacement during calibration}$$

Dividing every live joint displacement by $W_s$ guarantees identical detection geometry whether a dancer sits 3 feet from a Trottier desk or stands 7 feet back. Grading live repetitions as $\text{rangeRatio} = d_{\text{live}} / R_{\max}$ (crediting hits at $\ge 70\%$ of personal $R_{\max}$) ensures a seated user with limited range and a tall standing user experience identical fairness.

---

## 4. Move Detection, Rhythm Grading & Adaptive Scoring Methods

### 4.1 Comparing Motion-Scoring Paradigms

| Scoring Paradigm | How It Evaluates Movement | Pros, Cons & PULSE Verdict |
| :--- | :--- | :--- |
| **Deterministic Joint Angles + Hysteresis** *(Recommended MVP)* | Computes specific joint angles and calibration-normalized displacements; counts beat-aligned reps via upper/lower trigger thresholds. | **Selected.** Zero training dataset required; runs in $< 0.2\text{ ms}$; directly respects exclusion masks; produces plain-language feedback judges can verify live. |
| **Cosine Similarity on Limb Vectors** | Computes normalized dot product between player's bone vectors and reference coach pose vectors per frame. | Good for static yoga holds, but penalizes natural rhythmic variation and seated adaptations unless separate full-skeleton templates are authored for every body type. |
| **Dynamic Time Warping (DTW)** | Non-linearly aligns a time series of player pose frames against a reference motion sequence. | Tolerates speed differences, but introduces latency (requires buffering an entire gesture window before scoring) and produces opaque distance values hard to adapt cleanly. |
| **Supervised ML Scorer** ([Ubisoft Paris, 2025](#ref-ubisoft2025)) | Trains a neural/tree classifier on thousands of labeled player-vs-coach motion clips. | Industry standard for large choreography catalogs, but impossible to collect balanced standing + seated labeled datasets within a 36-hour hackathon. |

### 4.2 Exact Detection Geometry & Hysteresis Rules for the 3 Move Families

For any three consecutive landmarks $A$, $B$ (vertex), and $C$, define limb vectors $\mathbf{u} = A - B$ and $\mathbf{v} = C - B$. The interior joint angle in degrees is:

$$\theta(A, B, C) = \arccos\left(\operatorname{clamp}\left(\frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \times \|\mathbf{v}\|}, -1, 1\right)\right) \times \frac{180^\circ}{\pi}$$

To prevent noise near a threshold from double-counting a single movement, every detector implements a two-state **Schmitt-trigger hysteresis machine** (`READY` $\rightarrow$ `TRIGGERED` when crossing the upper threshold, resetting back to `READY` only after falling below the lower threshold):

| Move Family | Active MediaPipe Indices | Standing Mode Rule | Seated / Exclusion Adaptive Rule |
| :--- | :--- | :--- | :--- |
| **1. Rhythmic Arm Press** *(Build First)* | Shoulders `11, 12`<br>Elbows `13, 14`<br>Wrists `15, 16` | Elbow angle $\theta(11, 13, 15)$ or $\theta(12, 14, 16)$ triggers when extending **$> 145^\circ$** (or wrist distance from shoulder $\ge 0.70 \times R_{\max}$); resets when flexing **$< 105^\circ$**. | **Identical upper-body geometry.** Requires zero lower-body visibility; validates standing and seated desk play on the very first build pass. |
| **2. Alternating Reach** | Shoulders `11, 12`<br>Wrists `15, 16` | Alternating left/right wrist vertical elevation above shoulder ($y_{\text{shoulder}} - y_{\text{wrist}} \ge 0.70 \times R_{\max}$); resets below $0.35 \times R_{\max}$; enforces L/R alternation. | If `no_overhead_reach` is active, swaps vertical axis to horizontal forward/side wrist reach at chest height ($|x_{\text{wrist}} - x_{\text{shoulder}}| \ge 0.70 \times R_{\max}$). |
| **3. Lateral Step / Tap** | Standing: `11, 12, 23, 24, 27, 28`<br>Seated: `0, 11, 12, 15, 16` | Torso/hip midpoint shifts laterally past $\pm 0.35 \times W_s$ from calibrated center $C_0$; resets inside $\pm 0.15 \times W_s$. | Seated sway + side tap: shoulder midpoint shifts laterally past $\pm 0.20 \times W_s$ (or alternating wrist crosses side target zone); indices `23–32` ignored. |

### 4.3 Latency-Compensated Rhythm Grading & Dual-Currency Scoring

Real-time browser vision introduces a cumulative **130–250 ms pipeline delay** (webcam exposure $\approx 33\text{ ms}$ + MediaPipe WASM inference $\approx 25\text{ ms}$ + display/speaker output $\approx 60\text{–}100\text{ ms}$). Consequently, a dancer moving precisely on the musical beat registers slightly late in code. PULSE compensates by centering the scoring window slightly after the nominal beat timestamp $t_{\text{beat}}$ (using $\Delta t = t_{\text{peak}} - t_{\text{beat}}$):

* **Locked In (100 pts):** $-100\text{ ms} \le \Delta t \le +260\text{ ms}$ (tight rhythmic feel compensated for browser capture latency).
* **On Beat (70 pts):** $-220\text{ ms} \le \Delta t \le +420\text{ ms}$ (outside Locked In bounds).
* **Moving (40 pts):** Valid movement detected outside beat window—still credited as healthy movement to avoid punitive failure banners.
* **Tracking Uncertain (No Penalty):** Active-joint mean visibility $< 0.55$ freezes grading, displays *"Tracking uncertain — keep moving!"*, and never penalizes the player.

**Decoupled Co-Op & Competitive Currencies:** Every active beat (Locked In, On Beat, or Moving) adds an **equal base increment** to the collective **Shared Chorus Meter** regardless of standing/seated mode or difficulty tier. Independently, **Flow Score** ($\sum \text{TimingPoints} \times \text{StreakMultiplier}$, scaling $1.0\times \rightarrow 1.2\times \rightarrow 1.5\times \rightarrow 2.0\times$ at 4/8/16 streaks) powers fair, opt-in Strava-style club comparisons on Beat-Drop Segments and Consistency Streaks without disadvantaging seated participants.

### 4.4 Deterministic Block Adaptation Rules

At the end of every 20–30 second block, `adaptationEngine.ts` combines the user's explicit `EffortCheck` selection with reliable block telemetry (`avgConfidence` and `completionRatio`) to compute the next `BlockPlan`:

| Input Signal | Engine Rule | Next-Block Action & Visible UI Message |
| :--- | :--- | :--- |
| User taps **Easier** | Step down max 1 tier (`standard` $\rightarrow$ `gentle`); shift from quarter-note to half-time cadence (every 2 beats); tighten range multiplier to $0.85 \times R_{\max}$. | *"You asked for easier movement. Next block: half-time beat, smaller range, no overhead reach."* |
| User taps **Harder** | Step up max 1 tier (`gentle` $\rightarrow$ `standard`) strictly within active `exclusions`; never re-enable excluded lower-body or overhead cues. | *"Stepping it up! Next block: full-beat tempo within your chosen comfort limits."* |
| User taps **Comfortable** (High confidence, `completionRatio < 0.35`) | Never silently downgrade without consent; highlight *Easier* on the check-in card with a gentle suggestion. | *"Want a smoother pace next round? Tap Easier for half-time steps, or stay right here."* |
| Low confidence (`avgConfidence < 0.55`) | Ignore observed misses completely; treat telemetry as camera/lighting noise rather than fatigue. | *"Camera tracking was uncertain on that block — keeping your current level steady."* |

---

## 5. Web Audio Synchronization & Layered Shared Chorus

### 5.1 Research: "A Tale of Two Clocks" Lookahead Pattern

Standard JavaScript timers (`setInterval` / `setTimeout`) run on the single-threaded UI event loop alongside React renders and MediaPipe WASM inference, accumulating audible rhythm drift within seconds. To guarantee rock-solid musical timing, PULSE implements the canonical Web Audio lookahead scheduler established by [Wilson (2013)](#ref-wilson2013):

1. **Single Hardware Clock:** All beat events and stem transitions reference `audioContext.currentTime`, which runs on a dedicated high-precision audio thread immune to main-thread frame drops.
2. **Lookahead Scheduler Loop:** A lightweight `25 ms` JavaScript timer scans `100 ms` ahead (`scheduleAheadTime = 0.1`). Whenever `nextBeatTime < audioContext.currentTime + 0.1`, it schedules audio events at exact sample-accurate timestamps and pushes `{ beatIndex, time }` into a shared `beatQueue`.
3. **Visual Synchronization:** The React/Canvas `requestAnimationFrame` loop consumes timestamps from `beatQueue` whenever `beat.time <= audioContext.currentTime`, locking the animated coach preview and pulse rings tightly to the music.

### 5.2 Comparing 3 Audio Transition & Shared Chorus Implementations

| Audio Method | Implementation Mechanism | Trade-Offs & PULSE Verdict |
| :--- | :--- | :--- |
| **1. Pre-Synced Parallel Stems + Bar-Aligned Gain Ramp** *(Recommended)* | Decode 2–3 equal-length loop buffers (Base Drums/Groove, Player Role Bass/Melody, Shared Chorus Harmony). Call `source.start(t0)` on all buffers simultaneously with locked stems at `gain = 0`. At the next 4-beat bar boundary, ramp gain via `linearRampToValueAtTime(1.0, nextBar + 0.08)`. | **Zero Drift, Zero Clicks.** Guarantees sample-locked musical phase between Player 1's groove, Player 2's adaptive layer, and the Shared Chorus climax. |
| **2. Dynamic Buffer Chaining** | Queue new `AudioBufferSourceNode` loops dynamically at the end of each 4-bar phrase. | More flexible for multi-section songs, but compressed MP3 encoder padding introduces micro-gaps unless assets are encoded as seamless WAV/OGG loops. |
| **3. Procedural Web Audio Synth** | Synthesize kick, snare, bassline, and chorus chords live using `OscillatorNode`, noise buffers, and `BiquadFilterNode` driven by the lookahead clock. | **Zero-KB, 100% Copyright-Safe Fallback.** Ideal backup or complement to audio files; allows instant adaptive low-pass filtering when stepping into *Easier* mode. |

**Operational Audio Rules:** Resume the suspended `AudioContext` strictly inside the *Start Session* click handler to satisfy browser autoplay policies; route an optional `BiquadFilterNode` (low-pass gently rolling off high frequencies during *Easier* half-time blocks) so adaptation sounds musical; and always present using **wired laptop or wired portable speakers** because Bluetooth A2DP adds 150–300 ms of unpredictable audio lag.

---

## 6. Neon "Pulse Ghost" Silhouettes & Zero-Video Export

### 6.1 Vector Interpolation vs. Pixel Segmentation Masks

To deliver TikTok-ready 9:16 shareable workout replays without violating PULSE's zero-video privacy commitment, two implementation methods were compared:

| Silhouette Method | How It Works | Performance, Storage & Privacy Verdict |
| :--- | :--- | :--- |
| **Vector Skeleton Replay + 60 FPS Lerp** *(Recommended)* | Keeps `outputSegmentationMasks: false`; samples 13 quantized 2D normalized joints at 10–12 FPS; linearly interpolates between keyframes on an HTML5 Canvas with neon multi-pass stroke glow and wrist trails. | **10–25 KB JSON per 30s block.** Zero extra CV compute cost; fits effortlessly inside `localStorage` Club Feed posts; cleanly omits lower legs in seated mode; guarantees zero raw video capture. |
| **MediaPipe Segmentation Masks** | Enables `outputSegmentationMasks: true` to extract per-pixel human alpha masks on every frame. | Increases GPU memory overhead, reduces laptop FPS, and creates megabyte-scale binary mask sequences impractical to serialize for replay in browser storage. |

### 6.2 Duet Compositing, Graceful Fallbacks & Local Video Export

* **Side-by-Side Duet Normalization:** Before saving each 10 FPS frame, subtract torso midpoint $C_0$ and divide by shoulder width $W_s$. On the vertical 9:16 recap canvas (e.g., $540 \times 960$), render Player 1's standing neon skeleton in the left lane and Player 2's seated upper-body neon arcs in the right lane—synced to the same Shared Chorus beat—using `lerp(frameA, frameB, frac)` inside `requestAnimationFrame` for silky 60 FPS playback.
* **Graceful Degradation:** Joints with visibility $< 0.5$ fade into soft dotted strokes rather than snapping erratically; players in **Camera-Free Mode** appear as an audio-reactive neon equalizer ring beside their partner so they still appear visually represented in the Duet Card.
* **Zero-Server 9:16 Clip Export (Browser Native):** To let users download a real video clip locally without a backend, combine the 9:16 replay canvas video track via `canvas.captureStream(30)` ([MDN Web Docs, 2025a](#ref-mdn-canvas)) with the Web Audio chorus mix routed into `audioContext.createMediaStreamDestination()` ([MDN Web Docs, 2025b](#ref-mdn-audiostream)), merge both tracks into a single `MediaStream`, and record locally using `MediaRecorder` after probing codec support via `MediaRecorder.isTypeSupported()` for `video/webm;codecs=vp9,opus` or `video/mp4` ([MDN Web Docs, 2026](#ref-mdn-mediarecorder)).

---

## 7. Social Persistence, Optional Wearables & Verification Plan

### 7.1 Strava-Style Social Layer & Privacy-Safe Data Persistence

The `ClubStore` module wraps browser `localStorage` with a pre-seeded club fixture (*"McGill Friday Night Crew"* containing 3–4 realistic teammate posts, forum meetup messages, Beat-Drop Segment records, and Local Legend consistency streaks). Completing a live session automatically computes updated weekly active minutes, appends a new `FeedPost` containing the 15 KB Duet Ghost JSON and plain-language adaptation highlights, and persists one-click Kudos reactions—while strictly excluding raw video frames, optional height/weight inputs, and wearable recovery metrics from any shared object.

### 7.2 Optional Smartwatch Telemetry via Web Bluetooth (Stretch Layer)

Because native Apple Watch HealthKit apps, Garmin Health API developer approvals, and WHOOP summary OAuth flows cannot supply reliable live browser heart-rate streams in 36 hours, PULSE ships self-reported effort first. If all six core MVP gates pass ahead of schedule, optional live BPM telemetry can be added cleanly in Chromium browsers (Chrome/Edge over `localhost` or HTTPS) via the **Web Bluetooth API** ([MDN Web Docs, 2025c](#ref-mdn-bt); [Beaufort, Chrome Developers](#ref-chrome-bt)):

1. **Device Discovery:** Triggered strictly by a user button click, call `navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })` (standard GATT Service UUID `0x180D`).
2. **Notification Stream:** Connect to `device.gatt.connect()`, fetch service `'heart_rate'` and characteristic `'heart_rate_measurement'` (UUID `0x2A37`), call `characteristic.startNotifications()`, and listen to `characteristicvaluechanged`.
3. **Binary Packet Parsing:** Inspect bit 0 of byte 0 (`flags = dataView.getUint8(0)`): if `(flags & 0x01) === 0`, read 8-bit BPM via `dataView.getUint8(1)`; otherwise read little-endian 16-bit BPM via `dataView.getUint16(1, true)`.
4. **Testing & Honesty Guardrail:** Test reliably without physical watch pairing headaches using a smartphone running a BLE peripheral emulator (e.g., nRF Connect). Display source, timestamp freshness, user override, and a mandatory **"Simulated"** badge whenever mocked telemetry is shown.

### 7.3 Phased Implementation Verification Checklist

| Build Gate | Modules Completed | Objective Verification Test on Demo Laptop |
| :--- | :--- | :--- |
| **Gate 1 (First 20%)** | `pulse.ts`, `poseEngine.ts`, `oneEuroFilter.ts`, `beatClock.ts` | Disable laptop Wi-Fi; confirm MediaPipe loads offline from `public/` at $\ge 30$ FPS; verify `rhythmic_arm_press` triggers cleanly in sync with a looping Web Audio beat. |
| **Gate 2 (Next 40%)** | `calibration.ts`, `jointMasks.ts`, `moveDetectors.ts`, `adaptationEngine.ts` | New tester starts in $< 60\text{ s}$; tapping *Easier* visibly updates next block with plain-language reason; blocking webcam triggers `tracking uncertain` with zero penalty. |
| **Gate 3 (Next 25%)** | `sessionMachine.ts`, `stemMixer.ts`, `clubStore.ts`, `ghost/` | Standing Player 1 and Seated Player 2 earn equal Shared Chorus credit; bar-aligned chorus stem ramps cleanly without clicks; session auto-posts Duet Ghost to Club Feed. |
| **Gate 4 (Final 15%)** | Hard freeze, README, fallback clip, timed rehearsal | Full end-to-end demo passes twice consecutively without crashing; fresh `git clone` runs cleanly; final commit pushed to GitHub before **Sunday 12:00 PM EST**. |

---

## 8. Technical References

1. <a id="ref-bazarevsky2020"></a>Bazarevsky, V., Grishchenko, I., Raveendran, K., Zhu, T., Zhang, F., & Grundmann, M. (2020). *BlazePose: On-device Real-time Body Pose tracking*. CVPR Workshop on Computer Vision for Augmented and Virtual Reality (arXiv:2006.10204). https://arxiv.org/abs/2006.10204
2. <a id="ref-chrome-bt"></a>Beaufort, F. *Communicating with Bluetooth devices over JavaScript*. Chrome for Developers. https://developer.chrome.com/docs/capabilities/bluetooth
3. <a id="ref-casiez2012"></a>Casiez, G., Roussel, N., & Vogel, D. (2012). *1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems*. Proceedings of ACM CHI 2012, 2527–2530. https://gery.casiez.net/publications/CHI2012-casiez.pdf
4. <a id="ref-mediapipe-docs"></a>Google AI Edge (2026). *Pose Landmarker — MediaPipe Solutions Web Documentation*. https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
5. <a id="ref-kabetech2026"></a>Kabe-Tech (2026). *MediaPipe Pose 33 Landmarks: The Complete Guide — Index List and Measured Behavior*. https://kabe-tech.com/blog/poseMirror/mediapipe-landmarks-en
6. <a id="ref-mdn-canvas"></a>MDN Web Docs (2025a). *HTMLCanvasElement: captureStream() method*. Mozilla Developer Network. https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
7. <a id="ref-mdn-audiostream"></a>MDN Web Docs (2025b). *AudioContext: createMediaStreamDestination() method*. Mozilla Developer Network. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination
8. <a id="ref-mdn-bt"></a>MDN Web Docs (2025c). *Web Bluetooth API*. Mozilla Developer Network. https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
9. <a id="ref-mdn-mediarecorder"></a>MDN Web Docs (2026). *MediaRecorder — MediaStream Recording API*. Mozilla Developer Network. https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
10. <a id="ref-posetracker2026"></a>PoseTracker (2026). *MediaPipe vs MoveNet (2026): Which Pose Model for Mobile?* https://www.posetracker.com/compare/mediapipe-vs-movenet
11. <a id="ref-shotton2011"></a>Shotton, J., Fitzgibbon, A., Cook, M., Sharp, T., Finocchio, M., Moore, R., Kipman, A., & Blake, A. (2011). *Real-Time Human Pose Recognition in Parts from Single Depth Images*. Proceedings of IEEE CVPR 2011 / Microsoft Research Cambridge. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/BodyPartRecognition.pdf
12. <a id="ref-ubisoft2025"></a>Ubisoft Paris Studio (2025). *Revolutionising Motion Gaming: The Camera Controller Feature (Just Dance 2026)*. Ubisoft News & Updates. https://www.ubisoft.com/en-ca/game/just-dance/2026/news-updates/2UBGhF4xWMLAVVFMmTCWwn/revolutionising-motion-gaming-the-camera-controller-feature
13. <a id="ref-wilson2013"></a>Wilson, C. (2013). *A Tale of Two Clocks — Scheduling Web Audio with Precision*. web.dev. https://web.dev/articles/audio-scheduling
