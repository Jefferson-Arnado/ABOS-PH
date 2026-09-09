/**
 * Session refresh in the request path. Next 16: `middleware` is deprecated
 * and renamed `proxy` (Node runtime by default) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 *
 * Runs on page navigations (API routes are excluded): refreshes the
 * Supabase auth cookie so server components always see a valid session.
 * Actual authorization still happens per route/action (docs guidance).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not add logic between the client creation and getUser() —
  // the refresh token rotation needs to run first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected pages: bounce unauthenticated users to login.
  const { pathname } = request.nextUrl;
  if (!user && (pathname.startsWith("/dashboard") || pathname.startsWith("/results"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * All app requests (incl. /api, so auth cookies stay fresh for route
     * handlers) except static assets and metadata files.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
