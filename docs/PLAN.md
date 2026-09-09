# 📋 AI Business Opportunity Scanner — MVP Implementation Plan

> **Doc suite:** [PRD](./PRD.md) · [Architecture](./ARCHITECTURE.md) · Plan · [Agent rules](./AGENTS.md) · [Full spec](./ai-business-opportunity-scanner-mvp.md)
>
> **Goal:** Find local businesses with weak/missing online presence, score the opportunity (0–100), and give freelancers a reason to contact them.
>
> **Stack ($0):** Next.js + TypeScript · Tailwind + shadcn/ui · Supabase (DB + Auth) · OSM/Overpass (business data) · Ollama → OpenAI (AI) · Vitest (tests)

---

## Progress tracker

| Phase | Description | Status |
|---|---|---|
| 0 | Project setup | ✅ Done (2026-09-09) |
| 1 | Data model & database | ✅ Done (2026-09-09) |
| 2 | Business data provider (OSM) | ✅ Done (2026-09-09) |
| 3 | Website detection & analyzer | ✅ Done (2026-09-09) |
| 4 | Opportunity scoring engine | ✅ Done (2026-09-10) |
| 5 | Scan pipeline & API | ✅ Done (2026-09-10) — DB persistence live |
| 6 | UI — Search screen | ✅ Done (2026-09-10) — incl. auth, pulled forward |
| 7 | UI — Results dashboard & detail page | ☐ Not started |
| 8 | Leads & CSV export | ☐ Not started |
| 9 | AI opportunity analysis (top prospects) | ☐ Not started |
| 10 | Testing & acceptance | ☐ Not started |

---

## Phase 0 — Project setup ✅

- [x] Scaffold Next.js app (TypeScript, App Router, `src/` directory) — Next 16, React 19
- [x] Install & configure Tailwind CSS + shadcn/ui (radix base, nova preset; button/input/label/select/checkbox/card/badge/tabs/table/textarea)
- [x] Set up ESLint + Prettier (`.prettierrc`, printWidth 100)
- [x] Set up Vitest for unit tests + `npm run test` / `npm run typecheck` scripts (node env, `@/` alias, `tests/`)
- [x] Create Supabase project (free tier) & add env vars (`.env.local`, `.env.example`) — ✅ connected & keys verified via `node --env-file=.env.local scripts/check-supabase.mjs`
- [x] Add `src/` folder structure per spec §21 (`app/`, `components/`, `lib/`, `types/`) — `lib/utils.ts` + `components/ui/` seeded
- [x] Init git repo, first commit, README with setup instructions

**Done when:** `npm run dev` serves a blank app; `npm run test` and `npm run typecheck` pass. ✅ Verified: typecheck ✓ · smoke test ✓ · production build ✓

---

## Phase 1 — Data model & database ✅

- [x] Define TypeScript types: `Business`, `ScanParams`, `WebsiteAnalysis`, `OpportunityScore`, `Lead` (`src/types/`) — incl. DB row types (`db.ts`) and constants with unit tests
- [x] Create Supabase schema (SQL migration) → `supabase/migrations/0001_init.sql`:
  - [x] `profiles` (id, email, name, created_at) + auto-create trigger on signup
  - [x] `scans` (id, user_id, location, latitude, longitude, radius, category, created_at)
  - [x] `businesses` (id, name, category, address, lat, lng, phone, website, source, source_id, created_at, updated_at)
  - [x] `business_analysis` (id, business_id, website_exists, website_status, https, mobile_friendly, booking_available, ordering_available, contact_form, opportunity_score, opportunity_tier, analysis, created_at)
  - [x] `leads` (id, user_id, business_id, status, notes, created_at, updated_at)
- [x] Add unique constraint on `businesses(source, source_id)` to avoid duplicates
- [x] Seed/dedup logic: DB-level dedup via unique constraint (+`leads(user_id, business_id)` unique); app-level upsert lands with the scan pipeline in Phase 5
- [x] Lead statuses enum: `New | Contacted | Interested | Proposal | Won | Lost` — Postgres enum `lead_status` + RLS policies on all 5 tables

