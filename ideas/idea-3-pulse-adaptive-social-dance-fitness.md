# Idea 3: PULSE — Adaptive Social Dance Fitness

> **One beat. Your workout. Our progress.**  
> *Adaptive movement software that brings friends together without asking everyone to move the same way.*

- **Event:** CodeJam 16 (ECSESS McGill University, Trottier Building)
- **Date:** 20 November 2026
- **Primary Track:** People First ($200)
- **Secondary / Conditional Tracks:** Health ($200), Touch Grass ($200), Beginner ($200)
- **Tech Stack:** React, TypeScript, MediaPipe Pose Landmarker (`@mediapipe/tasks-vision`), Web Audio API, HTML5 Canvas

---

## 1. Project Overview & Core Problem

**PULSE** is a browser-based adaptive dance-fitness application that dynamically adjusts workout movement complexity, range of motion, and rest intervals to match each participant’s real-time effort and mobility preferences while keeping two friends synchronized to a shared musical beat. Rather than forcing every player to mirror identical high-impact choreography, Pulse adapts the movement to fit the individual so friends with different stamina, confidence, or physical constraints can exercise together toward one collective goal.

### The Human Problem & Core Hypothesis
Group workouts frequently fail because friends possess different baseline endurance, physical comfort, and movement preferences. A fixed routine leaves an experienced mover under-stimulated while leaving a beginner or seated participant frustrated and singled out. 

*Pulse tests a practical hypothesis:* people are significantly more willing to exercise together—and return for repeat sessions—when each person can move at their own sustainable level while sharing one unified social experience.

### Strategic Positioning
Beat a generic webcam pose-tracking demo by centering the entire experience on one memorable, cause-and-effect social mechanic: **visible individual adaptation feeding a cooperative Shared Chorus**.

| Inspiration Source | Borrowed Strength | Pulse’s Differentiated Design Choice |
|---|---|---|
| **Just Dance** (Camera Controller) | Immediate camera-based movement feedback and rhythmic choreography scoring. | Shift focus from competitive precision scoring to real-time individual adaptation and a cooperative shared goal. |
| **LES MILLS** (Dance Classes) | Approachable, structured movement families and clear musical cues. | Add a closed-loop effort check-in every 20–30 seconds that modifies the upcoming movement block. |
| **Cooperative Games** | Collective progress meters and shared celebratory milestones. | Use the **Shared Chorus** so standing and seated efforts contribute equally to unlocking musical rewards. |

---

## 2. The Signature Mechanic & User Experience

### The Shared Chorus
Two friends alternate short, personalized movement blocks (20–30 seconds each) in front of a single laptop camera. One participant may perform standing step-touches while the other performs seated arm patterns; both earn equal active-time credit toward one persistent collective meter. Pausing never deducts earned progress, and no participant is ever penalized or singled out for slowing the group down. When the collective meter fills, Pulse unlocks the **Shared Chorus**, layering richer harmonic audio stems and celebratory visual lighting while the common beat continues uninterrupted.

### Visible Adaptation Feedback
Whenever Pulse adjusts a block’s difficulty, the interface explicitly states both the trigger and the concrete choreography change—for example:  
*“You asked for easier movement. Next block: smaller steps, no overhead reach.”*  
This transparency ensures users understand how the system responds to their body in real time.

