/**
 * Supabase connection check — verifies env vars are set and the project responds.
 * Never prints secret values. Run: node --env-file=.env.local scripts/check-supabase.mjs
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("— Supabase connection check —");
console.log("URL set:            ", url ? `yes (${url})` : "NO ❌");
console.log("Anon key set:       ", anon ? "yes" : "NO ❌");
console.log("Service key set:    ", service ? "yes" : "NO ❌");

if (!url) {
  console.error("\n❌ NEXT_PUBLIC_SUPABASE_URL is missing in .env.local");
  process.exit(1);
}

async function checkKey(label, key) {
  if (!key) {
    console.log(`${label}: skipped (not set)`);
    return false;
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      console.log(`${label}: HTTP ${res.status} ✅ connected`);
      return true;
    }
    console.log(`${label}: HTTP ${res.status} ❌ key rejected — re-copy it from dashboard`);
    return false;
  } catch (err) {
    console.log(`${label}: network error ❌ (${err.message}) — is the project paused or URL wrong?`);
    return false;
  }
}

const anonOk = await checkKey("Anon key   ", anon);
const serviceOk = await checkKey("Service key", service);

console.log(
  `\n${anonOk && serviceOk ? "✅ Supabase is connected and keys are valid" : "❌ Fix the items above, then re-run"}`
);
process.exit(anonOk && serviceOk ? 0 : 1);
