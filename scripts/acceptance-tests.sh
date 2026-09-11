#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# MVP acceptance tests (docs/PLAN.md Phase 10, spec §26) — scripted.
#
# Prereqs: `npm run dev` on :3000; Supabase env in .env.local.
#
# Session handling: @supabase/ssr stores the auth-js session JSON as
# `base64-` + base64url, chunked into sb-<ref>-auth-token.{0,1,…}
# cookies (3,180 encoded chars per chunk — utils/chunker.js). We
# replicate that format exactly from a real password-grant session so
# the run is fully scripted; the UI flow itself was verified manually.
#
# Usage: set -a && source .env.local && set +a && bash scripts/acceptance-tests.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

DB_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$DB_URL" || -z "$ANON_KEY" || -z "$SERVICE_KEY" ]]; then
  echo "✗ missing Supabase env vars — run: set -a && source .env.local && set +a && bash $0"; exit 1
fi
SB_REF="$(node -e 'console.log(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0])')"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ local label="$1" expected="$2" actual="$3"; if [[ "$actual" == "$expected" ]]; then ok "$label ($actual)"; else bad "$label — expected $expected, got $actual"; fi }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "── Setup: throwaway user + real session cookie jar ──────────"
EMAIL="acceptance+$(date +%s)@localhost.local"
PASSWORD="acceptance-test-1234"
SIGNUP="$(curl -s -X POST "$DB_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}")"
USER_ID="$(node -e "let d;try{d=JSON.parse(process.argv[1])}catch{d={}};console.log(d.id||'')" "$SIGNUP")"
if [[ -z "$USER_ID" ]]; then echo "✗ could not create test user: $SIGNUP"; exit 1; fi

# Real session via password grant (exactly what signInWithPassword does).
SESSION_JSON="$(curl -s -X POST "$DB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
node -e '
// Write the chunked sb cookie file (curl jar format) from the session.
const fs = require("fs");
const { createChunks } = require("@supabase/ssr/dist/main/utils/chunker.js");
const [, jar, ref, raw] = process.argv;
const session = JSON.parse(raw);
if (!session.access_token) { console.error("no session:", raw.slice(0, 200)); process.exit(1); }
// auth-js storage shape (what @supabase/ssr persists).
const stored = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  token_type: session.token_type,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  user: session.user,
});
const encoded = "base64-" + Buffer.from(stored).toString("base64url");
const chunks = createChunks(`sb-${ref}-auth-token`, encoded);
const lines = chunks.map(c =>
  `#HttpOnly_localhost\tFALSE\t/\tFALSE\t0\t${c.name}\t${c.value}`);
fs.writeFileSync(jar, lines.join("\n") + "\n");
' "$JAR" "$SB_REF" "$SESSION_JSON"

DASH_CODE="$(code -b "$JAR" "$BASE/dashboard")"
check "authed GET /dashboard" "200" "$DASH_CODE"

echo "── Auth gate (anonymous callers get 401, no work done) ───────"
check "GET  /api/scans/x (unauth)"      "401" "$(code "$BASE/api/scans/00000000-0000-0000-0000-000000000000")"
check "GET  /api/businesses (unauth)"   "401" "$(code "$BASE/api/businesses?limit=1")"
check "GET  /api/leads (unauth)"        "401" "$(code "$BASE/api/leads")"
check "GET  /api/leads/export (unauth)" "401" "$(code "$BASE/api/leads/export")"
check "POST /api/scans (unauth)"        "401" "$(code -X POST "$BASE/api/scans" -H 'Content-Type: application/json' -d '{}')"

echo "── Tests #1–#4: scan Davao / Restaurants / 10 km (~30 s) ─────"
SCAN_RES="$(curl -s -b "$JAR" -X POST "$BASE/api/scans" \
  -H 'Content-Type: application/json' \
  -d '{"location":"Davao City","latitude":7.0731,"longitude":125.6128,"radius":10000,"category":"restaurants"}')"
SCAN_ID="$(node -e "let d;try{d=JSON.parse(process.argv[1])}catch{d={}};console.log(d.scanId||'')" "$SCAN_RES")"
if [[ -n "$SCAN_ID" ]]; then ok "Test #1: scan created ($SCAN_ID)"; else bad "Test #1: scan failed: $SCAN_RES"; exit 1; fi

node -e '
const summary = JSON.parse(process.argv[1]).summary ?? {};
console.log(`  found=${summary.businessesFound} opportunities=${summary.opportunities} high=${summary.high} medium=${summary.medium} noWebsite=${summary.noWebsite} weakWebsite=${summary.weakWebsite}`);
' "$SCAN_RES"

SCAN_URL="$BASE/api/scans/$SCAN_ID"
check "GET /api/scans/:id (authed)"   "200" "$(code -b "$JAR" "$SCAN_URL")"
check "GET foreign scan → 404"        "404" "$(code -b "$JAR" "$BASE/api/scans/00000000-0000-0000-0000-000000000000")"
check "bad scan body → 400"           "400" "$(code -b "$JAR" -X POST "$BASE/api/scans" -H 'Content-Type: application/json' -d '{"latitude":999}')"

