# PULSE

PULSE is a social dance-fitness project for McGill's CodeJam 16. Pick a dance from the catalogue, follow a dance coach, and earn points from pose accuracy. A supported heart-rate monitor can also measure workout effort. Seated mode scores upper-body movement. After a dance, you can post your results to a local demo feed and groups.

## Start here

- [Demo runbook](docs/demo.md) contains both presentation scripts and the laptop checklist.
- [Product specification](Details/Description.md) covers the catalogue-based flow, scoring, data model, and demo acceptance gates.
- [Requirements](Details/requirements.md) lists feature IDs and verification criteria.
- [Detailed tasks](Details/Detailed-Tasks.md) outlines workstream ownership, Step 0, and integration checkpoints.
- [Dance source videos](dance-sources/README.md) records the selected clips, verification so far, and the open integration work.
- [Team rules](RULES.md), [agent instructions](AGENTS.md), and the [task template](TASK.md) cover how to work in parallel.
- [Brainstorming archive](Details/BrainStorming.zip) contains research and plans for the earlier adaptive-dance concept.

## Run locally

Use Node.js 22 or 24 with npm. Open the app in desktop Chrome and grant camera access when prompted. Use the localhost URL printed by Vite for camera and Bluetooth access.

```bash
git clone https://github.com/Zaidmcuni/Pulse.git
cd Pulse
npm ci
npm run dev
```

1. On **Who’s dancing?**, choose **Guest** to start right away, or choose **Create an account with email** and save your dancer profile.
2. Under **Crew → Groups → Discover groups**, join **Montreal Dancers** before dancing so your score appears on its weekly leaderboard.
3. Open **Me → Add your watch**, confirm **Not connected**, and choose **Continue** to dance without a watch. To use a supported Bluetooth heart-rate monitor, choose **Connect watch** and wait for a live BPM reading before continuing.
4. Pick **Tip Toe** from **Dance**. On **Get Ready**, check camera framing, click **I’m ready**, and stay in frame until the countdown starts. Finish the session to see your points and accuracy. Without a watch, **Calories** shows **-- · No watch**. Choose **Share to Crew** to post to the feed and optionally share with your group. The group leaderboard shows your best completed score for the week.
5. To replay the demo, choose **Reset demo data** under **Me**. This restores the current seed and clears local activity, including group joins. Registered accounts and profiles stay available.

The seeded Tip Toe scores are dated for the November 16–22, 2026 demo week. Weekly leaderboards use the current local Monday–Sunday week and include completed sessions without a watch.

## Architecture

- **App** — React and TypeScript, with Vite for development and builds and React Router for navigation.
- **Dance session** — MediaPipe tracks pose on the device. The Web Audio clock drives choreography timing. Points come from pose accuracy without a watch and combine heart-rate effort with pose accuracy when a watch is connected at the start.
- **Data and privacy** — The browser store loads bundled seeds and preserves user activity in local storage. Dance templates stay in memory. Camera frames stay on the device. Social posts share calories only when the dancer opts in and omit heart rate and body stats.

## Verify changes

```bash
npm run typecheck
npm test
npm run build
```

## Contributors

- [Zaid](https://github.com/Zaidmcuni)

## AI assistance

AI assistants helped with research, documentation, implementation, tests, and code review.
