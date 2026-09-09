"use server";

/**
 * Auth server actions (docs/PLAN.md Phase 6). Server-side per the Next 16
 * authentication guide: validate with zod, authenticate with Supabase,
 * redirect on success. Authorization is re-checked per request in proxy +
 * route handlers — never rely on the client form alone.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email").trim(),
  password: z.string().min(8, "At least 8 characters"),
});

export interface AuthFormState {
  error?: string;
}

/** Server client bound to the action's cookies (cookie writes allowed in actions). */
async function getActionSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function login(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }

  redirect(formData.get("next")?.toString() || "/dashboard");
}

export async function signup(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    return { error: error.message };
  }

  // Email confirmation on: no session yet — tell the user to check inbox.
  if (!data.session) {
    return {
      error: "Check your inbox to confirm your email, then sign in.",
    };
  }

  redirect(formData.get("next")?.toString() || "/dashboard");
}

export async function signout(): Promise<void> {
  const supabase = await getActionSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
