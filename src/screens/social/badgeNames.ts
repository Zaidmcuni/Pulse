/**
 * Owner: Ali
 * Purpose: Display names for earned badges on Results and Profile.
 * FRs: FR-41, FR-46
 */

import type { BadgeId } from "../../types/pulse";

export const badgeNames: Record<BadgeId, string> = {
  first_steps: "First Steps",
  on_fire: "On Fire",
  superstar: "Superstar",
  "1k_club": "1K Club",
  "3k_club": "3K Club",
  "5k_club": "5K Club",
  "10k_club": "10K Club",
  crew_player: "Crew Player",
  podium: "Podium",
};
