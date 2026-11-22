# PULSE — Product Spec

> Source of truth: the team's Claude doc. This file is an export (Nov 21, 2026). Supersedes `Project Pulse/BLUEPRINT.md`, which describes the original adaptive concept.

## Overview

PULSE is Strava for dance. You pick a dance from a catalogue, follow its choreography Just Dance-style in front of your laptop camera, and earn points for effort and accuracy. Effort comes from live heart rate on your watch; accuracy comes from local pose tracking. Then you post your results to your profile and groups.

**Tagline:** One beat. Your workout. Our progress.

| | |
| --- | --- |
| Event | CodeJam 16, ECSESS, McGill (Trottier Building), Nov 20–22, 2026 |
| Goal | Win a track and get noticed by IBM (judges are mostly IBM sales reps) |
| Primary track | To decide when preparing the pitch (People First or Health) |
| Secondary tracks | Health (conditional), Touch Grass, Beginner (automatic) |
| Stack | Vite, React, TypeScript, MediaPipe Pose Landmarker, Web Audio API, Web Bluetooth |
| Wearables | WHOOP or Garmin heart-rate broadcast, read live in Chrome |
| Submission | GitHub, before Sunday 12:00 PM; no code written before Friday 7:00 PM |
| Repo | [Zaidmcuni/CodeJam](https://github.com/Zaidmcuni/CodeJam) |

**Ideas we dropped:** a compute-efficient AI personal relationship and memory assistant, and a real-time two-way ASL translator.

## Problem and solution

**Problem.** Being healthy is trendy now: Strava, Garmin and WHOOP made tracking your workouts a social habit. But most workouts aren't fun. Dance games like Just Dance are fun, but they don't measure real effort and don't connect to your fitness or your friends.

**Solution.** PULSE turns dancing into a tracked, social workout:

1. **Pick a dance** from a catalogue (FYP ranked by popularity and what fits you; sort by difficulty).
2. **Dance it** Just Dance-style in front of the laptop camera, with your watch on.
3. **Get scored** on effort (live heart rate) and accuracy (pose tracking against the dance's template).
4. **See your results:** points, accuracy level, time, and calories (private unless you choose to post them).
5. **Post it** to your profile and groups (friends, cities, dance types), optionally with a 10–30 s silhouette highlight clip.

**Inclusive by design:** a seated mode scores upper-body movement only, so wheelchair users and people with limited mobility can dance and earn points fairly.

**Together:** groups share group dances. Every member does the same choreography on their own device, and their scores land on the group's leaderboard. Each group page leads with its weekly dance and a nudge to put the phone down and dance together in person.

## Audience, competitors and tracks

**Primary audience:** students and friend groups who want a fun workout, and health-conscious people who already track workouts with a Garmin or WHOOP.

**Accessibility audience:** wheelchair users and people with limited mobility, through seated mode. No clinical claims until tested with users.

Strava is the main comparison point.

| Reference | What we borrow | What PULSE adds |
| --- | --- | --- |
| Strava | Profiles, posts, kudos, groups, the social habit around workouts | Dance as the workout, done at home in front of a laptop |
| Just Dance | Dance catalogue, characters, choreography scoring | Points from real effort (heart rate), a social profile, seated mode |
| WHOOP / Garmin | Live heart rate and effort tracking | Turns the tracked workout into a game you want to repeat |
| TikTok dance trends | Short shareable dance clips | Silhouette-only clips: share your moves, never your face or room |

**Track fit**

- **People First:** group dances with friends, and groups around cities and dance types.
- **Health:** effort scoring from heart rate, and seated mode for wheelchair users and people with limited mobility.
- **Touch Grass (secondary):** you move away from your phone, though the laptop screen still guides you.
- **Beginner (automatic):** awarded if every teammate is a first-time hacker and we place in any track.
- **Organizer principles:** no LLM calls during workouts; pose estimation runs on the local CPU.

## Business model

PULSE is free. The pitch closes by mentioning possible paid features later, such as silhouette highlight clips.

## Features

One person per camera. Single-player dancing, scoring and heart rate come first; everything social runs on seeded demo data. Runs in Chrome on a laptop or an Android phone (iPhone browsers don't support Web Bluetooth).

### MVP

| # | Feature | What it does | Notes |
| --- | --- | --- | --- |
| 1 | Profile setup | Handle, age, sex, weight, height, resting heart rate (from the WHOOP or Garmin app; default 65), standing or seated mode, optional max heart rate override | Body stats are private; weight is used only for calories |
| 2 | Watch connection | Live heart rate from a WHOOP or Garmin in broadcast mode via Web Bluetooth (standard BLE heart-rate service) | No watch: clearly labeled simulated heart rate. Watch drops: banner, effort holds its last value for 10 s, then 0 |
| 3 | Dance catalogue and FYP | Each dance has a difficulty (easy/medium/hard), a length and a genre; sort by difficulty; Popular and For you tabs | Seeded catalogue; For you rule in Scoring |
| 4 | Dance templates | A dev tool page runs the same MediaPipe pipeline as live scoring on Just Dance videos (solo routines) and saves 9 body-segment directions per frame, plus the song audio | 2–3 dances for the demo |
| 5 | Silhouette coach | The coach is a silhouette drawn from the template, synced to the song | Our own look; no Just Dance video on screen |
| 6 | Live pose tracking and scoring | Local MediaPipe compares the user's segments to the template, on the beat | Low confidence shows "tracking uncertain" and costs no points for a short loss (up to 3 s); nobody in frame earns 0 (#85) |
| 7 | Seated mode | Scores the 5 upper-body segments only; one-arm option | For wheelchair users and people with limited mobility |
| 8 | Results screen | Points, accuracy level (Bronze to Superstar), time, calories | Calories are private; the user chooses whether to post them |
| 9 | Profile page and feed | Strava-style posts of results, kudos | Seeded teammate posts; live results post to the top |
| 10 | Groups | Friends, cities, dance types (Zumba, hip-hop, etc.); each group has a feed, group dances with a weekly leaderboard, and in-person meetups | Seeded |

### Secondary

| # | Feature | What it does | Notes |
| --- | --- | --- | --- |
| 11 | Badges | Achievements shown on the profile and on the results screen when earned (list below) | Replaces the old fitness goals |
| 12 | Highlight clip | 10–30 s side-by-side highlight (user video with optional landmarks + synced coach silhouette & audio), or silhouette-only fallback, from the top-scoring window (details below) | Video held only in transient browser RAM for the current session; never persisted or uploaded |

**Badges (starting set):**

- **First Steps:** finish your first dance
- **On Fire:** dance 3 days in a row
- **Superstar:** reach Superstar level on any dance
- **1K Club:** 1,000 total points
- **Crew Player:** finish a group dance
- **Podium:** top 3 on a group's weekly leaderboard

**Highlight clip, how it works:**

- During the dance, save the 12 scored landmarks as 2D points at 10–12 FPS (both torso-centered silhouette data and screen-space overlay coordinates), and optionally buffer video-only webcam footage strictly in transient browser RAM (capped to recent results, never persisted to `localStorage`, never automatically saved to disk, never transmitted over the network).
- On Results and in the session feed, preview side-by-side (user video on the left with an explicit opt-in `"Show body landmarks on my video"` toggle; sculpted coach silhouette on the right) synced to song audio; fall back cleanly to saved pose-data silhouettes when no in-memory video is present.
- Export locally with `canvas.captureStream()` + the song audio into `MediaRecorder` (WebM, or MP4 where supported) only when the user explicitly clicks download.
- **Note:** frame rate, smoothing and visuals are starting values; tune after testing on real recordings.

### Later (after the hackathon, or only if time allows)

Several people on one camera (MediaPipe numPoses 2+, assigned by left/right lane), Apple Watch (needs a native watchOS app), WHOOP and Garmin cloud APIs, creator-recorded routines to replace Just Dance templates, a real recommendation engine, paid features.

### Dropped with the pivot

In-dance adaptation (Easier/Harder check-ins): each dance has a fixed difficulty instead. Single-camera turn-taking and the Shared Chorus.

## Scoring

Points reflect physical effort, weighted by accuracy. Effort comes from heart rate relative to each person's own range, using Banister's TRIMP, the standard training-load formula behind ideas like Strava's Relative Effort.

### 1. Heart-rate reserve

```
HRmax  = 208 − 0.7 × age        (Tanaka formula; profile override)
HRrest = from the profile (WHOOP/Garmin app value; default 65)
x = (HR − HRrest) / (HRmax − HRrest), clamped to 0..1
```

Resting heart rate is not measured before the dance, so warming up doesn't distort it.

### 2. Effort per second (TRIMP weighting)

```
effort(t) = x × 0.64 × e^(1.92·x)    male
effort(t) = x × 0.86 × e^(1.67·x)    female
other / prefer not to say: average of the two coefficients
```

### 3. Accuracy (camera)

Uses 12 of MediaPipe's 33 landmarks and compares the direction of 9 body segments. Directions don't depend on body size or distance from the camera, so no normalization is needed.

| Segment | Landmarks (MediaPipe index) | Seated mode |
| --- | --- | --- |
| Left / right upper arm | shoulder 11/12 → elbow 13/14 | Scored |
| Left / right forearm | elbow 13/14 → wrist 15/16 | Scored |
| Torso | mid-hip (23+24) → mid-shoulder (11+12) | Scored |
| Left / right thigh | hip 23/24 → knee 25/26 | Ignored |
| Left / right shin | knee 25/26 → ankle 27/28 | Ignored |

```
smooth every landmark with a One Euro filter (mincutoff 1.0 Hz, beta 0.03)
ignore a frame if the body center jumps > 0.35 of screen width (someone walking behind)
for each segment: unit 2D vector (x, y); ignore z (too noisy on a webcam)
mirror the user: x → 1 − x and swap left/right, so they match the coach like a mirror
skip a segment if either landmark's visibility < 0.55
error = angle between user and template vectors = acos(dot product)
segment score = 1 up to 10°, then linear to 0 at 40° (#112; CONFIG.fullScoreDeg, toleranceDeg)
  seated: 1 up to 25°, 0 at 60° (CONFIG.seatedCurve), so a good seated dancer lands in the standing band
t = heard song time of the camera frame (see Timing and sync)
match against template frames from t − 240 ms to t + 120 ms; keep the best
  (window biased late: camera and detection always lag)
  require at least half of the mode's segments to be present in both poses
frame accuracy = best sum of segment scores divided by the largest shared segment count in the window
acc(t) = rolling 2 s average of scores since the last confirmed still second
```

**Move rating** (per beat, on the mean of the beat's best half of frame scores, #112): Perfect ≥ 0.85, Good ≥ 0.65, OK ≥ 0.4, otherwise Miss.

**Accuracy level** (whole dance, mean of the beat scores; still beats and beats untracked past the 3 s hold count 0, #112): Superstar ≥ 85%, Gold ≥ 70%, Silver ≥ 66%, otherwise Bronze.

The dance screen's **Recent accuracy** shows the rolling frame average. It drops to zero during confirmed stillness or when tracking has expired. Practice uses the same stillness rule for accuracy and beat ratings.

### 4. Points

```
points = 10 × Σ over each second [ effort(t) × (0.2 + 0.8 × ramp(acc(t))) ]
ramp(acc) = clamp((acc − 0.45) / (0.85 − 0.45), 0, 1)   (#112)
```

- Effort without accuracy is capped at 20%, so flailing off-choreography doesn't win. Standing still while the coach moves, or nobody tracked for 3 s, earns 0.
- Without a watch, each eligible second earns `8 × ramp(acc(t))` points.
- No difficulty multiplier: harder dances already raise heart rate.

### 5. Calories (private stat)

Keytel formula from heart rate, weight, age and sex. Not part of points.

```
male:   kcal/min = (−55.0969 + 0.6309·HR + 0.1988·weight + 0.2017·age) / 4.184
female: kcal/min = (−20.4022 + 0.4472·HR − 0.1263·weight + 0.074·age) / 4.184
other: average of the two
```

### 6. For you rule

Look at the user's average accuracy over their last 3 dances: ≥ 80% → recommend the next difficulty up; < 66% (Silver) → the next one down; otherwise the same. Within that difficulty, sort by popularity. The Popular tab sorts by popularity only.

### Caveats

- Heart rate lags effort by 10–30 s: fine for 2–4 minute dances.
- Spinal cord injuries and beta blockers lower max heart rate; the HRmax override handles both.
- #112 was calibrated offline using MediaPipe Heavy. The team reported improved live scoring after #147. The #148 follow-up was verified offline across all four dances in both modes. The results and the original live baseline are in [the scoring check](../dance-sources/scoring-check.md).

## User flows

### A. Solo dance

1. User opens PULSE in Chrome, logs into their profile, and connects their WHOOP or Garmin over Bluetooth.
2. They browse the For you or Popular tab, sort by difficulty, and pick a dance.
3. Get-ready screen: the camera starts and the skeleton appears so they can check framing.
4. The silhouette coach dances to the song; the user follows. Live feedback shows Perfect/Good/OK/Miss on each beat, plus points and heart rate.
5. Results: points, accuracy level, time, and calories (private).
6. They post to their profile and groups, choosing whether to include calories and a highlight clip.

### B. Seated user

1. The profile is set to seated mode (wheelchair or limited mobility).
2. Any dance in the catalogue works: only the 5 upper-body segments are scored.
3. Effort scoring works the same, since heart rate is relative to their own range (HRmax override available).

### C. Group dance

1. A group (friends, a city, a dance type) features a group dance.
2. Each member does it on their own device, one person per camera, like any solo dance.
3. Each result lands on the group's weekly leaderboard, ranked by points.
4. The group page leads with the weekly dance ("Friday Night Fun" on McGill Friday Night Crew) and a Start dance shortcut. Meetups and RSVP were cut from the UI after the 2026-11-22 team review; the seeded meetup data stays in the store.

### D. Edge cases

- **Occlusion or dim light:** landmark visibility under 0.55 skips that segment; if too few are visible, show "Tracking uncertain — keep moving" with no penalty.
- **Watch drops:** "Reconnect your watch" banner; effort holds its last value for 10 s, then 0.
- **Pause:** button or spacebar stops the dance; points so far are kept.
- **No watch:** heart rate is clearly labeled simulated.

### E. Social

Between dances, users browse their feed, give kudos, check group leaderboards, and join groups.

## Architecture and data

PULSE runs entirely in the browser for the weekend, with no backend: pose tracking, scoring and heart rate all happen on the laptop. That keeps video private and avoids failures from venue Wi-Fi.

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Vite + React + TypeScript | Strict types for the shared contract across branches |
| Computer vision | @mediapipe/tasks-vision PoseLandmarker | Lite model and WASM bundled in public/ for offline use; numPoses 1 |
| Template extraction | Dev tool page (/dev/extract) reusing the live pose engine and segment code | Saves 9 segment directions per frame plus beat timings as JSON; run once per dance |
| Coach | Canvas silhouette drawn from the template | Synced to the song audio |
| Scoring | Pure TypeScript vector math + TRIMP effort | See Scoring |
| Heart rate | Web Bluetooth, heart_rate service (0x180D) | WHOOP or Garmin in broadcast mode; Chrome on laptop or Android |
| Audio | Web Audio API | The song's clock drives the coach and the template timing |
| Persistence | localStorage + seeded JSON; dances in memory | Profiles, posts, groups, leaderboards, meetups in localStorage; dance templates loaded from public/dances/ into memory |
| Later backend | Node + PostgreSQL | Real accounts, feeds and groups across users |

### Timing and sync

The audio clock is the single source of truth; camera frames are converted to the moment of the song the dancer actually heard.

- **Master clock:** the song starts at a known `AudioContext.currentTime`; coach, beats and template timing all derive from it. Never `setTimeout`/`setInterval`.
- **Real frames only:** run pose detection from `video.requestVideoFrameCallback`, once per new camera frame, using the frame's timestamp.
- **Heard song time:** `audioCtx.getOutputTimestamp()` pairs audio time with `performance.now()`. For a frame at `tFrame` (ms): `tSong = contextTime + (tFrame − performanceTime) / 1000 − camDelay − songStart`, with `camDelay` ≈ 0.045 s to start (tune). If `contextTime` is still 0, fall back to `currentTime − baseLatency − outputLatency`.
- **Late-biased window:** compare to template frames from −240 ms to +120 ms around `tSong` (see Scoring).
- **Scoring cutoffs:** finalize beats and points on the heard-song timeline, allowing one additional configured camera-delay interval for in-flight pose frames. The score clock advances through camera gaps. Process each second and beat cutoff in order after a stalled update.

### MediaPipe setup

- Pin `@mediapipe/tasks-vision` ≥ 0.10.11: older versions don't return `visibility`, which the confidence check needs. Assert it's a number at startup.
- Bundle `pose_landmarker_lite.task` and the WASM files in `public/`; `runningMode: "VIDEO"`, `numPoses: 1`; call `detectForVideo` only on new frames.
- One Euro filter per landmark coordinate (`mincutoff` 1.0 Hz, `beta` 0.03). Tune: raise `mincutoff` until a still dancer stops jittering, then raise `beta` until fast arm moves track without lag.
- Background lock: remember the dancer's body center; ignore frames where it jumps more than 0.35 of screen width until the dancer is back.

### Privacy

- Live pose webcam frames become pose numbers locally and are immediately discarded; no frame leaves the browser.
- Raw webcam video for the side-by-side highlight preview/export is retained **only in transient in-memory browser RAM** during the current tab session (capped to recent results; never persisted to `localStorage`, never automatically saved to disk, never transmitted over the network).
- Users explicitly choose whether to include body landmarks on their video (`"Show body landmarks on my video"`) and whether to share or download a highlight clip; persisted or reloaded highlights fall back to saved pose-data silhouettes.
- Body stats and calories stay private unless the user chooses to post calories.

### Runtime data flow

1. **Setup:** profile loaded (including resting heart rate); watch connected.
2. **Each frame (30–60 FPS):** new camera frame → PoseLandmarker → One Euro smoothing → 9 segment vectors (mirrored; 5 in seated mode) → frame time converted to heard song time → compared to template frames from −240 ms to +120 ms → frame accuracy.
3. **Each scoring second:** apply the tracking and motion rules, then award points using the accuracy ramp. A watch session weights the points by effort. A no-watch session scores moves only. Record pose data for the highlight clip during play.
4. **End:** results (points, accuracy level, time, calories) → optional post, optional clip from the top-scoring window → group leaderboard updated if it's a group dance.

### Data contract (draft, src/types/pulse.ts)

Lock it on main before splitting work.

```typescript
export type PosturalMode = "standing" | "seated";
export type Sex = "male" | "female" | "other";
export type Difficulty = "easy" | "medium" | "hard";
export type MoveRating = "perfect" | "good" | "ok" | "miss";
export type AccuracyLevel = "bronze" | "silver" | "gold" | "superstar";
export type HeartRateSource = "ble" | "simulated";
export type GroupKind = "friends" | "city" | "dance_type";

export type SegmentId =
  | "l_upper_arm" | "r_upper_arm" | "l_forearm" | "r_forearm" | "torso"
  | "l_thigh" | "r_thigh" | "l_shin" | "r_shin";

export type Vec2 = [number, number]; // unit vector in image coordinates

export interface PlayerProfile {
  id: string;
  handle: string;
  displayName: string;
  age: number;
  sex: Sex;
  weightKg: number;            // private; calories only
  heightCm: number;            // private
  restingHr: number;           // from WHOOP/Garmin app; default 65
  hrMaxOverride?: number;      // spinal cord injury, beta blockers, etc.
  mode: PosturalMode;
  groupIds: string[];
}

export interface TemplateFrame {
  tMs: number;                 // song time
  segments: Partial<Record<SegmentId, Vec2>>; // missing = low visibility
}

export interface Dance {
  id: string;
  title: string;
  genre: string;               // e.g. "hip-hop", "zumba"
  difficulty: Difficulty;
  lengthSec: number;
  bpm: number;
  beatsMs: number[];           // beat times for move ratings
  popularity: number;
  audioUrl: string;
  frames: TemplateFrame[];
}

export interface ScoreSample {
  t: number;                   // seconds since start
  heartRate: number;
  hrSource: HeartRateSource;
  effort: number;
  accuracy: number;            // 0..1, rolling 2 s
  points: number;              // earned this second
}

export interface SessionResult {
  id: string;
  playerId: string;
  danceId: string;
  totalPoints: number;
  accuracyPct: number;
  level: AccuracyLevel;
  durationSec: number;
  caloriesKcal: number;        // private unless posted
  bestWindowStartSec: number;  // highlight clip start
  createdAtIso: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  resultId: string;
  showCalories: boolean;
  hasClip: boolean;
  groupIds: string[];
  kudosCount: number;
  createdAtIso: string;
}

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  memberIds: string[];
  groupDanceIds: string[];     // featured dances for the weekly leaderboard
}

export type BadgeId = "first_steps" | "on_fire" | "superstar" | "1k_club" | "crew_player" | "podium";

export interface EarnedBadge {
  badgeId: BadgeId;
  playerId: string;
  earnedAtIso: string;
}

export interface Meetup {
  id: string;
  groupId: string;
  title: string;
  place: string;
  startsAtIso: string;
  rsvpIds: string[];
}
```

## UI and UX

The dance screen is big and readable from 2–3 m away; everything else looks like a clean Strava-style app.

| # | Screen | Key elements |
| --- | --- | --- |
| 1 | Profile setup | Handle, age, sex, weight, height, resting heart rate, standing/seated, optional HRmax; "private" labels on body stats |
| 2 | Watch connect | Connect WHOOP/Garmin button, live heart rate readout, "Simulated" badge if no watch |
| 3 | Catalogue | Dance cards (title, genre, difficulty, length, cardio intensity), Popular order, difficulty filter, Standing/Seated toggle. Play opens the song page `/dances/:id`: cover and details, Start, an estimated calorie range and the song's leaderboard |
| 4 | Get ready | Camera preview with skeleton to check framing, Start button |
| 5 | Dance | Silhouette coach (main), Perfect/Good/OK/Miss pop-ups, live points, heart rate, small webcam skeleton, Pause |
| 6 | Results | Points, accuracy level badge, time, calories (private) under "Workout summary", Moves and Effort cards, heart-rate chart by effort zone (accuracy over the song without a watch), Share to Crew with a live post preview and calories, average heart rate and clip toggles (all off by default) |
| 7 | Profile and feed | Strava-style result cards, kudos |
| 8 | Groups | Group list; each group has its weekly dance with a Start shortcut, a weekly leaderboard and a feed |

### UX rules

- **Encouraging feedback only:** no shaming; "Tracking uncertain" instead of penalties when the camera loses you.
- **Desk-laptop framing:** seated mode and upper-body moves must look clean from a laptop on a normal table.
- **Honest data:** simulated heart rate is always labeled "Simulated"; calories are labeled "estimated."

## Build plan

Team of 4; task split to be decided once the specs are final. Feature freeze is Sunday 9:30 AM; push to GitHub well before 12:00 PM.

### Phases

1. **Friday night — foundations:** repo, types, MediaPipe offline, template extraction working on one dance.
2. **Saturday morning — watches and scoring:** WHOOP and Garmin heart rate in Chrome as soon as they arrive; segment comparison and points working on one dance.
3. **Saturday afternoon — single-player loop:** catalogue → get ready → dance with silhouette coach → results; seated mode; 2–3 dances; tune tolerance on real people.
4. **Saturday evening — social:** profile, feed, groups with leaderboards and meetups (seeded), posting results; highlight clip if on track.
5. **Sunday morning — freeze and rehearse:** fallback video, rehearsal. Several people on one camera only if everything else is solid.

### Acceptance gates

- [ ] A new user goes from catalogue to dancing in under 60 s
- [ ] Live heart rate from the WHOOP or Garmin shows in the app
- [ ] Doing the dance well clearly scores more than doing it badly
- [ ] Seated mode scores upper-body movement fairly
- [ ] Losing tracking briefly shows "tracking uncertain" and costs no points; an empty frame earns 0 (#85)
- [ ] Results post to the feed and appear on the group leaderboard
- [ ] The full demo runs twice in a row without crashing

### Risks

| Risk | What goes wrong | Mitigation |
| --- | --- | --- |
| Watch pairing | WHOOP or Garmin won't broadcast to Chrome | Test Saturday morning on a bare Web Bluetooth page; labeled simulated fallback |
| Bluetooth on stage | Watch won't connect during judging | Pair before judging; simulated fallback one click away |
| Template quality | Camera angles or outfits in the video confuse MediaPipe | Pick clean, front-facing solo routines; test extraction first |
| Mirroring bug | Left/right mismatch makes good dancing score badly | Test with one deliberate arm raise before tuning anything else |
| Heart rate lag | Effort barely moves in a 2.5-minute pitch | Warm up the dancer before judging |
| Trottier Wi-Fi | Model or WASM fails to load | Everything bundled locally; fully offline |
| Tight framing | Full body doesn't fit at a desk | Upper-body-heavy dances; seated mode |
| Scope | Too many screens for the time | Social screens on seeded data; core loop first |

## Pitch and demo

Judging presentations run 2 to 4 minutes, with shorter encouraged; the rest is judge Q&A (official CodeJam rules). Team format: a 30-second video, a 90-second live presentation, then about 2 minutes of Q&A. The old script was built on adaptation and the Shared Chorus, so it needs rewriting for the catalogue model.

### Rules checklist

- All code written after Friday 7:00 PM; no reused projects.
- Final push to GitHub before Sunday 12:00 PM; no edits after noon.
- Judging location is listed on [codejam.mcgilleus.ca](https://codejam.mcgilleus.ca).
- Popular Vote: the committee picks 5 projects per category that haven't won a prize; 2-minute max demo; $300 / $200 / $100.
- Disclose AI-assisted work in the README; confirm multi-track eligibility with organizers in Room 1060 (ECSESS/CSUS Lounge).
- At least one teammate with valid ID attends closing to collect prize money.

### Judging script

To be rewritten (target about 2:30).

### Popular Vote script

To be rewritten (2:00 max).

### Q&A prep (draft)

| Judge question | Answer |
| --- | --- |
| Why not just play Just Dance? | Just Dance scores how well you copy moves. PULSE scores real effort from your heart rate, builds a Strava-style profile and community around it, and works seated |
| Are the Just Dance routines licensed? | They're placeholders for the demo. The real product uses routines recorded by creators |
| How are points calculated? | Heart rate relative to your own range (TRIMP, a standard sports-science formula) weighted by how accurately you follow the choreography |
| Is it fair across ages and bodies? | Effort is relative to each person's own heart-rate range, so a 50-year-old and a 20-year-old earn equally for equal effort; weight doesn't affect points |
| What data or video do you store? | No video leaves the laptop or is persisted to disk/`localStorage`. Optional side-by-side highlight video is kept only in transient browser RAM during the current tab session (and cleared on reset), while saved clips fall back to pose-data silhouettes. Body stats and calories stay private |
| What about Apple Watch? | Apple Watch needs a native app, so it's next. WHOOP and Garmin already work over standard Bluetooth |
| How do you make money? | Free to grow, then freemium like Strava |

### After the hackathon

1. **Student playtests:** measure fun, perceived fairness of points, and 7-day return rate.
2. **Accessibility interviews:** with wheelchair users and people with limited mobility before making any accessibility or health claims.
3. **Campus club pilot:** e.g. McGill Athletics or dance clubs, to validate repeat group use before paid features.

## Open questions and decisions

### Resolved

- **Pitch length:** official 2–4 minutes. Team format: 30 s video, 90 s live, about 2 min Q&A.
- **Team docs in `docs/`:** written for the old adaptive concept; this spec wins on every conflict (turn-taking, Shared Chorus, rep-based scoring, heart rate out of scoring, no calories, goals, exclusions, camera-free mode, leaderboard metric).
- **Core model:** dance catalogue → dance Just Dance-style → results → post, Strava-style. Strava is the main comparison.
- **No in-dance adaptation:** each dance has a fixed difficulty; sort the catalogue by difficulty.
- **Badges** replace the old fitness goals.
- **Dance attributes:** difficulty, length, genre.
- **Dance templates:** Just Dance solo routines for the demo; creator-recorded routines later.
- **Coach:** our own silhouette drawn from the template, synced to the song.
- **Body tracking:** 12 MediaPipe landmarks, 9 segment directions (5 in seated mode), One Euro smoothing, background lock, MediaPipe ≥ 0.10.11.
- **Timing:** audio clock as master, pose on real camera frames, frame time converted to heard song time, late-biased matching window.
- **Wearables:** live heart rate from a WHOOP and a Garmin (arriving Saturday) over Web Bluetooth; Apple Watch later; labeled simulated fallback.
- **Resting heart rate:** from the profile (watch app value; default 65), not measured before the dance.
- **Points:** effort (TRIMP from heart rate) weighted by accuracy; formula in Scoring.
- **Calories:** private stat, optional to post; not part of points.
- **Seated mode:** in the MVP, for wheelchair users and people with limited mobility.
- **One person per camera:** group dances are the same choreography done by each member on their own device, ranked on a group leaderboard. Several people on one camera only if time allows.
- **Groups:** feeds, a weekly group dance and weekly leaderboards.
- **For you rule:** based on accuracy over the last 3 dances; details in Scoring.
- **Highlight clip:** pose-data replay at 10–12 FPS; parameters to tune after testing.
- **Business model:** free; the pitch closes with possible paid features later (e.g. silhouette clips).
- **Shared Chorus:** dropped.

### Open (not blocking the specs)

- [ ] Test the WHOOP and Garmin on Saturday (Garmin must broadcast heart rate over Bluetooth, not only ANT+); revisit watch details after
- [ ] Primary track: decide when preparing the pitch
- [ ] Task split for the 4 teammates
- [ ] Pick the 2–3 Just Dance solo videos (clean, front-facing coach)
- [ ] Write the pitch (team format above)
- [ ] Confirm with organizers (Room 1060) that we can submit to more than one track
- [ ] Update the repo README to point to Description.md and mark the docs/ files as background research