**Done when:** Migration applies cleanly to Supabase; types match schema. ✅ Verified: migration applied via SQL Editor 2026-09-09; `scripts/check-schema.mjs` confirms all 5 tables, columns, and `lead_status` enum on the live project.

---

## Phase 2 — Business data provider (OSM) ✅

- [x] Define `BusinessProvider` interface: `search(params): Promise<Business[]>`, `getDetails(id): Promise<Business>` (spec §22) — `lib/business-providers/types.ts` + `ProviderError`
- [x] Implement `OpenStreetMapProvider` using Overpass API (`lib/business-providers/osm.ts`):
  - [x] Query by lat/lng + radius + category (nwr + around, per-tag union branches)
  - [x] Map OSM tags → normalized `Business` (name/address/phone/website incl. `contact:*` variants, way/relation `center` coords)
  - [x] Handle timeout / rate limiting / empty results gracefully — 30s timeout, one retry on 429/504, `[]` for empty, `ProviderError` otherwise; unnamed elements skipped; 20 fixtures-based tests
- [x] Provider factory via env var `BUSINESS_PROVIDER=osm` (swap to `google` later without app changes) — `lib/business-providers/index.ts`
- [x] Map the 10 V1 categories → OSM tag filters — `CATEGORY_OSM_TAGS` in `types/business.ts`
- [x] Gotcha fixed: Overpass rejects requests without a `User-Agent` (HTTP 406) → UA now sent, `OVERPASS_USER_AGENT` env for contact info

**Done when:** A manual test query for "Davao City · Restaurants · 10km" returns normalized businesses. ✅ Verified live (`RUN_LIVE_TESTS=1`): **1,705 businesses** returned — 37 with website, 106 with phone.

---

## Phase 3 — Website detection & analyzer ✅

- [x] Website check (`lib/website-analyzer/analyzer.ts`):
  - [x] HTTP request: status code, HTTPS, redirects (follow), response time (10s default timeout, slow threshold 5s)
  - [x] Result shape: `{ websiteExists, statusCode, https, responseTimeMs, unavailable, html }`
  - [x] Handle unreachable sites (no crash → "unavailable/broken") — timeouts/connection failures return a result, never throw
- [x] HTML analysis (`lib/website-analyzer/features.ts`) — pure string functions:
  - [x] Content: title, meta description, phone (PH patterns + tel:), email, address hints
  - [x] Mobile: viewport meta tag with device-width
  - [x] Functionality keywords: booking/appointment/reservation · order/cart/checkout/foodpanda/grabfood · contact form (form tags + form providers)
- [x] Output structured `WebsiteAnalysis` with per-check pass/fail/warn (`index.ts` — 8 checks incl. reachability fallback for error pages/non-HTML)
- [x] Fixtures: modern-site.html (all pass) + weak-site.html (fails correctly) → 13 unit tests

**Done when:** Given a list of real URLs, the analyzer returns correct pass/fail checks. ✅ Verified live (`RUN_LIVE_TESTS=1`): jollibee.com.ph → 200/HTTPS/252ms with full checks; dead domain → graceful `unavailable` result.

---

## Phase 4 — Opportunity scoring engine ✅

- [x] Implement deterministic rule-based scoring (`lib/scoring/opportunity-score.ts`) — **no AI here** (spec §9):

  | Condition | Points |
  |---|---|
  | No website | +40 |
  | Website unavailable/broken | +30 |
  | No mobile viewport | +15 |
  | No booking | +15 |
  | No online ordering | +15 |
  | No contact form | +5 |
  | Missing metadata | +5 |
  | Slow website | +10 |
  | Active business (phone/address on file) | +10 |

- [x] Normalize final score to **0–100**
- [x] Map score → tier: 🔥 HIGH (≥ 70) / 🟡 MEDIUM (≥ 40) / 🟢 LOW
- [x] Emit the issue list (e.g. `["No website", "No online ordering"]`) used by UI + AI later

  Implementation notes: no website → +40 baseline with implied no-booking/no-ordering (+15 each, spec §10 Business A); website-quality checks (viewport/metadata/contact form/slow) are **skipped** when there's no site to check; `unavailable` sites short-circuit to +30 only. The "Active business +10" line from spec §10's worked example (40+15+15+10 = 80) is missing from the §9 rule table — implemented as a bonus when the provider record has a phone or address, recorded in ARCHITECTURE.md §7.

