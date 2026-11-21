# Secondary Feature Module: Neon "Pulse Ghost" Silhouette Replays & Duet Cards

**Priority Tier:** Secondary Enhancement *(Post-Vertical Slice — build strictly after core pose detection, block adaptation, two-player turn-taking, and the Shared Chorus pass all six MVP acceptance gates).*

---

## 1. Product Purpose & Strategic Value

The primary barrier keeping everyday users from sharing dance workouts on social platforms like Strava or TikTok is camera shyness—messy rooms, unflattering lighting, sweat, and self-consciousness on camera. **Pulse Ghost Replays** turn PULSE’s strict local-only privacy constraint (never uploading or storing raw webcam video) into its most shareable social feature.

Instead of recording video footage, PULSE transforms each user’s live skeletal movement into a stylized, glowing neon silhouette animation set against a beat-reactive background. When two friends complete a session using different movement modes—such as one standing and one seated—PULSE automatically composites both silhouettes side by side into a **Duet Ghost Card**, visually proving that two different bodies contributed equally to the same beat without ever exposing raw faces, rooms, or body measurements.

---

## 2. User Experience & Visual Design

* **Zero-Friction Capture:** Silhouette recording runs passively in the background during active 20–30 second movement blocks with no extra setup or recording prompts.
* **Interactive Club Feed Previews:** When a session finishes and publishes to the Strava-style Club Feed, the activity card displays a looping, animated Neon Ghost thumbnail alongside active minutes, completed blocks, the unlocked Shared Chorus badge, and the transparent adaptation note (e.g., *"Next block: smaller steps, no overhead reach"*).
* **Side-by-Side "Duet Ghosts":** Even though live camera tracking runs one player at a time via turn-taking (`numPoses: 1`), the recap canvas syncs Player 1’s recorded standing ghost on the left with Player 2’s recorded seated ghost on the right against the same Shared Chorus beat, creating a unified group celebration.
* **Visual Aesthetics:** Rendered in a vertical **9:16 TikTok/Story aspect ratio** on a deep dark-gradient canvas featuring glowing neon limb vectors, subtle motion-blur trails on wrists and hands, beat-synced pulse rings behind the torso, and a clean stats footer (Trend Loop title, rhythm consistency percentage, and club progress).
* **One-Tap Local Export:** Users can download a share-ready 9:16 replay clip locally for TikTok or Instagram Stories while keeping raw camera footage completely off the network.

---

## 3. Technical Architecture (Zero-Video, Ultra-Light)

Rather than enabling heavy pixel segmentation (`outputSegmentationMasks: false`), Pulse Ghosts piggyback directly on the **MediaPipe Pose Landmarker** coordinates already computed locally for move detection:

* **Landmark Capture & Subsampling:** During active blocks, sample only essential skeletal joints at **10–12 FPS** (every 85–100 ms): head anchor (`0`), upper body (`11–16`: shoulders, elbows, wrists), and lower body (`23–28`: hips, knees, ankles). Store only quantized 2D coordinates $(x, y)$ and per-joint visibility scores.
* **Seated-Mode Clean Rendering:** When a player is in seated mode, discard occluded lower-body indices (`23–28`) entirely so desk edges never cause twitching or hallucinated legs; render a clean stylized torso base and glowing upper-body arcs instead.
* **Spatial Normalization & 60 FPS Playback:** Before saving each keyframe, center coordinates around the torso midpoint and normalize scale by shoulder width so players standing at different camera distances align cleanly in Duet view. During playback on a 2D HTML5 `<canvas>`, linearly interpolate (`lerp`) between the 10 FPS keyframes inside `requestAnimationFrame` to deliver smooth 60 FPS neon motion.
* **Microscopic Storage Footprint:** A 20–30 second block of ~13 quantized 2D joints at 10 FPS requires roughly **10–25 KB of JSON**, allowing full multi-player ghost replays to live directly inside `localStorage` within each Club Feed `FeedPost` object with zero backend or cloud storage overhead.
* **In-Browser 9:16 Video Export (Stretch within Secondary):** To let users download an actual video clip without a server, capture the offscreen 9:16 replay canvas via `canvas.captureStream(30)`, merge the Web Audio loop output via `AudioContext.createMediaStreamDestination()`, and encode locally using the browser’s `MediaRecorder` API (`video/webm` or `video/mp4` where supported).

---

## 4. Edge Cases, Guardrails & Demo Impact

| Consideration | Design & Engineering Rule |
| :--- | :--- |
| **Privacy Guarantee** | Raw webcam frames are processed ephemerally in browser memory and immediately discarded—only anonymized joint vectors are ever serialized. |
| **Low-Confidence Joints** | If a limb briefly drops below the visibility threshold (`< 0.5`), fade that bone segment into a soft dotted glow rather than snapping erratically across the canvas—matching PULSE’s non-punitive `"tracking uncertain"` philosophy. |
| **Camera-Free Participation** | If a player opts into camera-free mode, render an audio-reactive neon equalizer ring as their Duet Ghost partner so they still appear visibly in the Shared Chorus celebration. |
| **Hackathon Scope Discipline** | Slot into the **Next 25% build window** (Saturday evening) strictly after core movement, effort adaptation, and Web Audio loops are stable. Pre-seed 2–3 Club Feed posts with recorded teammate Ghost JSONs before the Sunday 12:00 PM GitHub cutoff. |
| **CodeJam 16 Judging Payoff** | Strengthens **People First** ($200) by making social fitness sharing genuinely fun without embarrassment, maximizes visual stage impact for **Popular Vote** (2-minute demo), and provides a concrete, verifiable answer to *"What data do you store?"* during judge Q&A. |
