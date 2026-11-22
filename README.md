# PULSE

PULSE is a social dance-fitness project for McGill's CodeJam 16. Pick a dance from the catalogue, follow a silhouette coach, and earn points from pose accuracy and heart-rate effort. Seated mode scores upper-body movement. After a dance, you can post your results to a local demo feed and groups.

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

1. Choose **Create an account** and save your dancer profile.
2. Under **Groups → Discover**, join **Montreal Dancers** before dancing so your score appears on its weekly leaderboard.
3. Open **Watch** and connect a supported Bluetooth heart-rate monitor, or choose **Use simulated heart rate**.
4. Pick **Tip Toe** from **Dances**, check camera framing on **Get Ready**, and finish the session. Open the group’s leaderboard to compare your score with the seeded dancers. From the result page, you can also share a post to the feed or the group.
5. To replay the demo, choose **Reset demo data** on your profile. This restores the current seed and clears local activity, including group joins. Registered accounts and profiles stay available.

The seeded Tip Toe scores are dated for the November 16–22, 2026 demo week. Weekly leaderboards use the current local week.

## Architecture

- **App** — React and TypeScript, with Vite for development and builds and React Router for navigation.
- **Dance session** — MediaPipe tracks pose on the device. The Web Audio clock drives choreography timing. Points combine pose accuracy with live or simulated heart-rate effort.
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
