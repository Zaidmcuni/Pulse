/**
 * Owner: Ali
 * Purpose: localStorage-backed Store; seed from /seed/*.json on first run; dances from /dances/index.json (kept in memory, never in localStorage)
 * FRs: FR-51, FR-52
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Every dance file goes through parseDance(). Every saved result through assertSessionResult(); every post through assertFeedPost().
 */

import type { Store } from "../types/pulse";
import { createMemoryStore } from "../mocks/memoryStore";

// TODO(Ali): replace the mock with the real localStorage implementation. Keep the export name and type.
export const store: Store = createMemoryStore();
