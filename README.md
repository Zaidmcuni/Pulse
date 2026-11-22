# PULSE

PULSE is a social dance-fitness project for McGill's CodeJam 16. Pick a dance from the catalogue, follow a silhouette coach, and earn points from pose accuracy and heart-rate effort. Seated mode scores upper-body movement. After a dance, you can post your results to a local demo feed and groups.

## Start here

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

1. Open **Profile Setup** and choose a dancer.
2. Open **Watch** and connect a supported Bluetooth heart-rate monitor, or choose **Use simulated heart rate**.
3. Pick a dance from **Dances**, check camera framing on **Get Ready**, and start the session. After finishing, open the results and share a post if you want it to appear in **Feed**, **Profile**, or selected groups.
4. To repeat the social demo from a clean slate, choose **Reset demo data** on your profile. This restores the seed and replaces local changes.

The current [dance index](public/dances/index.json) is empty. The live dance demo needs a registered dance template and its audio in `public/dances/`. Feed, Profile, and Groups can be explored immediately with the seeded demo data.

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
