/**
 * Owner: Shared (Step 0)
 * Purpose: sample SessionResults (completed and quit early) for building the results screen.
 */
import type { SessionResult } from "../types/pulse";

export const FAKE_RESULT: SessionResult = {
  id: "res-fake-1", playerId: "p-demo", danceId: "fake-arms", completed: true,
  totalPoints: 842, accuracyPct: 78, level: "gold", durationSec: 20, caloriesKcal: 3.1,
  bestWindowStartSec: 4, createdAtIso: "2026-11-21T15:00:00.000Z",
  samples: Array.from({ length: 20 }, (_, i) => ({ tSec: i, heartRate: 110 + i, hrSource: "simulated" as const, effort: 3, accuracy: 0.78, points: 42 })),
};

export const FAKE_RESULT_QUIT: SessionResult = {
  ...FAKE_RESULT, id: "res-fake-2", completed: false, totalPoints: 0, accuracyPct: 0, level: "bronze", durationSec: 9, caloriesKcal: 1.2,
};
