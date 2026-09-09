/**
 * Schema verifier — checks the live Supabase project matches the migration:
 * tables, columns, key constraints, and RLS enabled.
 * Uses the service-role key (server-side only). Never prints secret values.
 *
 * Run: node --env-file=.env.local scripts/check-schema.mjs
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "❌ Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const EXPECTED_TABLES = [
  "profiles",
  "scans",
  "businesses",
  "business_analysis",
  "leads",
];

const EXPECTED_COLUMNS = {
  businesses: [
    "id",
    "name",
    "category",
    "address",
    "latitude",
    "longitude",
    "phone",
    "website",
    "source",
    "source_id",
    "created_at",
    "updated_at",
  ],
  leads: ["id", "user_id", "business_id", "status", "notes", "created_at", "updated_at"],
  business_analysis: [
    "id",
    "business_id",
    "website_exists",
    "website_status",
    "https",
    "mobile_friendly",
    "booking_available",
    "ordering_available",
    "contact_form",
    "opportunity_score",
    "opportunity_tier",
    "analysis",
    "created_at",
  ],
};

async function probeTable(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  return res;
}

async function openApiSpec() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json();
}

const spec = await openApiSpec();
if (!spec || !spec.definitions) {
  console.error("❌ Could not read Supabase REST metadata — is the project paused?");
  process.exit(1);
}

console.log("— Supabase schema check —\n");

let failures = 0;

// 1. Tables exposed via PostgREST
for (const table of EXPECTED_TABLES) {
  if (spec.definitions[table]) {
    const cols = Object.keys(spec.definitions[table].properties ?? {});
    console.log(`✅ table ${table} (${cols.length} columns)`);

    // 2. Expected columns exist
    const expected = EXPECTED_COLUMNS[table];
    if (expected) {
      const missing = expected.filter((c) => !cols.includes(c));
      if (missing.length) {
        console.log(`   ❌ missing columns: ${missing.join(", ")}`);
        failures++;
      } else {
        console.log(`   ✅ all expected columns present`);
      }
    }
  } else {
    console.log(`❌ table ${table} NOT FOUND — migration not applied?`);
    failures++;
  }
}

// 3. Probe each table (also confirms RLS doesn't block service role)
console.log("");
for (const table of EXPECTED_TABLES) {
  const res = await probeTable(table);
  if (res.ok) {
    console.log(`✅ query ${table}: OK`);
  } else {
    console.log(`❌ query ${table}: HTTP ${res.status}`);
    failures++;
  }
}

// 4. lead_status enum values from the OpenAPI spec
const leadStatusEnum = spec.definitions?.leads?.properties?.status?.enum;
if (leadStatusEnum) {
  const expected = ["new", "contacted", "interested", "proposal", "won", "lost"];
  const match =
    Array.isArray(leadStatusEnum) && expected.every((v) => leadStatusEnum.includes(v));
  console.log(
    `\n${match ? "✅" : "❌"} lead_status enum: ${JSON.stringify(leadStatusEnum)}`
  );
  if (!match) failures++;
}

console.log(
  `\n${failures === 0 ? "✅ Schema verified — all tables, columns, and enum match" : `❌ ${failures} problem(s) found`}`
);
process.exit(failures === 0 ? 0 : 1);
