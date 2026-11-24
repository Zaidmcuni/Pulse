/**
 * Owner: Mohamed / Infrastructure
 * Purpose: Production Supabase Auth adapter implementing the Accounts interface.
 *          Maps Supabase Auth users to public_profiles + private_biometrics, restores sessions
 *          across reloads via supabase.auth.getSession(), and allows local Guest sessions.
 * FRs: FR-01, FR-02, FR-03
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";
import type { DemoStore } from "../data/store";
import { ensureSupabaseClient, getSupabaseClient } from "../lib/supabase";
import type { PlayerProfile } from "../types/pulse";
import {
  normalizeEmail,
  type AccountSummary,
  type Accounts,
  type DancerSummary,
  type KeyValue,
  type LogInResult,
  type SignUpResult,
} from "./accounts";

const GUEST_ID = "p-guest";
const SESSION_KEY = "pulse:supabase:session";
const EMAIL_CACHE_KEY = "pulse:supabase:emails";
const REMEMBERED_KEY = "pulse:supabase:remembered";

export interface SupabaseAccounts extends Accounts {
  restoreSession(): Promise<string | null>;
  lastError(): string | null;
}

function readJson<T>(storage: KeyValue | undefined, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.get(key);
    if (!raw) return fallback;
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function createSupabaseAccounts(deps: {
  store: DemoStore;
  client?: SupabaseClient | null;
  session?: KeyValue;
  local?: KeyValue;
}): SupabaseAccounts {
  const { store, session, local } = deps;
  let activeProfileId: string | null = readJson<{ signedInProfileId: string | null }>(
    session,
    SESSION_KEY,
    { signedInProfileId: null },
  ).signedInProfileId;
  let lastErrorMessage: string | null = null;

  const emailMap = new Map<string, string>(
    Object.entries(readJson<Record<string, string>>(local, EMAIL_CACHE_KEY, {})),
  );

  function client(): SupabaseClient | null {
    return deps.client ?? getSupabaseClient();
  }

  function persistEmail(profileId: string, email: string): void {
    const normalized = normalizeEmail(email);
    emailMap.set(profileId, normalized);
    if (local) {
      local.set(EMAIL_CACHE_KEY, JSON.stringify(Object.fromEntries(emailMap)));
    }
  }

  function rememberedIds(): string[] {
    const arr = readJson<unknown>(local, REMEMBERED_KEY, []);
    return Array.isArray(arr) ? arr.filter((id): id is string => typeof id === "string") : [];
  }

  function rememberProfile(profileId: string): void {
    if (!local) return;
    const current = rememberedIds();
    if (!current.includes(profileId)) {
      local.set(REMEMBERED_KEY, JSON.stringify([...current, profileId]));
    }
  }

  function setSignedIn(profileId: string | null): void {
    activeProfileId = profileId;
    if (session) {
      if (profileId) {
        session.set(SESSION_KEY, JSON.stringify({ signedInProfileId: profileId }));
      } else {
        session.remove(SESSION_KEY);
      }
    }
    if (profileId) {
      store.setActiveProfile(profileId);
      rememberProfile(profileId);
    }
  }

  function signedInProfileId(): string | null {
    if (!activeProfileId) return null;
    if (activeProfileId === GUEST_ID) return GUEST_ID;
    const exists = store.listProfiles().some((p) => p.id === activeProfileId);
    return exists ? activeProfileId : activeProfileId;
  }

  const byName = <T extends { displayName: string }>(a: T, b: T): number =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });

  return {
    isSignedIn: () => signedInProfileId() !== null,
    signedInProfileId,
    lastError: () => lastErrorMessage,
    emailFor(profileId: string): string | null {
      return emailMap.get(profileId) ?? null;
    },
    listAccounts(): AccountSummary[] {
      return store
        .listProfiles()
        .filter((p) => p.id !== GUEST_ID)
        .flatMap((p) => {
          const email = emailMap.get(p.id);
          return email ? [{ profileId: p.id, displayName: p.displayName, handle: p.handle, email }] : [];
        })
        .sort(byName);
    },
    listDancers(): DancerSummary[] {
      const remembered = new Set(rememberedIds());
      return store
        .listProfiles()
        .map((p) => ({
          profileId: p.id,
          displayName: p.displayName,
          handle: p.handle,
          remembered: p.id === activeProfileId || remembered.has(p.id),
        }))
        .sort(byName);
    },
    isRemembered(profileId: string): boolean {
      return profileId === activeProfileId || rememberedIds().includes(profileId);
    },
    switchTo(profileId: string): boolean {
      if (profileId === GUEST_ID) {
        if (!store.listProfiles().some((p) => p.id === GUEST_ID)) return false;
        setSignedIn(GUEST_ID);
        return true;
      }
      // In Supabase mode, switching to a real user requires an active session for that user
      if (activeProfileId === profileId && store.listProfiles().some((p) => p.id === profileId)) {
        store.setActiveProfile(profileId);
        return true;
      }
      return false;
    },
    startLocal(profile: PlayerProfile): void {
      lastErrorMessage = null;
      store.saveProfile(profile);
      setSignedIn(profile.id);
    },
    async logIn(rawEmail: string, password: string): Promise<LogInResult> {
      lastErrorMessage = null;
      const sb = client() ?? (await ensureSupabaseClient());
      if (!sb) {
        lastErrorMessage = "Supabase client is not configured.";
        return "wrong";
      }
      const email = normalizeEmail(rawEmail);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.user) {
        if (error?.message && /email not confirmed/i.test(error.message)) {
          lastErrorMessage = "Please confirm your email address before logging in (or disable 'Confirm email' in Supabase Auth).";
        } else {
          lastErrorMessage = error?.message ?? "Email or password is incorrect.";
        }
        return "wrong";
      }

      const userId = data.user.id;
      persistEmail(userId, data.user.email ?? email);
      store.setActiveProfile(userId);
      await store.refresh?.();

      // Ensure a profile exists in cache if user was created outside the signup flow
      if (!store.listProfiles().some((p) => p.id === userId)) {
        const fallbackHandle = email
          .split("@")[0]
          .replace(/[^a-z0-9_-]/g, "-")
          .slice(0, 20) || "dancer";
        const fallbackProfile: PlayerProfile = {
          id: userId,
          handle: fallbackHandle.length >= 3 ? fallbackHandle : `${fallbackHandle}-01`,
          displayName: data.user.user_metadata?.display_name ?? email.split("@")[0] ?? "Dancer",
          age: 24,
          sex: "other",
          weightKg: 70,
          heightCm: 170,
          restingHr: CONFIG.restingHrDefault,
          mode: "standing",
          groupIds: [],
        };
        store.saveProfile(fallbackProfile);
      }

      setSignedIn(userId);
      return "ok";
    },
    async signUp(profile: PlayerProfile, rawEmail: string, password: string): Promise<SignUpResult> {
      lastErrorMessage = null;
      const sb = client() ?? (await ensureSupabaseClient());
      if (!sb) {
        lastErrorMessage = "Supabase client is not configured.";
        return "error";
      }

      const email = normalizeEmail(rawEmail);
      const cleanHandle = profile.handle.trim().toLowerCase().replace(/^@/, "");

      // Check if handle is already taken in loaded public profiles
      const handleConflict = store
        .listProfiles()
        .some((p) => p.id !== profile.id && p.handle.toLowerCase().replace(/^@/, "") === cleanHandle);
      if (handleConflict) {
        lastErrorMessage = "That handle is already taken. Try another.";
        return "handle-taken";
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            handle: cleanHandle,
            display_name: profile.displayName.trim(),
          },
        },
      });

      if (error) {
        if (/already registered|already exists|email.*taken|user_already_exists/i.test(error.message)) {
          lastErrorMessage = "An account already uses this email";
          return "email-taken";
        }
        lastErrorMessage = error.message;
        return "error";
      }

      if (!data?.user) {
        lastErrorMessage = "Could not create account. Try again.";
        return "error";
      }

      // Supabase returns empty identities array when email is already taken and email enumeration protection is enabled
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        lastErrorMessage = "An account already uses this email";
        return "email-taken";
      }

      const userId = data.user.id;
      const userProfile: PlayerProfile = {
        ...profile,
        id: userId,
        handle: cleanHandle,
        displayName: profile.displayName.trim(),
      };

      const pubRes = await sb.from("public_profiles").upsert(
        {
          id: userId,
          handle: userProfile.handle,
          display_name: userProfile.displayName,
          mode: userProfile.mode,
        },
        { onConflict: "id" },
      );

      if (pubRes.error) {
        if (/duplicate key|unique|handle/i.test(pubRes.error.message)) {
          lastErrorMessage = "That handle is already taken. Try another.";
          return "handle-taken";
        }
        if (!data.session || /row-level security/i.test(pubRes.error.message)) {
          lastErrorMessage =
            "Account created! Please check your email to confirm your address before logging in (or disable 'Confirm email' in Supabase Auth settings).";
          return "confirm-email";
        }
        lastErrorMessage = pubRes.error.message;
        return "error";
      }

      const bioRes = await sb.from("private_biometrics").upsert(
        {
          user_id: userId,
          age: userProfile.age,
          sex: userProfile.sex,
          weight_kg: userProfile.weightKg,
          height_cm: userProfile.heightCm,
          resting_hr: userProfile.restingHr,
          hr_max_override: userProfile.hrMaxOverride ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (bioRes.error) {
        console.warn("[PULSE supabaseAccounts] private_biometrics upsert warning:", bioRes.error.message);
      }

      persistEmail(userId, email);
      store.setActiveProfile(userId);
      store.saveProfile(userProfile);
      await store.refresh?.();
      setSignedIn(userId);
      return "ok";
    },
    logOut(): void {
      lastErrorMessage = null;
      setSignedIn(null);
      store.clearPrivateData?.();
      const sb = client();
      if (sb) {
        void sb.auth.signOut().catch((err) => {
          console.warn("[PULSE supabaseAccounts] signOut warning:", err);
        });
      }
    },
    async restoreSession(): Promise<string | null> {
      const sb = client() ?? (await ensureSupabaseClient());
      if (!sb) return null;
      try {
        const { data, error } = await sb.auth.getSession();
        if (!error && data?.session?.user) {
          const user = data.session.user;
          if (user.email) persistEmail(user.id, user.email);
          setSignedIn(user.id);
          await store.refresh?.();
          return user.id;
        }
      } catch (err) {
        console.warn("[PULSE supabaseAccounts] restoreSession warning:", err);
      }
      if (activeProfileId === GUEST_ID && store.listProfiles().some((p) => p.id === GUEST_ID)) {
        store.setActiveProfile(GUEST_ID);
        return GUEST_ID;
      }
      setSignedIn(null);
      return null;
    },
  };
}
