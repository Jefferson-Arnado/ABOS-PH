/**
 * Server-side Supabase client (docs/ARCHITECTURE.md §9): service-role key,
 * server-only. API routes use these helpers — never import from client
 * components, and never bundle the service key into client code.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Shared service-role client (cached per server process). */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * The user that owns scans until Phase 6 auth lands (user decision
 * 2026-09-10). Seeded by scripts/seed-dev-user.mjs.
 */
export function getDevUserId(): string {
  const id = process.env.DEV_USER_ID;
  if (!id) {
    throw new Error(
      "DEV_USER_ID missing — run scripts/seed-dev-user.mjs and add the id to .env.local"
    );
  }
  return id;
}
