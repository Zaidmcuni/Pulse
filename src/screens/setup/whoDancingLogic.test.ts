/**
 * Owner: Mohamed
 * Purpose: unit tests for the "Who's dancing?" helpers
 * FRs: FR-01, FR-03
 */

import { describe, expect, it } from "vitest";
import { CONFIG } from "../../config";
import type { PlayerProfile } from "../../types/pulse";
import { GUEST_ID, guestProfile, handleTaken, quickStartProfile, validateQuickStart } from "./whoDancingLogic";

describe("validateQuickStart", () => {
  it("accepts a name and handle", () => {
    expect(validateQuickStart("Mina", "mina-moves")).toEqual({});
  });

  it("reports only name and handle problems", () => {
    const errors = validateQuickStart("", "a");
    expect(Object.keys(errors).sort()).toEqual(["displayName", "handle"]);
  });
});

describe("quickStartProfile", () => {
  it("builds a full profile from name, handle and mode", () => {
    const p = quickStartProfile(" Mina ", "@Mina-Moves", "seated", () => "p-1");
    expect(p).toMatchObject({ id: "p-1", displayName: "Mina", handle: "mina-moves", mode: "seated", groupIds: [] });
    expect(p.restingHr).toBe(CONFIG.restingHrDefault);
    expect(p.hrMaxOverride).toBeUndefined();
  });

  it("guest is one fixed profile", () => {
    expect(guestProfile()).toMatchObject({ id: GUEST_ID, displayName: "Guest", handle: "guest", mode: "standing" });
  });
});

describe("handleTaken", () => {
  const amira = { handle: "amira-steps" } as PlayerProfile;
  it("matches case-insensitively and ignores @", () => {
    expect(handleTaken("@Amira-Steps", [amira])).toBe(true);
    expect(handleTaken("someone-else", [amira])).toBe(false);
  });
});
