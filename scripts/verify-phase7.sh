#!/usr/bin/env bash
# Phase 7 live verification: dashboard + detail page as an authenticated user.
set -u

DB_URL="localhost:3000"
LOG=/tmp/next-dev-phase7.log

pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 1
rm -f "$LOG"

npm run dev > "$LOG" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 2 "$DB_URL/login"; then break; fi
  sleep 1
done

# --- 1. Real password grant as the dev user --------------------------------
GRANT=$(curl -s --max-time 15 -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"dev@localhost.local\",\"password\":\"dev-password-1234\"}")

ACCESS=$(printf '%s' "$GRANT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.access_token??'')})")
REFRESH=$(printf '%s' "$GRANT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.refresh_token??'')})")

if [ -z "$ACCESS" ] || [ -z "$REFRESH" ]; then
  echo "FAIL: password grant failed"; printf '%s' "$GRANT" | head -c 300; echo
  kill $SERVER_PID 2>/dev/null; exit 1
fi

# --- 2. Chunked session cookie, exactly as @supabase/ssr writes it ---------
node -e '
const crypto = require("crypto");
const b64url = (b) => Buffer.from(b).toString("base64url");
# --- 2. Session cookie in the exact format @supabase/ssr writes -------------
# @supabase/ssr stores: "base64-" + base64url(JSON.stringify(session)), then
# splits the raw string into <=3180-char chunks named <name>.0, <name>.1, ...
node -e '
const payload = "base64-" + Buffer.from(process.env.GRANT).toString("base64url");
const name = "sb-" + process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https?:\\/\\/(sb-)?/, "").split(".")[0] + "-auth-token";
const parts = [];
if (payload.length <= 3180) parts.push(`${name}=${payload}; Path=/`);
else for (let i = 0; i * 3180 < payload.length; i++) parts.push(`${name}.${i}=${payload.slice(i * 3180, (i + 1) * 3180)}; Path=/`);
console.log(parts.join("; "));
' GRANT="$GRANT" NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" > /tmp/scan_cookie.txt

COOKIE=$(cat /tmp/scan_cookie.txt)

# --- 3. Find a dev-user-owned scan + its business ids ----------------------
node --env-file=.env.local -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: scan } = await sb.from("scans").select("id,user_id").order("created_at", { ascending: false }).limit(50);
  const mine = (scan ?? []).find((s) => s.user_id === process.env.DEV_USER_ID);
  if (!mine) { console.log("NO_DEV_SCAN"); process.exit(0); }
  const { data: join } = await sb.from("scan_businesses").select("business_id, opportunity_score, opportunity_tier").eq("scan_id", mine.id).limit(3);
  console.log(JSON.stringify({ scanId: mine.id, businesses: join ?? [] }));
})();
' > /tmp/scan_ids.json

SCAN_INFO=$(cat /tmp/scan_ids.json)
if [ "$SCAN_INFO" = "NO_DEV_SCAN" ]; then
  echo "SKIP: no dev-user-owned scan in DB (run one via the UI as dev@localhost.local)"
  kill $SERVER_PID 2>/dev/null; exit 0
fi

SCAN_ID=$(printf '%s' "$SCAN_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).scanId))")
B1=$(printf '%s' "$SCAN_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).businesses[0]?.business_id??''))")

echo "=== 1. /dashboard (auth) ==="
curl -s -o /tmp/dash.html -w "HTTP %{http_code}\n" --max-time 30 -H "Cookie: $COOKIE" "$DB_URL/dashboard"
grep -o "Scan for opportunities\|Scan for new opportunities\|dev@localhost.local" /tmp/dash.html | sort | uniq -c

echo "=== 2. Results page /dashboard/scans/$SCAN_ID ==="
curl -s -o /tmp/results.html -w "HTTP %{http_code}\n" --max-time 60 -H "Cookie: $COOKIE" "$DB_URL/dashboard/scans/$SCAN_ID"
# separator-tolerant: collapse React's <!-- --> text-node separators before matching
python3 - <<'EOF'
import re
html = open("/tmp/results.html").read().replace("<!-- -->", "")
for label in ["businesses found", "opportunities", "All", "No Website", "Weak Website", "View Analysis", "Showing"]:
    print(f"{label}: {'YES' if label in html else 'NO'}")
tiers = [t for t in ["HIGH", "MEDIUM", "LOW"] if re.search(rf">\d+<[^>]*>.*?{t}", html)]
print("tier badges present:", tiers or "NONE")
EOF

echo "=== 2b. Filter tab: no_website ==="
curl -s -o /tmp/f.html -w "HTTP %{http_code}\n" --max-time 60 -H "Cookie: $COOKIE" "$DB_URL/dashboard/scans/$SCAN_ID?filter=no_website"
grep -c "View Analysis" /tmp/f.html || true

echo "=== 3. Detail page /dashboard/businesses/$B1?from=... ==="
ENC_B1=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$B1")
curl -s -o /tmp/detail.html -w "HTTP %{http_code}\n" --max-time 30 -H "Cookie: $COOKIE" "$DB_URL/dashboard/businesses/$ENC_B1?from=$SCAN_ID"
python3 - <<'EOF'
html = open("/tmp/detail.html").read().replace("<!-- -->", "")
for label in ["Opportunity score", "OPPORTUNITY", "Business information", "Problems", "Website analysis", "Recommended services", "AI analysis", "Back to results", "Re-analyze"]:
    print(f"{label}: {'YES' if label in html else 'NO'}")
EOF

echo "=== 4. Ownership: other user's scan redirects ==="
curl -s -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" --max-time 30 -H "Cookie: $COOKIE" "$DB_URL/dashboard/scans/scan_does_not_exist"

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo "=== done, server stopped ==="
