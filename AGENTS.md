# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## PULSE project notes

- Read [Details/Description.md](Details/Description.md) for the current product scope, shared data contract, and acceptance gates. Use its catalogue-based flow when picking up work.
- Coordinate shared type changes with the teammates whose branches consume them. Include the affected interfaces and verification results in your pull request.
- Keep webcam processing in the browser and discard raw frames after pose extraction. Bundle the MediaPipe model and WASM for offline use. Use the song's audio clock for coach and template timing.
- When changing pose, scoring, or wearable behavior, verify the relevant seated, tracking-loss, and disconnected-device cases from the spec. Record the browser and device used for any live heart-rate test.

## PULSE workflow (follow for every task, in this order)

1. **Read the rules:** [RULES.md](RULES.md). It defines ownership, the module contracts, `CONFIG`, conventions and what's out of scope.
2. **Read your task:** `CURRENT-TASK.md`. If it doesn't exist or is empty, stop and ask the user to create it from [TASK.md](TASK.md). Read only the parts of [Details/Description.md](Details/Description.md) and [Details/Detailed-Tasks.md](Details/Detailed-Tasks.md) that the task points to.
3. **Plan before coding:** restate the goal, the FR ids, the files you'll create or edit (all must be in folders the task owner owns), and the "Done when" criteria. Give a short plan with a verify step for each item (section 4). If anything is unclear or conflicts with RULES.md or Details/Description.md, stop and ask.
4. **Code:** do only what CURRENT-TASK.md describes. Use the contract signatures from RULES.md exactly and take every threshold from `CONFIG`.
5. **Verify:** run `npm run typecheck`, `npm test` and `npm run build`, and check each "Done when" item. Your golden tests in `src/contracts/contracts.test.ts` must pass, not be skipped.
6. **Review against the rules again:** re-read RULES.md and check your diff line by line:
   - only owned files touched; no edits to `src/types/pulse.ts`, `src/config.ts`, `src/contracts/`, `src/mocks/`, `package.json`, any exported signature or any golden test
   - no hard-coded thresholds; conventions table followed (time domains, pixel-space vectors, mirroring, absent-not-null, units in names, privacy)
   - nothing from the out-of-scope list; no new dependencies, network or API calls
   - Definition of done met

   Fix anything that fails, then repeat steps 5 and 6.
7. **Report in the chat** (don't commit or push unless asked), using this format:

```
Task: <name> (FR-xx, FR-yy)
Files changed: <paths>
What I did: <2–4 lines>
Verification: build <pass/fail>, tests <pass/fail>; Done-when: <each item ✓/✗>
Rules review: ownership ✓/✗ · contracts ✓/✗ · CONFIG ✓/✗ · conventions ✓/✗ · scope ✓/✗ · deps/network ✓/✗
Needs from others: <shared-file or contract changes needed, proposed, not made — or "none">
Open questions: <or "none">
Suggested commit message: [FR-xx] <message>
PR description: <filled PR template from RULES.md>
```
