/**
 * Owner: Mohamed / Infrastructure
 * Purpose: Unit tests for the Supabase Auth adapter (signUp, logIn, logOut, session restoration,
 *          handle/email conflict handling, and local Guest mode).
 * FRs: FR-01, FR-02, FR-03
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseStore } from "../data/supabaseStore";
import type { KeyValue } from "./accounts";
import { createSupabaseAccounts } from "./supabaseAccounts";
import type { PlayerProfile } from "../types/pulse";

const USER_ID = "33333333-3333-4333-8333-333333333333";

const PROFILE: PlayerProfile = {
  id: "p-temp",
  handle: "zaid-dancer",
  displayName: "Zaid",
  age: 22,
  sex: "male",
  weightKg: 72,
  heightCm: 178,
  restingHr: 60,
  mode: "standing",
  groupIds: [],
};

function createKeyValue(): KeyValue {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

function setupMockAuth() {
  const publicProfiles: Record<string, unknown>[] = [];
  const privateBiometrics: Record<string, unknown>[] = [];
  let currentSessionUser: { id: string; email: string } | null = null;
  let signUpError: { message: string } | null = null;
  let signInError: { message: string } | null = null;

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        const rows =
          table === "public_profiles"
            ? publicProfiles
            : table === "private_biometrics"
              ? privateBiometrics
              : [];
        const chain = {
          eq: vi.fn(() => chain),
          then(onFulfilled?: ((v: { data: unknown[]; error: null }) => unknown) | null) {
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
          },
        };
        return chain;
      }),
      upsert: vi.fn(async (payload: Record<string, unknown>) => {
        if (table === "public_profiles") {
          const existing = publicProfiles.find(
            (r) => r.handle === payload.handle && r.id !== payload.id,
          );
          if (existing) {
            return { data: null, error: { message: "duplicate key value violates unique constraint public_profiles_handle_key" } };
          }
          const idx = publicProfiles.findIndex((r) => r.id === payload.id);
          if (idx >= 0) publicProfiles[idx] = payload;
          else publicProfiles.push(payload);
        } else if (table === "private_biometrics") {
          const idx = privateBiometrics.findIndex((r) => r.user_id === payload.user_id);
          if (idx >= 0) privateBiometrics[idx] = payload;
          else privateBiometrics.push(payload);
        }
        return { data: [payload], error: null };
      }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    auth: {
      signUp: vi.fn(async ({ email }: { email: string; password: string }) => {
        if (signUpError) return { data: { user: null, session: null }, error: signUpError };
        currentSessionUser = { id: USER_ID, email };
        return {
          data: {
            user: { id: USER_ID, email, identities: [{ id: USER_ID }] },
            session: { access_token: "token-123", user: currentSessionUser },
          },
          error: null,
        };
      }),
      signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => {
        if (signInError) return { data: { user: null, session: null }, error: signInError };
        currentSessionUser = { id: USER_ID, email };
        return {
          data: {
            user: { id: USER_ID, email },
            session: { access_token: "token-123", user: currentSessionUser },
          },
          error: null,
        };
      }),
      signOut: vi.fn(async () => {
        currentSessionUser = null;
        return { error: null };
      }),
      getSession: vi.fn(async () => ({
        data: {
          session: currentSessionUser ? { user: currentSessionUser } : null,
        },
        error: null,
      })),
    },
  } as unknown as SupabaseClient;

  const store = createSupabaseStore(client);
  const session = createKeyValue();
  const local = createKeyValue();
  const accounts = createSupabaseAccounts({ store, client, session, local });

  return {
    client,
    store,
    accounts,
    publicProfiles,
    privateBiometrics,
    setSessionUser: (u: { id: string; email: string } | null) => {
      currentSessionUser = u;
    },
    setSignUpError: (err: { message: string } | null) => {
      signUpError = err;
    },
    setSignInError: (err: { message: string } | null) => {
      signInError = err;
    },
  };
}

describe("createSupabaseAccounts", () => {
  it("signUp creates Supabase Auth user, splits public_profiles and private_biometrics, and signs in", async () => {
    const { accounts, store, publicProfiles, privateBiometrics } = setupMockAuth();
    await store.init();

    const res = await accounts.signUp(PROFILE, "Zaid@McGill.ca", "securePass123");
    expect(res).toBe("ok");
    expect(accounts.isSignedIn()).toBe(true);
    expect(accounts.signedInProfileId()).toBe(USER_ID);
    expect(accounts.emailFor(USER_ID)).toBe("zaid@mcgill.ca");

    expect(publicProfiles).toContainEqual({
      id: USER_ID,
      handle: "zaid-dancer",
      display_name: "Zaid",
      mode: "standing",
    });
    expect(privateBiometrics[0]).toMatchObject({
      user_id: USER_ID,
      age: 22,
      sex: "male",
      weight_kg: 72,
      height_cm: 178,
      resting_hr: 60,
    });
    expect(store.getActiveProfile()?.id).toBe(USER_ID);
    expect(store.getActiveProfile()?.weightKg).toBe(72);
  });

  it("signUp returns email-taken or handle-taken on conflicts", async () => {
    const { accounts, store, setSignUpError } = setupMockAuth();
    await store.init();

    setSignUpError({ message: "User already registered" });
    expect(await accounts.signUp(PROFILE, "zaid@mcgill.ca", "securePass123")).toBe("email-taken");
    setSignUpError(null);

    await accounts.signUp(PROFILE, "zaid@mcgill.ca", "securePass123");
    const otherProfile: PlayerProfile = { ...PROFILE, id: "p-other", handle: "zaid-dancer" };
    expect(await accounts.signUp(otherProfile, "other@mcgill.ca", "securePass123")).toBe("handle-taken");
    expect(accounts.lastError()).toContain("handle is already taken");
  });

  it("logIn authenticates via signInWithPassword, hydrates private biometrics, and logOut clears private data", async () => {
    const { accounts, store, setSignInError } = setupMockAuth();
    await store.init();
    await accounts.signUp(PROFILE, "zaid@mcgill.ca", "securePass123");

    accounts.logOut();
    expect(accounts.isSignedIn()).toBe(false);
    expect(store.getActiveProfile()).toBeNull();
    // Private weight is cleared from in-memory profile after logout
    expect(store.listProfiles().find((p) => p.id === USER_ID)?.weightKg).toBe(70);

    setSignInError({ message: "Invalid login credentials" });
    expect(await accounts.logIn("zaid@mcgill.ca", "wrongPass")).toBe("wrong");
    expect(accounts.isSignedIn()).toBe(false);

    setSignInError(null);
    expect(await accounts.logIn("Zaid@McGill.ca", "securePass123")).toBe("ok");
    expect(accounts.isSignedIn()).toBe(true);
    expect(accounts.signedInProfileId()).toBe(USER_ID);
    expect(store.getActiveProfile()?.weightKg).toBe(72);
  });

  it("restoreSession restores signed-in user from supabase.auth.getSession() on page reload", async () => {
    const { accounts, store, setSessionUser } = setupMockAuth();
    await store.init();
    await accounts.signUp(PROFILE, "zaid@mcgill.ca", "securePass123");

    // Simulate reload where session is active in Supabase Auth
    setSessionUser({ id: USER_ID, email: "zaid@mcgill.ca" });
    const restoredId = await accounts.restoreSession();
    expect(restoredId).toBe(USER_ID);
    expect(accounts.isSignedIn()).toBe(true);
    expect(store.getActiveProfile()?.id).toBe(USER_ID);
  });

  it("allows Guest local start without writing to Supabase and blocks Guest posting/group joins", async () => {
    const { accounts, store, publicProfiles } = setupMockAuth();
    await store.init();

    const guest: PlayerProfile = {
      ...PROFILE,
      id: "p-guest",
      handle: "guest",
      displayName: "Guest",
    };
    accounts.startLocal(guest);
    expect(accounts.isSignedIn()).toBe(true);
    expect(accounts.signedInProfileId()).toBe("p-guest");
    expect(publicProfiles).toHaveLength(0);

    expect(() =>
      store.createPost({
        authorId: "p-guest",
        resultId: "res-1",
        showCalories: false,
        hasClip: false,
        groupIds: [],
      }),
    ).toThrow(/Create an account/);

    expect(() => store.joinGroup("mcgill-friday-night-crew", "p-guest")).toThrow(/Create an account/);
  });
});
