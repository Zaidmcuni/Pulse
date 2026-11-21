# PULSE

PULSE is a social dance-fitness project for McGill's CodeJam 16. Pick a dance from the catalogue, follow a silhouette coach, and earn points from pose accuracy and heart-rate effort. Seated mode scores upper-body movement. After a dance, you can post your results to a local demo feed and groups.

## Start here

- [Product specification](Details/Description.md) covers the catalogue-based flow, scoring, data model, and demo acceptance gates.
- [Requirements](Details/requirements.md) lists feature IDs and verification criteria.
- [Detailed tasks](Details/Detailed-Tasks.md) outlines workstream ownership, Step 0, and integration checkpoints.
- [Team rules](RULES.md), [agent instructions](AGENTS.md), and the [task template](TASK.md) cover how to work in parallel.
- [Brainstorming archive](Details/BrainStorming.zip) contains research and plans for the earlier adaptive-dance concept.

## Project setup

```bash
git clone https://github.com/Zaidmcuni/Pulse.git
cd Pulse
npm ci
npm run dev
```

The development server prints the local URL. Run `npm run typecheck`, `npm test`, and `npm run build` to verify changes. The Vite app includes the React and TypeScript scaffold, shared contracts, and mocks. Some feature modules are still being implemented. Camera processing stays in the browser, and the demo targets local assets and storage.

## Contributors

- [Zaid](https://github.com/Zaidmcuni)

## AI assistance

AI assistants contributed to project research and documentation.
