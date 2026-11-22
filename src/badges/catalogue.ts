/**
 * Owner: Mohamed
 * Purpose: Catalogue of every badge (name, family, tier, how to earn it) for the badges page.
 * FRs: FR-46
 */

import { CONFIG } from "../config";
import { badgeNames } from "../screens/social/badgeNames";
import type { BadgeId } from "../types/pulse";

export type BadgeFamily = "milestones" | "points" | "social";
export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";

export interface BadgeDef {
  id: BadgeId;
  name: string;           // from badgeNames, never typed again here
  family: BadgeFamily;
  tier: BadgeTier | null; // only the points clubs have tiers
  howToEarn: string;
}

export const FAMILY_ORDER: readonly BadgeFamily[] = ["milestones", "points", "social"];

export const FAMILY_LABELS: Record<BadgeFamily, string> = {
  milestones: "Milestones",
  points: "Points clubs",
  social: "Crew",
};

const num = (value: number): string => value.toLocaleString("en-US");
const clubText = (id: keyof typeof CONFIG.badges.clubPoints): string =>
  `Earn ${num(CONFIG.badges.clubPoints[id])} points in total.`;

// A Record so a BadgeId added to the type without an entry here fails to compile. Key order = display order.
const definitions: Record<BadgeId, Omit<BadgeDef, "id" | "name">> = {
  first_steps: { family: "milestones", tier: null, howToEarn: "Finish your first dance." },
  on_fire: { family: "milestones", tier: null, howToEarn: `Finish a dance ${num(CONFIG.badges.streakDays)} days in a row.` },
  superstar: { family: "milestones", tier: null, howToEarn: `Score ${num(CONFIG.level.superstar)}% accuracy or more in one dance.` },
  "1k_club": { family: "points", tier: "bronze", howToEarn: clubText("1k_club") },
  "3k_club": { family: "points", tier: "silver", howToEarn: clubText("3k_club") },
  "5k_club": { family: "points", tier: "gold", howToEarn: clubText("5k_club") },
  "10k_club": { family: "points", tier: "platinum", howToEarn: clubText("10k_club") },
  crew_player: { family: "social", tier: null, howToEarn: "Finish your group's dance in a group you've joined." },
  podium: { family: "social", tier: null, howToEarn: `Finish top ${num(CONFIG.badges.podiumPlaces)} on a group's weekly leaderboard.` },
};

export const BADGE_CATALOGUE: readonly BadgeDef[] = (Object.keys(definitions) as BadgeId[])
  .map((id) => ({ id, name: badgeNames[id], ...definitions[id] }));

export function getBadgeDef(id: BadgeId): BadgeDef {
  const def = BADGE_CATALOGUE.find((badge) => badge.id === id);
  if (!def) throw new Error(`Unknown badge: ${id}`);
  return def;
}