### 5-Step Session Lifecycle
| Session Step | User Action & System Behavior | Key Design & Safety Rules |
|---|---|---|
| **1. Choose** | Select fitness goal (*Stamina*, *Coordination*, or *Active Break*), session length (5–15 minutes), preferred music style, experience level, mode (*Standing* or *Seated*), and specific movement exclusions. | Height and weight remain strictly optional and never automatically dictate workout difficulty. |
| **2. Calibrate** | Complete a brief comfortable-range movement check in seated or standing mode to record personal joint extension bounds, followed by a visual move preview. | Includes a camera-free participation option so users can join without video tracking if preferred. |
| **3. Move** | Follow three authored move families—*lateral step/tap*, *alternating reach*, and *rhythmic arm press*—each authored with simpler variants and two difficulty tiers. | Camera feedback estimates participation and rhythmic timing relative to the user’s calibrated baseline. |
| **4. Adapt** | At the end of each 20–30 second block, choose *Easier*, *Comfortable*, or *Harder*. The engine combines this rating with reliable movement trends to update the next block. | Changes **one difficulty level at a time** and displays the plain-language explanation on screen. |
| **5. Celebrate** | Unlock the **Shared Chorus** once the collective meter fills, hear the layered music transition, review active time and block totals, and launch another shared session. | Highlights team contribution and completed blocks rather than raw accuracy percentages or calories. |

---

## 3. System Architecture & How It Works

Pulse runs entirely as a **local-first web application** built in **React and TypeScript**, eliminating backend video streaming latency and preserving user privacy. The architecture separates real-time computer vision perception from deterministic session state and musical timing through a strict, typed data contract.

```
+-------------------------------------------------------------+
|                     Client Browser                          |
|                                                             |
|  [ Webcam Feed ]                                            |
|         │                                                   |
|         ▼                                                   |
|  [ MediaPipe PoseLandmarker ] ──> Normalized PoseSample     |
|         │                                │                  |
|         ▼                                ▼                  |
|  [ Canvas Skeleton Overlay ]    [ Finite-State Machine ]    |
|                                          │                  |
|         ┌────────────────────────────────┼───────────────┐  |
|         ▼                                ▼               ▼  |
|  [ BlockPlan Engine ]           [ Shared Meter ]   [ Web Audio ]
|  (Adaptive Difficulty)          (Shared Chorus)    (Stem Clock)
+-------------------------------------------------------------+
```

### 3.1 Local Computer Vision Pipeline (MediaPipe Pose Landmarker)
Webcam frames are processed locally on the client device using `@mediapipe/tasks-vision` (`PoseLandmarker`) with an HTML5 Canvas skeletal overlay. Rather than comparing raw screen coordinates—which vary with user height and camera distance—Pulse evaluates selected upper- and lower-body joint displacements and angles relative to the user's Step 2 calibration profile.

- **Confidence-Aware Scoring:** Landmark visibility and presence scores are evaluated on every frame. Low landmark confidence is classified strictly as `"tracking uncertain"` and is never treated as fatigue or a missed movement.
- **Consent-Driven Step-Downs:** If the camera detects sustained missed movements, Pulse prompts the user during the block check-in rather than silently downgrading their workout without consent.
- **Strict Boundary Enforcement:** Selecting *Harder* increases movement complexity or cadence strictly within the user's chosen movement exclusions (e.g., never introducing overhead reaches or lower-body jumps when excluded).
- **No Biometric Overclaiming:** Webcam motion is never presented as a heart-rate reading, medical diagnostic, or clinical fatigue measurement.

### 3.2 Finite-State Session Controller & Web Audio Engine
A deterministic finite-state machine governs transitions across onboarding, calibration, active 20–30 second blocks, effort check-ins, player turn-taking, Shared Chorus activation, and session recap.

Audio playback relies on the **Web Audio API** using original or rights-cleared loop stems synchronized to authored move metadata—requiring no external streaming accounts.

To keep two friends synchronized in the same musical groove, Pulse maintains a **common beat** across difficulty adjustments, modifying step frequency, physical impact, and movement complexity before altering tempo. Track changes and Shared Chorus harmonic layers trigger exclusively on **musical measure boundaries** so transitions sound seamless.

