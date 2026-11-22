/**
 * Owner: Mohamed
 * Purpose: local accounts adapter (log in, sign up, log out). The only module that knows how accounts are stored.
 * FRs: FR-01, FR-03, NFR-06
 *
 * TEMPORARY STORAGE UNTIL TASK 13: PlayerProfile has no email or password hash yet, so accounts live in one
 * session key ("pulse:accounts"). Seeded profiles use emailForHandle(handle) and DEMO_PASSWORD. Task 13 swaps
 * these internals for PlayerProfile fields; screens only use the Accounts interface and don't change.
 * Demo security only: the hash just keeps plain passwords out of storage. Nothing here is secure.
 */

import { store } from "../data/store";
import type { PlayerProfile, Store } from "../types/pulse";

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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SessionState {
  signedInProfileId: string | null;
  registered: Record<string, { profileId: string; passwordHash: string }>;
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
  listAccounts(): AccountSummary[]; // one per store profile, sorted by displayName
  logIn(email: string, password: string): Promise<LogInResult>;
  signUp(profile: PlayerProfile, email: string, password: string): Promise<SignUpResult>;
  logOut(): void;
}

export function createAccounts(deps: {
  store: Pick<Store, "listProfiles" | "saveProfile" | "setActiveProfile">;
  session: KeyValue;
}): Accounts {
  const { store: profiles, session } = deps;

  function read(): SessionState {
    try {
      const parsed = JSON.parse(session.get(SESSION_KEY) ?? "") as Partial<SessionState> | null;
      return {
        signedInProfileId: typeof parsed?.signedInProfileId === "string" ? parsed.signedInProfileId : null,
        registered: parsed?.registered && typeof parsed.registered === "object" ? parsed.registered : {},
      };
    } catch {
      return { signedInProfileId: null, registered: {} };
    }
  }

  function write(state: SessionState): void {
    session.set(SESSION_KEY, JSON.stringify(state));
  }

  function registeredEmailOf(state: SessionState, profileId: string): string | null {
    return Object.keys(state.registered).find((e) => state.registered[e].profileId === profileId) ?? null;
  }

  function emailFor(profileId: string): string | null {
    const registered = registeredEmailOf(read(), profileId);
    if (registered) return registered;
    const profile = profiles.listProfiles().find((p) => p.id === profileId);
    return profile ? emailForHandle(profile.handle) : null;
  }

  /** A store profile not in `registered` whose demo email matches. */
  function seededWithEmail(state: SessionState, email: string): PlayerProfile | undefined {
    return profiles.listProfiles().find((p) => registeredEmailOf(state, p.id) === null && emailForHandle(p.handle) === email);
  }

  function signIn(state: SessionState, profileId: string): void {
    profiles.setActiveProfile(profileId);
    write({ ...state, signedInProfileId: profileId });
  }

  return {
    isSignedIn() {
      const id = read().signedInProfileId;
      return id !== null && profiles.listProfiles().some((p) => p.id === id);
    },
    signedInProfileId: () => read().signedInProfileId,
    emailFor,
    listAccounts() {
      return profiles.listProfiles()
        .map((p) => ({ profileId: p.id, displayName: p.displayName, handle: p.handle, email: emailFor(p.id) ?? "" }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
    },
    async logIn(rawEmail, password) {
      const email = normalizeEmail(rawEmail);
      const state = read();
      const hash = await hashPassword(email, password);
      const registered = state.registered[email];
      if (registered) {
        if (hash !== registered.passwordHash) return "wrong";
        signIn(state, registered.profileId);
        return "ok";
      }
      const seeded = seededWithEmail(state, email);
      if (!seeded || hash !== (await hashPassword(email, DEMO_PASSWORD))) return "wrong";
      signIn(state, seeded.id);
      return "ok";
    },
    async signUp(profile, rawEmail, password) {
      const email = normalizeEmail(rawEmail);
      const state = read();
      if (state.registered[email] || seededWithEmail(state, email)) return "email-taken";
      const passwordHash = await hashPassword(email, password);
      profiles.saveProfile(profile);
      signIn({ ...state, registered: { ...state.registered, [email]: { profileId: profile.id, passwordHash } } }, profile.id);
      return "ok";
    },
    logOut() {
      // The store can't clear the active profile until task 13, so only the session changes.
      write({ ...read(), signedInProfileId: null });
    },
  };
}

/** Browser sessionStorage, or an in-memory map when it's missing or blocked (tests, SSR). */
function browserSession(): KeyValue {
  const memory = new Map<string, string>();
  let storage: Storage | null = null;
  try {
    storage = typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    storage = null;
  }
  const s = storage;
  if (!s) {
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

export const accounts: Accounts = createAccounts({ store, session: browserSession() });
