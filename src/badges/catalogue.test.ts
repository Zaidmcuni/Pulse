/**
 * Owner: Mohamed
 * Purpose: Badge catalogue coverage.
 * FRs: FR-46
 */

import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { badgeNames } from "../screens/social/badgeNames";
import type { BadgeId } from "../types/pulse";
import { BADGE_CATALOGUE, FAMILY_LABELS, FAMILY_ORDER, getBadgeDef } from "./catalogue";

const DISPLAY_ORDER: BadgeId[] = [
  "first_steps", "on_fire", "superstar", "1k_club", "3k_club", "5k_club", "10k_club", "crew_player", "podium",
];

describe("BADGE_CATALOGUE", () => {
  it("has all 9 badges once, in display order", () => {
    const ids = BADGE_CATALOGUE.map(({ id }) => id);
    expect(ids).toEqual(DISPLAY_ORDER);
    expect(new Set(ids).size).toBe(9);
    expect(new Set(ids)).toEqual(new Set(Object.keys(badgeNames)));
  });

  it("reuses the shared display names", () => {
    for (const badge of BADGE_CATALOGUE) expect(badge.name).toBe(badgeNames[badge.id]);
  });

  it("gives tiers only to the points clubs, bronze to platinum", () => {
    const tiered = BADGE_CATALOGUE.filter(({ tier }) => tier !== null);
    expect(tiered.map(({ id }) => id)).toEqual(["1k_club", "3k_club", "5k_club", "10k_club"]);
    expect(tiered.map(({ tier }) => tier)).toEqual(["bronze", "silver", "gold", "platinum"]);
    expect(tiered.every(({ family }) => family === "points")).toBe(true);
  });

  it("builds how-to-earn text from CONFIG", () => {
    expect(getBadgeDef("first_steps").howToEarn).toBe("Finish your first dance.");
    expect(getBadgeDef("on_fire").howToEarn).toContain(String(CONFIG.badges.streakDays));
    expect(getBadgeDef("superstar").howToEarn).toContain(`${CONFIG.level.superstar}%`);
    expect(getBadgeDef("1k_club").howToEarn).toBe("Earn 1,000 points in total.");
    expect(getBadgeDef("10k_club").howToEarn).toContain("10,000");
    expect(getBadgeDef("podium").howToEarn).toContain(String(CONFIG.badges.podiumPlaces));
  });

  it("looks up a badge and labels the families", () => {
    expect(getBadgeDef("podium").family).toBe("social");
    expect(getBadgeDef("first_steps").family).toBe("milestones");
    expect(FAMILY_ORDER).toEqual(["milestones", "points", "social"]);
    expect(FAMILY_ORDER.map((family) => FAMILY_LABELS[family])).toEqual(["Milestones", "Points clubs", "Crew"]);
  });
});