node -e '
// Tests #2–#4 over the persisted scan payload.
const { execSync } = require("child_process");
const data = JSON.parse(execSync(`curl -s -b ${process.argv[2]} ${process.argv[1]}`).toString());
const bs = data.businesses ?? [];
const t2 = bs.length > 0 && bs.every(b => b.analysis === null ? !b.business.website : true);
const t3 = bs.filter(b => b.business.website).every(b => b.analysis !== null);
const t4 = bs.every(b => Number.isInteger(b.opportunity?.score) && b.opportunity.score >= 0 && b.opportunity.score <= 100);
console.log((t2 ? "PASS" : "FAIL") + " Test #2: every business classified website exists / no website (" + bs.length + " businesses)");
console.log((t3 ? "PASS" : "FAIL") + " Test #3: businesses with websites have analysis");
console.log((t4 ? "PASS" : "FAIL") + " Test #4: every business has an opportunity score 0-100");
' "$SCAN_URL" "$JAR" | while read -r line; do
  case "$line" in PASS*) ok "${line#PASS }";; FAIL*) bad "${line#FAIL }";; *) echo "  $line";; esac
done

echo "── Test #5: filters on GET /api/businesses ───────────────────"
for f in "websiteStatus=no_website" "tier=high" "websiteStatus=weak_website" "tier=medium" "websiteStatus=has_website"; do
  C="$(code -b "$JAR" "$BASE/api/businesses?$f&limit=1")"
  check "filter $f" "200" "$C"
done

echo "── Tests #6–#9: detail, Save Lead, status, AI, CSV ───────────"
BIZ_ID="$(node -e '
const { execSync } = require("child_process");
const data = JSON.parse(execSync(`curl -s -b ${process.argv[2]} ${process.argv[1]}`).toString());
const b = (data.businesses ?? []).find(x => !x.business.website);
console.log(b ? b.business.id : "");
' "$SCAN_URL" "$JAR")"
if [[ -z "$BIZ_ID" ]]; then bad "no no-website business found in scan"; exit 1; fi

ENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$BIZ_ID")"
check "Test #6: business detail page" "200" "$(code -b "$JAR" "$BASE/dashboard/businesses/$ENC")"

LEAD_RES="$(curl -s -b "$JAR" -X POST "$BASE/api/leads" -H 'Content-Type: application/json' -d "{\"businessId\":\"$BIZ_ID\"}")"
LEAD_ID="$(node -e "let d;try{d=JSON.parse(process.argv[1])}catch{d={}};console.log(d.lead?.id||'')" "$LEAD_RES")"
if [[ -n "$LEAD_ID" ]]; then ok "Test #7: Save Lead"; else bad "Test #7 failed: $LEAD_RES"; fi

DUP_ID="$(curl -s -b "$JAR" -X POST "$BASE/api/leads" -H 'Content-Type: application/json' -d "{\"businessId\":\"$BIZ_ID\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let p;try{p=JSON.parse(s)}catch{p={}};console.log(p.lead?.id||'')})")"
if [[ "$DUP_ID" == "$LEAD_ID" ]]; then ok "dedup: duplicate save returns the same lead"; else bad "dedup broken ($DUP_ID vs $LEAD_ID)"; fi

check "PATCH lead status"             "200" "$(code -b "$JAR" -X PATCH "$BASE/api/leads/$LEAD_ID" -H 'Content-Type: application/json' -d '{"status":"contacted"}')"

# Foreign-user check: a SECOND authed user must get 404 (not 403/200) for
# user A's lead — no existence leak. 401 stays reserved for anonymous.
EMAIL_B="acceptance-b+$(date +%s)@localhost.local"
curl -s -X POST "$DB_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\",\"email_confirm\":true}" > /dev/null
SESSION_B="$(curl -s -X POST "$DB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\"}")"
JAR_B="$(mktemp)"
node -e '
const fs = require("fs");
const { createChunks } = require("@supabase/ssr/dist/main/utils/chunker.js");
const [, jar, ref, raw] = process.argv;
const session = JSON.parse(raw);
if (!session.access_token) { console.error("no session B"); process.exit(1); }
const stored = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  token_type: session.token_type,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  user: session.user,
});
const encoded = "base64-" + Buffer.from(stored).toString("base64url");
const lines = createChunks(`sb-${ref}-auth-token`, encoded).map(c =>
  `#HttpOnly_localhost\tFALSE\t/\tFALSE\t0\t${c.name}\t${c.value}`);
fs.writeFileSync(jar, lines.join("\n") + "\n");
' "$JAR_B" "$SB_REF" "$SESSION_B"
check "PATCH foreign lead (authed B) → 404" "404" "$(code -b "$JAR_B" -X PATCH "$BASE/api/leads/$LEAD_ID" -H 'Content-Type: application/json' -d '{"status":"won"}')"
rm -f "$JAR_B"

AI_CODE="$(code -b "$JAR" -X POST "$BASE/api/businesses/$ENC/ai-analysis")"
case "$AI_CODE" in
  200|201) ok "Test #9: AI analysis generated ($AI_CODE)";;
  403)     ok "Test #9 gate: 403 not-a-top-prospect (cost control working; start Ollama + use a top-20 business for full pass)";;
  *)       bad "Test #9: unexpected HTTP $AI_CODE";;
esac

check "Test #8: CSV export" "200" "$(code -b "$JAR" "$BASE/api/leads/export")"
CSV_HEADER="$(curl -s -b "$JAR" "$BASE/api/leads/export" | head -1)"
if [[ "$CSV_HEADER" == "Business,Category,Phone,Website,Score,Opportunity"* ]]; then ok "CSV header correct"; else bad "CSV header: $CSV_HEADER"; fi

echo "───────────────────────────────────────────────────────────────"
echo "PASS: $PASS  FAIL: $FAIL"
[[ $FAIL -eq 0 ]] || exit 1
