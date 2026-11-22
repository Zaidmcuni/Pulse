/**
 * Owner: Mohamed
 * Purpose: unit tests for the local accounts adapter (fake store, in-memory session)
 * FRs: FR-01, FR-03, NFR-06
 */

import { describe, expect, it } from "vitest";
import type { PlayerProfile } from "../types/pulse";
import { createAccounts, DEMO_PASSWORD, emailForHandle, hashPassword, isValidEmail, type KeyValue } from "./accounts";

const AMIRA: PlayerProfile = {
  id: "p-amira", handle: "amira-steps", displayName: "Amira", age: 37, sex: "female",
  weightKg: 88, heightCm: 165, restingHr: 60, mode: "seated", groupIds: [],
};
const THEO: PlayerProfile = { ...AMIRA, id: "p-theo", handle: "theo", displayName: "theo" };
const NEW: PlayerProfile = { ...AMIRA, id: "p-new", handle: "newbie", displayName: "Newbie" };

function setup(profiles: PlayerProfile[] = [THEO, AMIRA]) {
  const list = [...profiles];
  let activeId: string | null = null;
  const fakeStore = {
    listProfiles: () => [...list],
    saveProfile: (p: PlayerProfile) => {
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p;
      else list.push(p);
    },
    setActiveProfile: (id: string) => { activeId = id; },
  };
  const map = new Map<string, string>();
  const session: KeyValue = {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
  const accounts = createAccounts({ store: fakeStore, session });
  return { accounts, list, map, activeId: () => activeId };
}

describe("helpers", () => {
  it("hashPassword is deterministic 64-char hex, ignores email case, differs by password", async () => {
    const a = await hashPassword("amira@pulse.demo", "dance123");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPassword("amira@pulse.demo", "dance123")).toBe(a);
    expect(await hashPassword("Amira@Pulse.Demo", "dance123")).toBe(a);
    expect(await hashPassword("amira@pulse.demo", "dance124")).not.toBe(a);
  });

  it("isValidEmail and emailForHandle", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.d")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(emailForHandle("@demo")).toBe("demo@pulse.demo");
    expect(emailForHandle("amira-steps")).toBe("amira-steps@pulse.demo");
  });
});

describe("createAccounts", () => {
  it("logs in a seeded profile with the demo password only", async () => {
    const { accounts, activeId } = setup();
    expect(accounts.isSignedIn()).toBe(false);
    expect(await accounts.logIn("amira-steps@pulse.demo", "wrong123")).toBe("wrong");
    expect(await accounts.logIn("nobody@pulse.demo", DEMO_PASSWORD)).toBe("wrong");
    expect(accounts.isSignedIn()).toBe(false);
    expect(await accounts.logIn(" Amira-Steps@pulse.demo ", DEMO_PASSWORD)).toBe("ok");
    expect(activeId()).toBe("p-amira");
    expect(accounts.isSignedIn()).toBe(true);
    expect(accounts.signedInProfileId()).toBe("p-amira");
  });

  it("signs up, signs in, and later logs in with the new email and password", async () => {
    const { accounts, list, activeId } = setup();
    expect(await accounts.signUp(NEW, "New@Example.com", "secret-pass")).toBe("ok");
    expect(list.some((p) => p.id === "p-new")).toBe(true);
    expect(activeId()).toBe("p-new");
    expect(accounts.isSignedIn()).toBe(true);
    expect(accounts.emailFor("p-new")).toBe("new@example.com");

    accounts.logOut();
    expect(await accounts.logIn("new@example.com", "wrong-pass")).toBe("wrong");
    expect(await accounts.logIn("new@example.com", "secret-pass")).toBe("ok");
    expect(accounts.signedInProfileId()).toBe("p-new");
  });

  it("rejects an email already used by a sign-up (any case) or a seeded profile", async () => {
    const { accounts, list } = setup();
    await accounts.signUp(NEW, "new@example.com", "secret-pass");
    const before = list.length;
    expect(await accounts.signUp({ ...NEW, id: "p-other" }, "NEW@example.COM", "another-pass")).toBe("email-taken");
    expect(await accounts.signUp({ ...NEW, id: "p-other" }, "amira-steps@pulse.demo", "another-pass")).toBe("email-taken");
    expect(list).toHaveLength(before);
  });

  it("logOut signs out; corrupt session JSON reads as signed out without throwing", async () => {
    const { accounts, map } = setup();
    await accounts.logIn("theo@pulse.demo", DEMO_PASSWORD);
    accounts.logOut();
    expect(accounts.isSignedIn()).toBe(false);
    map.set("pulse:accounts", "{not json");
    expect(() => accounts.isSignedIn()).not.toThrow();
    expect(accounts.isSignedIn()).toBe(false);
    expect(await accounts.logIn("theo@pulse.demo", DEMO_PASSWORD)).toBe("ok");
  });

  it("is signed out when the signed-in profile no longer exists", async () => {
    const { accounts, list } = setup();
    await accounts.logIn("theo@pulse.demo", DEMO_PASSWORD);
    list.splice(list.findIndex((p) => p.id === "p-theo"), 1);
    expect(accounts.isSignedIn()).toBe(false);
    expect(accounts.emailFor("p-theo")).toBeNull();
  });

  it("lists accounts sorted by name with no password data", async () => {
    const { accounts } = setup();
    await accounts.signUp(NEW, "new@example.com", "secret-pass");
    const list = accounts.listAccounts();
    expect(list.map((a) => a.displayName)).toEqual(["Amira", "Newbie", "theo"]);
    expect(list[0]).toEqual({ profileId: "p-amira", displayName: "Amira", handle: "amira-steps", email: "amira-steps@pulse.demo" });
    const text = JSON.stringify(list);
    expect(text).not.toMatch(/hash|password|secret-pass|dance123/i);
  });
});
