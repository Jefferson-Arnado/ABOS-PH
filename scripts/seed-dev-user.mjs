#!/usr/bin/env node
/**
 * Seed a dev user for Phase 5 persistence (user decision 2026-09-10:
 * real auth arrives in Phase 6; until then scans are owned by this user).
 *
 * Usage:  node --env-file=.env.local scripts/seed-dev-user.mjs
 *
 * Uses the service-role key (server-side only — never expose it to the
 * client bundle). Safe to re-run: idempotent.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/seed-dev-user.mjs"
  );
  process.exit(1);
}

const DEV_EMAIL = process.env.DEV_USER_EMAIL ?? "dev@localhost.local";
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD ?? "dev-password-1234";

// Auth admin REST API: <url>/auth/v1/admin/users (service role required).
const restUrl = (path) => `${url}/auth/v1/${path}`;

async function main() {
  // 1. Try to create the user (service role bypasses email confirmation).
  const createRes = await fetch(restUrl("admin/users"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      email_confirm: true,
    }),
  });

  if (createRes.ok) {
    const created = await createRes.json();
    console.log(`created dev user ${DEV_EMAIL}`);
    console.log("DEV_USER_ID=" + created.id);
    return;
  }

  const err = await createRes.json().catch(() => ({}));
  const alreadyExists =
    createRes.status === 422 || /already|registered|exists/i.test(err.msg ?? "");

  if (!alreadyExists) {
    console.error(`failed to create user: HTTP ${createRes.status}`, err);
    process.exit(1);
  }

  // 2. User exists → look up its id.
  const listRes = await fetch(
    `${restUrl("admin/users")}?email=${encodeURIComponent(DEV_EMAIL)}`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
  );
  if (!listRes.ok) {
    console.error(`failed to list users: HTTP ${listRes.status}`);
    process.exit(1);
  }
  const list = await listRes.json();
  const existing = list.users?.find((u) => u.email === DEV_EMAIL);
  if (!existing) {
    console.error("user reported as existing but not found in list");
    process.exit(1);
  }
  console.log(`dev user already exists: ${DEV_EMAIL}`);
  console.log("DEV_USER_ID=" + existing.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
