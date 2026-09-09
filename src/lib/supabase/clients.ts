/**
 * Supabase cookie-based clients (docs/PLAN.md Phase 6, Next 16):
 * - browser: client components (login form, scan button)
 * - server: server components / route handlers (read session, RLS queries)
 * - proxy: session refresh in the request path (proxy.ts, Node runtime)
 *
 * Sessions live in cookies so the server can read them — the session user
 * replaces DEV_USER_ID for scan ownership (user decision 2026-09-10).
 */

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Client-side client (browser components). Safe: anon key only. */
export function getSupabaseBrowser(): SupabaseClient {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Server-side client bound to the request's cookies (Server Components +
 * Route Handlers). In Next 16 `cookies()` is async.
 */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render pass — refresh handled
          // by the proxy instead; safe to ignore.
        }
      },
    },
  });
}

/** Session-refresh client for proxy.ts — cookie writes go on the response. */
export function getSupabaseProxy(
  request: Request,
  response: { cookies: { set: (name: string, value: string, options?: object) => void } }
): SupabaseClient {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.headers
          .get("cookie")
          ?.split(";")
          .map((v) => {
            const [key, ...rest] = v.trim().split("=");
            return { name: key, value: decodeURIComponent(rest.join("=")) };
          })
          .filter((c) => c.name.length > 0) ?? [];
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          response.cookies.set(name, value)
        );
      },
    },
  });
}

/**
 * The authenticated user for the current request, or null. Route handlers
 * use this for 401s + ownership; never trust client-supplied user ids.
 */
export async function getSessionUser(): Promise<{
  id: string;
  email?: string;
} | null> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? undefined } : null;
}
