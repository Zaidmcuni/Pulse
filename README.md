# PULSE

PULSE is a social dance-fitness project for McGill's CodeJam 16. Pick a dance from the catalogue, follow a dance coach, and earn points from pose accuracy. A supported heart-rate monitor can also measure workout effort. Seated mode scores upper-body movement. After a dance, you can post your results to a local demo feed and groups.

Judges: follow the quickstart below. For timed scripts and the operator checklist, see the [demo runbook](docs/demo.md). The [product specification](Details/Description.md) and [AI assistance](#ai-assistance) disclosure are linked under [Project documents](#project-documents).

## Judge quickstart

### Prerequisites

- Git
- Node.js 22 or 24 with npm
- Desktop Google Chrome
- A webcam and working speakers or headphones
- Internet access for the clone and `npm ci`. After the build, the app runs offline: the pose model, WASM runtime, music and demo data are bundled.

### Install and run

```bash
git clone https://github.com/Zaidmcuni/Pulse.git
cd Pulse
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open **http://localhost:4173** in Chrome. When Chrome asks to use your camera, choose **Allow**. If you blocked it, click the camera or lock icon in the address bar, set **Camera** to **Allow**, then choose **Retry Camera**. Video stays in the browser. PULSE saves sign-ins, results and posts per address, so keep using `http://localhost:4173`.

### Demo walkthrough (no watch)

1. **Pick a dancer.** On **Who’s dancing?**, choose a demo dancer and enter the demo password `dance123`:
   - **Théo Nguyen** (`theo-on-beat@pulse.demo`): standing, already in **Montreal Dancers**.
   - **Jules Roy** (`jules-grooves@pulse.demo`): seated, already in **Montreal Dancers**.

   You can also choose **Guest** (no account) or **New dancer** (enter a name and handle).
2. **Join the group** (only for Guest or a new dancer). Open **Feed → Groups**, find **Montreal Dancers** under **Discover groups**, and choose **Join**. Join before you dance, so the group appears when you share your result.
3. **Pick a mode and Tip Toe.** Open **Dance**. At the top of **Pick a song**, select **Standing** or **Seated**. Seated uses the same song and coach and scores upper-body moves. Choose **Play** on **Tip Toe**, then **Start dance** on its song page.
4. **Get Ready.** Allow the camera and step back until the framing guide shows you. Standing needs your full body in view. Seated needs your torso and both arms. Click **I’m ready** and stay in frame for about a second, or raise both hands above your head and hold them there for about a second and a half. If Chrome blocks the sound, click **Tap to start the music**.
5. **Dance.** Follow the coach. Points grow as you match the moves, and the heart shows **No watch**. Tip Toe lasts just over three minutes. To finish early, use **Skip (demo only)**, which becomes available after 15 seconds and still counts as a completed run.
6. **Results.** **Dance complete** shows **Total points** and your accuracy in **Moves**. Without a watch, **Calories** shows **-- · No watch**. Dismiss any badge dialog.
7. **Share.** Choose **Share to Crew**. Under **Also share with groups**, tick **Montreal Dancers**, then choose **Share**. Calories, average heart rate and the highlight clip stay off unless you tick them.
8. **Leaderboard.** Open **Feed → Groups → Montreal Dancers**. Its **Weekly leaderboard** lists each member's best completed Tip Toe score for the current Monday–Sunday week.

The bundled scores are dated November 16–22, 2026. In any other week, the leaderboard shows only runs completed that week. Théo's seeded best (1,863 points) is higher than a perfect no-watch Tip Toe run (1,488), so if you want a new run to stand out, dance as a Guest or new dancer.

### Demo prep and recovery

- **Camera:** Use front lighting and a plain background, and keep your shoulders, elbows and wrists in view. If tracking stops, fix the framing or choose **Retry Camera**. If the camera is blocked, check Chrome's site permissions for `localhost:4173`.
- **Audio:** Before you start, check the output device and Chrome's volume. If the music doesn't start, click **Tap to start the music**.
- **Offline check:** After `npm run build`, leave the preview server running, turn Wi-Fi off, and reload `http://localhost:4173`. Check that the catalogue, camera and music still work.
- **If live play is blocked:** Use the prepared result and the recorded fallback described in the [runbook's recovery table](docs/demo.md#recover-under-the-timer).
- **Reset demo data** (on **Me**, just above **Settings**): Use it before you rehearse, or to stage a result or group join again, and wait for **Demo data restored.** It restores the seeded dancers, groups, posts and scores, and clears new results, posts, highlight clips and group joins. Accounts and dancers you created stay, but they leave their groups. If saved data still won't load, clear Chrome's site data for `localhost:4173`. Doing that also deletes accounts and dancers created in the browser.

### Optional: heart-rate monitor

You need Bluetooth on the laptop and a heart-rate monitor that broadcasts the standard Bluetooth heart-rate service, such as a WHOOP or Garmin in broadcast mode. Open **Me → Settings → Add your watch**, choose **Connect watch**, and wait for a live BPM before you dance. Points then combine heart-rate effort with accuracy, and **Calories** shows an estimate. To dance without a watch, choose **Continue** while it shows **Not connected**.

## Developer setup

```bash
npm ci
npm run dev        # Vite dev server; open the localhost URL it prints
npm run typecheck
npm test
npm run build
```

## Architecture

- **App:** React and TypeScript, built with Vite, with React Router for navigation.
- **Dance session:** MediaPipe tracks pose on the device. The Web Audio clock drives choreography timing. Without a watch, points come from pose accuracy. If a watch is connected when the dance starts, points combine heart-rate effort with pose accuracy.
- **Data and privacy:** The browser store loads bundled seeds and saves user activity in local storage. Dance templates stay in memory, and camera frames never leave the device. Social posts include calories only when the dancer opts in, and never include heart rate or body stats.

## Project documents

- [Demo runbook](docs/demo.md): presentation scripts, the laptop checklist and recovery cues.
- [Product specification](Details/Description.md): the catalogue-based flow, scoring, data model and demo acceptance gates.
- [Requirements](Details/requirements.md): feature IDs and verification criteria.
- [Detailed tasks](Details/Detailed-Tasks.md): workstream ownership, Step 0 and integration checkpoints.
- [Dance source videos](dance-sources/README.md): the selected clips, verification so far and open integration work.
- [Team rules](RULES.md), [agent instructions](AGENTS.md) and the [task template](TASK.md): how the team works in parallel.
- [Brainstorming archive](Details/BrainStorming.zip): research and plans for the earlier adaptive-dance concept.

## Contributors

- [Zaid](https://github.com/Zaidmcuni)

## AI assistance

AI assistants helped with research, documentation, implementation, tests, and code review.