**Done when:** Scoring matches the two worked examples in spec §10 (Business A ≈ 80, Business B ≈ 12). ✅ Verified: Business A → 80 🔥 exactly; Business B → 10 🟢 (the spec's ≈12 has no rule-table source); 20 unit tests in `tests/opportunity-score.test.ts`.

---

## Phase 5 — Scan pipeline & API 🔶

- [x] Wire the pipeline: **Search → Normalize → Website check → Analyze → Score → Results** — `lib/scanning/pipeline.ts` (provider + analyzer injectable; 8-way analysis concurrency; one failing site never crashes a scan)
- [x] `POST /api/scans` — accepts `{ location, latitude, longitude, radius, category }` (zod-validated), runs the pipeline, returns `{ scanId, summary, elapsedMs }` (201)
- [x] `GET /api/scans/:id` — scan metadata + summary + scored businesses (404 when unknown)
- [x] `GET /api/businesses` — filters: `minScore`/`maxScore`, `category`, `tier`, `websiteStatus` (`no_website`/`weak_website`/`has_website`), `location` substring, `limit`/`offset` — over the most recent scan
- [x] `POST /api/businesses/:id/analyze` — run/re-run website analysis for one business, rescore, recompute summary
- [x] Persist businesses + analyses (upsert on re-scan) — initially deferred (2026-09-10), then implemented the same day (user approved installing `@supabase/supabase-js` v2.116):

  - **Migration `0002_scan_linkage.sql`** (user-approved schema change): `scan_businesses` join table (PK `scan_id, business_id`, score/tier snapshot, `analysis_id` FK) so `GET /api/scans/:id` reconstructs exactly what a scan produced; `business_analysis` + `issues` / `response_time_ms` / `unavailable` columns (score inputs must be stored to reproduce scores); `latest_business_analysis` view (`distinct on`, `security_invoker`) for "latest row wins".
  - **Dev-user ownership** (user decision): scans owned by `DEV_USER_ID` until Phase 6 auth — seed via `node --env-file=.env.local scripts/seed-dev-user.mjs` (service-role, idempotent).
  - **`lib/supabase/`**: `server.ts` (cached service-role client, server-only) · `mappers.ts` (pure row↔domain mappers, 7 unit tests) · `persist.ts` (`persistScan`: scan insert → businesses upsert on `(source, source_id)` → analysis history insert → chunked join rows; `getScanById` join query; `queryBusinesses` on the view; `insertAnalysis`).
  - **Routes rewired to DB**: `POST /api/scans` (503 when persistence unconfigured, fail-fast before the ~30s pipeline) · `GET /api/scans/:id` · `GET /api/businesses` (score/tier filters in PostgREST; weak-website predicate in-process) · `POST /api/businesses/:id/analyze` (inserts a new history row). In-memory store retained for tests only.

  ⚠️ Apply migration 0002 via SQL Editor before running scans (see checklist item in Phase 10 notes). ✅ **Applied & verified live 2026-09-10**: scan → `GET /api/scans/:id` reconstructs all 1,705 businesses with snapshot scores/issues from the join rows; re-scan dedup (businesses stable at 1,705, `business_analysis` history 1,705 → 3,410); filters exact (tier=low 24, tier=medium 6, has_website 37, no_website 1,668, weak_website 10, minScore=80 → 607); re-analyze appends history (3 → 4 rows) and the view serves the latest.

  Live-verified fixes from that run: PostgREST default 1,000-row cap → paginated `getScanById`; snake_case PostgREST payloads (typed `AnalysisRowSnake` mapper — the camelCase `db.ts` row types are app-side views, not wire format); score/tier/website filters pushed into PostgREST (weak-website via `or()` with `is.true`/`is.false`); analysis inserts batched (200/chunk with per-row fallback); analyze route accepts DB UUID **or** URL-encoded provider id.
- [x] Error handling & basic request validation (zod) — invalid JSON/body/query → 400; `ProviderError` → 502; unexpected → 500

**Done when:** An API call with Davao City/Restaurants/10km returns scored businesses end-to-end (acceptance Tests #1–#4). 🔶 Pipeline verified via 10 integration tests with mocked provider/analyzer (incl. scoring/sort/summary, concurrency cap, failure isolation, empty scan). ✅ **Verified live 2026-09-10** via curl against `next dev`: Davao/Restaurants/10km → 1,705 businesses scored in ~31s (acceptance Tests #1–#4); filters (`no_website` 1,668, `tier=high` 1,675), re-analyze, and error paths (400/404) all correct.

  ⚠️ Gotcha for the Phase 6 UI: business ids contain `:` and `/` (e.g. `osm:node/1802759779`) — `encodeURIComponent(id)` is **required** when building `/api/businesses/:id/analyze` URLs, or Next.js serves its HTML 404 for the split path.

---

## Phase 6 — UI — Search screen ✅

- [x] Search form (spec §3): Location, Category dropdown (10 V1 categories), Radius dropdown, Opportunity Type checkboxes — `dashboard/page.tsx` + `dashboard/scan-form.tsx` (presets for 5 PH cities per spec §4 "no map in V1"; first 3 opportunity types pre-checked; types ride to the results URL for Phase 7 filters)
- [x] "[ 🔍 Scan Businesses ]" button → triggers `POST /api/scans`, shows loading state — disabled + "Scanning businesses…" copy (~30s expectation set)
- [x] Basic auth via Supabase email login — **implemented now** (user decision: "auth first, per plan"), pulled forward from this checklist into the API work:
  - `@supabase/ssr` v0.12.7 cookie sessions; `lib/supabase/clients.ts` (browser/server/proxy clients + `getSessionUser`)
  - **Next 16 change:** `middleware` → `proxy` (`src/proxy.ts`, Node runtime) — refreshes the auth cookie on every request; page routes redirect to `/login?next=…` when unauthenticated
  - `/login` with sign-in + create-account (server actions, zod-validated, `useActionState` pending/error states); `/auth/confirm` exchanges the email-confirmation code; `signout` server action in the dashboard header
  - `POST /api/scans` → **401** without a session; scans owned by the session user (verified live: scan row `user_id` = authenticated user id); `dashboard/layout.tsx` + scan page enforce ownership (RLS mirrors it)
  - Dev-user workaround retired for API routes (`getDevUserId` no longer used for scan ownership; seeding script kept for local testing)
- [x] Redirect to results view when the scan completes — `router.push(/dashboard/scans/{id})` → minimal results page (summary cards + top 10 prospects; full dashboard is Phase 7)

**Done when:** A user can submit the form and land on results. ✅ Verified: typecheck/lint/77 tests/build ✓; live: unauthenticated `/dashboard` → 307 `/login?next=…`, unauthenticated `POST /api/scans` → 401, login page renders, authenticated scan persists under the session user. ⚠️ curl note: the Supabase session cookie is chunked (`sb-*-auth-token.0/.1`, ≤3180 bytes/chunk) — a raw access token in a single cookie is not a session; test through the real login flow.

---

## Phase 7 — UI — Results dashboard & business detail

- [ ] Results dashboard (spec §13):
  - [ ] Header: `Davao City · Restaurants · 10 km` + counts (247 found / 43 opportunities)
  - [ ] Filter tabs: `All | High | Medium | No Website`
  - [ ] Sort by Opportunity Score
  - [ ] Business cards: score badge, location, issues (❌/⚠️), `[View Analysis]` `[Save Lead]`
- [ ] Business detail page (spec §14):
  - [ ] Score `92/100` + tier banner
  - [ ] Business info (category, location, phone, website, source)
  - [ ] Problems list, Recommended services, AI Analysis section
- [ ] Empty / loading / error states for all views

**Done when:** Acceptance Tests #5–#6 pass (filter + detail view).

---

## Phase 8 — Leads & CSV export

- [ ] `POST /api/leads` — Save Lead (business → `leads` with status `New`)
- [ ] `PATCH /api/leads/:id` — update status/notes
- [ ] My Leads dashboard (spec §16): totals by status (`New / Contacted / Interested / Proposal / Won / Lost`)
- [ ] `GET /api/leads/export` — CSV export (`Business, Category, Phone, Website, Score, Opportunity`)
- [ ] Dedup: saving the same business twice doesn't create duplicate leads

**Done when:** Acceptance Tests #7–#8 pass (Save Lead + CSV export).

---

## Phase 9 — AI opportunity analysis (top prospects only)

- [ ] Define `AIProvider` interface (`analyzeBusiness(data): Promise<Analysis>`) — spec §23
- [ ] Implement `OllamaProvider` (local, dev) + stub `OpenAIProvider` for later; selected via env var
- [ ] **Cost control:** AI runs only for the **top 20** scored prospects — never per-business during scan (spec §11)
- [ ] `POST /api/businesses/:id/ai-analysis` — generate "Why this is a good prospect", potential services, sales angle (spec §12)
- [ ] Store generated analysis in `business_analysis.analysis`
- [ ] Optional V1.5: "Generate Outreach" email draft with `[Copy Message]` (no auto-sending)

**Done when:** Acceptance Test #9 passes (top leads get AI-generated explanation).

---

## Phase 10 — Testing & acceptance

### Testing strategy

- [ ] **Unit tests (Vitest)** — pure logic, mocked I/O:
  - [ ] Scoring: every rule, edge cases (no website → website checks skipped), 0–100 normalization, tier mapping, spec §10 examples
  - [ ] Website analyzer: parse HTML fixtures (with/without viewport, booking keywords, contact info); unreachable-site handling
  - [ ] Normalization: OSM payload → `Business`
  - [ ] CSV export: header + row formatting
- [ ] **Integration tests (API routes):**
  - [ ] `POST /api/scans` with mocked provider/analyzer → persisted businesses + scores
  - [ ] Save lead, update lead, duplicate-save rejection
  - [ ] Filters & sorting on `GET /api/businesses`
- [ ] **Fixtures:** sample Overpass JSON responses + sample HTML pages under `tests/fixtures/`
- [ ] **E2E smoke (manual or Playwright, minimal):** search → scan → results → detail → save lead → export CSV

### MVP acceptance criteria (spec §26)

- [ ] **Test #1** — Input Davao City / Restaurants / 10km → system returns businesses found
- [ ] **Test #2** — Each business gets `Website exists` or `No website`
- [ ] **Test #3** — Businesses with websites get a website analysis
- [ ] **Test #4** — Every business receives an Opportunity Score 0–100
- [ ] **Test #5** — User can filter: No Website / High Opportunity / Weak Website
- [ ] **Test #6** — User can open Business → Detailed Analysis
- [ ] **Test #7** — User can Save Lead
- [ ] **Test #8** — User can Export CSV
- [ ] **Test #9** — Top leads receive an AI-generated sales explanation

**Done when:** All 9 acceptance tests pass + `npm run test` and `npm run typecheck` are green.

---

## 🚫 Out of scope (do NOT build in MVP)

Email automation · SMS · Full CRM · Stripe · Team accounts · Advanced analytics · Mobile app · Browser extension · AI chatbot · Automated cold outreach · Complex maps · Enterprise permissions (spec §27)

## 🛣️ After first paying customer

Google Places API → Paid AI API → Custom domain → Better hosting → More data (reviews, SEO, PageSpeed) → Real prospecting platform (spec §28)

## ⚠️ Guardrails

- **Never scrape Google Maps HTML** — use proper APIs/providers with terms that allow the intended use (spec §25)
- Keep providers interchangeable: `BUSINESS_PROVIDER` and `AI_PROVIDER` env vars
- Don't call AI per-business during scans — rule-based scoring first, AI for top 20 only
- 🧹 **Cleanup before production:** delete `src/app/api/debug/osm/route.ts` and `src/app/api/debug/analyze/route.ts` (temporary spot-check routes, Phases 2–3)