### 3.3 Core Data Contract
| Contract Entity | Fields & Responsibilities |
|---|---|
| `PlayerProfile` | Stores player name, posture mode (standing/seated), goal, experience tier, movement exclusions, calibrated range bounds, and optional height/weight. |
| `PoseSample` | Captures frame timestamp, normalized joint displacement/angle metrics, beat timing alignment, and landmark tracking confidence status. |
| `BlockPlan` | Defines the active move family, variant tier, 20–30s duration, excluded cues, and human-readable adaptation reason string. |
| `EffortCheck` | Records end-of-block self-reported effort (*easier* / *comfortable* / *harder*) alongside observed block participation consistency. |
| `ContributionEvent` | Logs non-identifying active time and completed block credit added to the persistent two-player Shared Chorus meter. |

### 3.4 Multi-User Turn-Taking & Wearable Integration Policy
**In-Room Turn-Taking Model:** For the hackathon build, Pulse runs on one laptop tracking one dancer at a time across two local player profiles feeding a single shared meter. Friends alternate short 20–30 second blocks, guided by large visual move previews and clear audio cues that minimize screen interaction during play. Simultaneous multi-person tracking and cross-device remote sessions are intentionally deferred until single-camera reliability is proven.

| Wearable Platform | Technical Constraint | Pulse Integration Rule |
|---|---|---|
| **Apple Watch** | Native HealthKit/watchOS APIs supply live workout heart rate, which a browser-only prototype cannot access directly. | Do not block the core demo on native watchOS development. |
| **Garmin** | Synced activity and health telemetry require formal developer program approval. | Do not rely on live cloud heart-rate streams during the hackathon weekend. |
| **WHOOP** | OAuth APIs expose recovery, sleep, and workout summaries rather than real-time heart-rate streams. | Use only to contextualize pre-session suggestions; never present summary metrics as live telemetry. |

> **Telemetry Transparency Rule:** Self-reported effort ships first as the primary adaptation signal. Any wearable data displayed must show its source and freshness, allow user override, and be explicitly labeled **"simulated"** if mocked without live OAuth authorization.

---

## 4. Minimum Impressive Product (MIP) Scope & Build Plan

| Scope Category | Features & Components |
|---|---|
| **Ship (Core MIP)** | Profile onboarding, local MediaPipe pose overlay, 3 authored move families (lateral step/tap, alternating reach, rhythmic arm press), standing & seated variants, 2 difficulty levels, 20–30s block adaptation with visible explanations, 2-player turn-taking, shared collective meter, layered musical Shared Chorus, and session recap. |
| **Defer (Post-MVP)** | Arbitrary AI-generated choreography, commercial music streaming catalogs, native watch apps, simultaneous multi-person camera tracking, global leaderboards, and exact calorie burn estimates. |

### 4.1 Architecture & Workstream Ownership
| Workstream | Primary Implementation & Responsibilities |
|---|---|
| **Camera & Movement** *(Codex Workstream)* | React/TypeScript MediaPipe Pose Landmarker integration, canvas skeleton overlay, Step 2 range calibration, confidence gating, rule-based block adaptation engine, and automated rule verification. |
| **Session & Sound** *(Claude Workstream)* | Finite-state session controller, Web Audio beat clock, authored move metadata, layered music loops, onboarding flow, animated visual coach guide, Shared Chorus celebration, and recap screen. |
| **Human Team Governance** | Curate movement variants and rights-cleared audio loops, own the main Git branch and integration merges, test real bodies under venue lighting, verify adaptation behavior, and rehearse the live pitch. |

### 4.2 Execution Schedule & Acceptance Gates
| Build Allocation | Milestones & Deliverables |
|---|---|
| **First 20%** | Detect one authored move reliably on the demo laptop; synchronize one Web Audio loop with its visual move guide; confirm CodeJam 16 AI-usage and submission guidelines. |
| **Next 40%** | Complete one full end-to-end vertical slice (`setup` $\rightarrow$ `movement` $\rightarrow$ `effort check` $\rightarrow$ `easier next block` $\rightarrow$ `recap`), then layer in standing/seated variants and movement exclusions. |
| **Next 25%** | Integrate the second local profile, persistent shared contribution meter, and layered Shared Chorus unlock; verify seated mode framing and audio transition timing. |
| **Final 15%** | Hard feature freeze; fix edge-case bugs; finalize GitHub README and submission before **Sunday 12:00 PM**; record a clearly labeled fallback demo video and rehearse the pitch. |

