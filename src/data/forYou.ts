/**
 * Owner: Ali
 * Purpose: For you ranking (pure)
 * FRs: FR-12
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { CONFIG } from "../config";
import type { Dance, Difficulty, SessionResult } from "../types/pulse";

const difficulties: readonly Difficulty[] = ["easy", "medium", "hard"];

/** Only completed results count. Last CONFIG.forYou.lookback; >= upPct -> harder, < downPct -> easier; none -> Popular order. */
export function rankForYou(dances: Dance[], results: SessionResult[]): Dance[] {
  const { lookback, upPct, downPct } = CONFIG.forYou;
  const popular = [...dances].sort((a, b) => b.popularity - a.popularity);
  const recent = results.filter((result) => result.completed)
    .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
    .slice(0, lookback);
  const baseline = recent.map(({ danceId }) => dances.find(({ id }) => id === danceId))
    .find((dance) => dance !== undefined);
  if (!baseline) return popular;

  const average = recent.reduce((sum, result) => sum + result.accuracyPct, 0) / recent.length;
  // Decimal scores can put an exact threshold just below it in floating-point arithmetic.
  const comparisonPct = average + average * Number.EPSILON * recent.length;
  const step = comparisonPct >= upPct ? 1 : comparisonPct < downPct ? -1 : 0;
  const targetIndex = Math.max(0, Math.min(difficulties.length - 1, difficulties.indexOf(baseline.difficulty) + step));
  const target = popular.filter((dance) => dance.difficulty === difficulties[targetIndex]);
  return target.length ? target : popular;
}
