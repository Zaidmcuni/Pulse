# TASK.md — template for one task

Copy this file to `CURRENT-TASK.md`, fill it in for the **one** task you're doing now, and give it to your AI assistant together with the prompt block in `RULES.md` section 6. Keep it short: only what this task needs. When the task is merged, overwrite it with the next one.

---

## Task: <short name>

**Owner:** <name> · **Branch:** `<name>/<task>` · **FRs:** FR-xx, FR-yy · **Priority:** Must / Should

### Goal

<One or two sentences: what this task makes possible.>

### Context (only what this task needs)

- **Spec / requirements:** <section names or FR text to read, nothing else>
- **Files I create or edit:** <paths, all inside folders I own>
- **Inputs:** <what this code receives: type + where it comes from (module or mock)>
- **Outputs:** <what it produces: exact exported signature from RULES.md section 2 + who uses it>
- **CONFIG values used:** <e.g. `CONFIG.visibilityMin`, `CONFIG.toleranceDeg`>
- **Conventions that matter here:** <e.g. pixel-space vectors, song-time ms, absent-not-null>

### Steps

- [ ] <step 1>
- [ ] <step 2>
- [ ] Unit tests for pure logic

### Not in this task

<Things that are tempting but belong to another task or person. The assistant must not do these.>

### Done when

- [ ] <acceptance criterion copied from the FR>
- [ ] Works with the mocks and with real modules already on `main`
- [ ] `npm run build` and `npm test` pass
- [ ] PR opened with the template from `RULES.md`

### Notes / questions

<Anything unclear. Ask the team before guessing.>