#### Mandatory Acceptance Gates Before Adding Polish:
1. A new tester starts a session in under 60 seconds.
2. Requesting easier or harder movement visibly modifies the next block with an explanation.
3. Seated and standing profiles both add equal contribution to the shared meter.
4. Camera tracking loss never registers as a negative score.
5. Two alternating players unlock the Shared Chorus and trigger the musical shift.
6. A complete end-to-end demo runs twice consecutively without crashing.

---

## 5. CodeJam 16 Judging Strategy, Demo Script & Validation

### 5.1 Track Selection & Eligibility
* **People First ($200) — Primary Track:** Directly fulfills the prompt for an in-person social application friends would choose to use together on a Friday night.
* **Health ($200) — Conditional Fit:** Because the Health track specifically targets improving quality of life for people with disabilities or illnesses, seated mode alone does not substantiate clinical benefit without user validation. Avoid making medical or rehabilitation claims; confirm multi-track submission rules with organizers.
* **Touch Grass ($200) — Secondary Fit:** Audio cues and a set-down laptop encourage active physical movement away from handheld phones, though screen-guided choreography makes it secondary to People First.
* **Beginner ($200) — Automatic Consideration:** Automatically awarded if 100% of team members are first-time hackers and the team wins any category.

### 5.2 Four-Minute Live Presentation Script
CodeJam 16 presentations must run between **3 and 5 minutes**, with shorter pitches encouraged to maximize judge Q&A time:

| Timestamp | Stage Action & Narrative Focus |
|---|---|
| **0:00 – 0:35** | **Hook & Setup:** Ask, *“Why must exercising together mean keeping up with the same routine?”* Introduce two teammates—one standing, one seated—sharing one session. |
| **0:35 – 1:30** | **Live Tracking & Contribution:** Start the music loop; demonstrate real-time local pose tracking, move recognition, and Player 1 earning progress on the shared meter. |
| **1:30 – 2:30** | **Adaptation & Player Switch:** Request easier movement, highlight the visible adaptation explanation and simplified next block, then switch to Player 2 demonstrating the seated variant filling the same collective meter. |
| **2:30 – 3:20** | **Shared Chorus & Recap:** Unlock the Shared Chorus so judges hear the musical layer change, review the session recap, and briefly invite a judge to test a move if time permits. |
| **3:20 – 4:00** | **Architecture & Close:** Summarize local browser processing, realistic hackathon build scope, and post-weekend validation steps. Close with: *“One beat. Your workout. Our progress.”* |

### 5.3 Judge Q&A Defense & Post-Hackathon Roadmap
* **“Why not just play Just Dance?”**  
  *Just Dance scores players against static choreography. Pulse dynamically adapts block-by-block difficulty and range of motion while preserving a cooperative shared goal across different mobility levels.*
* **“How do you know the workout is safe?”**  
  *Pulse makes zero medical suitability inferences. Users self-select movement exclusions, control intensity every 20–30 seconds, and can pause anytime without penalty.*
* **“What user data do you store?”**  
  *Zero video is ever uploaded—all frames are processed locally in the browser. Only non-identifying session contributions are shared, never body measurements or wearable recovery scores.*
* **Post-Weekend Validation Plan:**  
  Test with five student pairs to measure comfort, perceived fairness of adaptation, and 7-day repeat usage; conduct dedicated interviews with seated-mode users before making formal accessibility claims; pilot with campus recreation groups prior to commercial group tiers.
* **CodeJam 16 Compliance Checklist:**  
  - All project code written after Friday 7:00 PM.
  - No reuse of prior codebases.
  - Final commit pushed to GitHub before the hard **Sunday 12:00 PM** edit deadline.
  - Accurate disclosure of AI development tools.
