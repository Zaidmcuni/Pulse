/**
 * Owner: Shared / Infrastructure
 * Purpose: Lazy Supabase client singleton and configuration check.
 * Returns null when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are unset so
 * local/offline development and Node/Vitest tests fall back to localStorage cleanly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;

function readEnv(key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  if (env?.MODE === "test") return "";
  const val = env?.[key];
  return typeof val === "string" ? val.trim() : "";
}

export function isSupabaseConfigured(): boolean {
  if (clientInstance !== null) return true;
  const url = readEnv("VITE_SUPABASE_URL");
  const key = readEnv("VITE_SUPABASE_ANON_KEY");
  return url.length > 0 && key.length > 0;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (clientInstance !== null) return clientInstance;
  const url = readEnv("VITE_SUPABASE_URL");
  const key = readEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) {
    return null;
  }
  void ensureSupabaseClient();
  return clientInstance;
}

export async function ensureSupabaseClient(): Promise<SupabaseClient | null> {
  if (clientInstance !== null) return clientInstance;
  const url = readEnv("VITE_SUPABASE_URL");
  const key = readEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) {
    return null;
  }
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => {
    clientInstance ??= createClient(url, key, {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: typeof window !== "undefined",
        detectSessionInUrl: typeof window !== "undefined",
      },
    });
    return clientInstance;
  });
  return clientPromise;
}

// Preload immediately in production when env vars are present
if (readEnv("VITE_SUPABASE_URL") && readEnv("VITE_SUPABASE_ANON_KEY")) {
  void ensureSupabaseClient();
}

/** Test helper to inject or clear a mock Supabase client in Node/Vitest suites. */
export function setSupabaseClientForTest(mock: SupabaseClient | null): void {
  clientInstance = mock;
  clientPromise = mock ? Promise.resolve(mock) : null;
}
