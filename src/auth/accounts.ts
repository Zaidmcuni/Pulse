/**
 * Owner: Mohamed
 * Purpose: local accounts adapter (log in, sign up, log out). The only module that knows how accounts are stored.
 * FRs: FR-01, FR-03, NFR-06
 *
 * Registered credentials live in localStorage alongside profiles; sign-in state is per tab.
 * Demo security only: the hash keeps plain passwords out of storage.
 */

import { store } from "../data/store";
import type { PlayerProfile } from "../types/pulse";

export const DEMO_PASSWORD = "dance123"; // every seeded profile's password, demo only
export const DEMO_EMAIL_DOMAIN = "pulse.demo";
export const MIN_PASSWORD_LENGTH = 8;

export interface AccountSummary { profileId: string; displayName: string; handle: string; email: string }
export type LogInResult = "ok" | "wrong";
export type SignUpResult = "ok" | "email-taken";

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const SESSION_KEY = "pulse:accounts";
const REGISTERED_KEY = "pulse:registered-accounts";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisteredAccounts = Record<string, { profileId: string; passwordHash: string }>;

interface SessionState {
  signedInProfileId: string | null;
  registered?: RegisteredAccounts;
}

function readJson<T extends object>(storage: KeyValue, key: string): Partial<T> {
  try {
    return JSON.parse(storage.get(key) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function isValidEmail(s: string): boolean {
  return EMAIL_PATTERN.test(s.trim());
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** "amira-steps" or "@amira-steps" -> "amira-steps@pulse.demo" */
export function emailForHandle(handle: string): string {
  const bare = handle.startsWith("@") ? handle.slice(1) : handle;
  return normalizeEmail(`${bare}@${DEMO_EMAIL_DOMAIN}`);
}

/** SHA-256 of "<normalized email>:<password>", lowercase hex. Demo only. */
export async function hashPassword(email: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${normalizeEmail(email)}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Accounts {
  isSignedIn(): boolean;
  signedInProfileId(): string | null;
  emailFor(profileId: string): string | null;
  listAccounts(): AccountSummary[]; // profiles with a login, sorted by displayName
  logIn(email: string, password: string): Promise<LogInResult>;
  signUp(profile: PlayerProfile, email: string, password: string): Promise<SignUpResult>;
  logOut(): void;
}

export function createAccounts(deps: {
  store: Pick<typeof store, "listProfiles" | "saveProfile" | "setActiveProfile" | "isSeededProfile">;
  session: KeyValue;
  local: KeyValue;
}): Accounts {
  const { store: profiles, session, local } = deps;

  function registeredAccounts(): RegisteredAccounts {
    const registered = readJson<RegisteredAccounts>(local, REGISTERED_KEY) as RegisteredAccounts;
    const legacy = readJson<SessionState>(session, SESSION_KEY);
    if (!legacy.registered) return registered;
    // A tab still open from the old version can recover its registered credentials.
    const profileIds = new Set(profiles.listProfiles().map(({ id }) => id));
    const legacyAccounts = Object.fromEntries(
      Object.entries(legacy.registered).filter(([, account]) => profileIds.has(account.profileId)),
    );
    const migrated = { ...legacyAccounts, ...registered };
    local.set(REGISTERED_KEY, JSON.stringify(migrated));
    session.set(SESSION_KEY, JSON.stringify({ signedInProfileId: legacy.signedInProfileId }));
    return migrated;
  }

  function signedInProfileId(): string | null {
    const sessionState = readJson<SessionState>(session, SESSION_KEY);
    if (sessionState.registered) registeredAccounts();
    const id = sessionState.signedInProfileId;
    return typeof id === "string" && profiles.listProfiles().some((p) => p.id === id) ? id : null;
  }

  function profileEmail(profile: PlayerProfile, registered: RegisteredAccounts): string | null {
    const email = Object.keys(registered).find((e) => registered[e].profileId === profile.id);
    return email ?? (profiles.isSeededProfile(profile.id) ? emailForHandle(profile.handle) : null);
  }

  function seededWithEmail(email: string): PlayerProfile | undefined {
    return profiles.listProfiles().find((p) => profiles.isSeededProfile(p.id) && emailForHandle(p.handle) === email);
  }

  function signIn(profileId: string): void {
    profiles.setActiveProfile(profileId);
    session.set(SESSION_KEY, JSON.stringify({ signedInProfileId: profileId }));
  }

  return {
    isSignedIn: () => signedInProfileId() !== null,
    signedInProfileId,
    emailFor(profileId) {
      const profile = profiles.listProfiles().find((p) => p.id === profileId);
      return profile ? profileEmail(profile, registeredAccounts()) : null;
    },
    listAccounts() {
      const registered = registeredAccounts();
      return profiles.listProfiles()
        .flatMap((p) => {
          const email = profileEmail(p, registered);
          return email ? [{ profileId: p.id, displayName: p.displayName, handle: p.handle, email }] : [];
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
    },
    async logIn(rawEmail, password) {
      const email = normalizeEmail(rawEmail);
      const hash = await hashPassword(email, password);
      const registered = registeredAccounts()[email];
      if (registered && profiles.listProfiles().some(({ id }) => id === registered.profileId)) {
        if (hash !== registered.passwordHash) return "wrong";
        signIn(registered.profileId);
        return "ok";
      }
      const seeded = seededWithEmail(email);
      if (!seeded || password !== DEMO_PASSWORD) return "wrong";
      signIn(seeded.id);
      return "ok";
    },
    async signUp(profile, rawEmail, password) {
      const email = normalizeEmail(rawEmail);
      const passwordHash = await hashPassword(email, password);
      const registered = registeredAccounts();
      if (seededWithEmail(email) || Object.hasOwn(registered, email)) {
        return "email-taken";
      }
      local.set(REGISTERED_KEY, JSON.stringify({ ...registered, [email]: { profileId: profile.id, passwordHash } }));
      try {
        profiles.saveProfile(profile);
      } catch (error) {
        local.set(REGISTERED_KEY, JSON.stringify(registered));
        throw error;
      }
      signIn(profile.id);
      return "ok";
    },
    logOut() {
      if (readJson<SessionState>(session, SESSION_KEY).registered) registeredAccounts();
      session.remove(SESSION_KEY);
    },
  };
}

/** Browser storage, with an in-memory fallback for previews and tests. */
function browserStorage(kind: "localStorage" | "sessionStorage"): KeyValue {
  let storage: Storage | null = null;
  try {
    storage = typeof window === "undefined" ? null : window[kind];
  } catch {
    storage = null;
  }
  const s = storage;
  if (!s) {
    const memory = new Map<string, string>();
    return {
      get: (key) => memory.get(key) ?? null,
      set: (key, value) => void memory.set(key, value),
      remove: (key) => void memory.delete(key),
    };
  }
  return {
    get: (key) => s.getItem(key),
    set: (key, value) => s.setItem(key, value),
    remove: (key) => s.removeItem(key),
  };
}

export const accounts: Accounts = createAccounts({ store, session: browserStorage("sessionStorage"), local: browserStorage("localStorage") });
