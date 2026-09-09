# 🏗️ ARCHITECTURE — AI Business Opportunity Scanner

> **Doc suite:** [PRD](./PRD.md) · [Architecture](./ARCHITECTURE.md) · [Plan](./PLAN.md) · [Agent rules](./AGENTS.md) · [Full spec](./ai-business-opportunity-scanner-mvp.md)

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (App Router, TypeScript, `src/`) | Pages + API routes in one app |
| UI | **Tailwind CSS + shadcn/ui** | Fast to build, consistent components |
| Database | **Supabase** (Postgres) | Free tier; also provides Auth |
| Auth | **Supabase Auth** | Email login, RLS for multi-user safety |
| Business data | **OpenStreetMap / Overpass API** | $0; Google Places later via same interface |
| Website analysis | **Custom Node.js fetch + HTML parsing** | No external dependency for V1 |
| AI | **Ollama (dev) → OpenAI-compatible API (prod)** | Behind an `AIProvider` interface |
| Validation | **zod** | API request/response validation |
| Testing | **Vitest** | Unit + integration; HTML/OSM fixtures |
| Hosting | Localhost (dev) → Vercel/similar later | |

**Cost target: ₱0** for the entire development phase.

## 2. High-level data flow

```
 USER (Search form)
   │  location + category + radius + opportunity types
   ▼
 POST /api/scans ──────────────► scans (Supabase)
   │
   ▼
 SCAN PIPELINE (server)
   │
   ├─ 1. BusinessProvider.search()        ← OpenStreetMapProvider (Overpass)
   │       raw OSM data
   ▼
   ├─ 2. Normalize → Business[]           ← normalized to our data model
   ▼
   ├─ 3. Website check (per business)     ← fetch: status, https, redirect, timing
   ▼
   ├─ 4. Website analyzer (if site)       ← HTML: viewport, meta, contacts, booking/ordering keywords
   ▼
   ├─ 5. Opportunity scoring (rules)      ← deterministic, no AI
   ▼
   └─ 6. Persist businesses + analyses ──► businesses / business_analysis
   │
   ▼
 RESULTS DASHBOARD (filters, sort, cards)
   │
   ▼ top prospects only
 AIProvider.analyzeBusiness()             ← Ollama / OpenAI
   │
   ▼
 Save Lead ──► leads ──► My Leads dashboard ──► CSV export
```

## 3. Component breakdown

### 3.1 App routes (`src/app/`)

| Route | Purpose |
|---|---|
| `/` | Search screen (location, category, radius, opportunity types) |
| `/dashboard` | Overview: recent scans + lead totals |
| `/dashboard/scans` | Scan results list (filters + sort) |
| `/dashboard/businesses/[id]` | Business detail + website analysis + AI analysis |
| `/dashboard/leads` | My Leads (statuses, notes) |
| `/api/scans` (POST) | Create scan, run pipeline |
| `/api/scans/[id]` (GET) | Scan metadata + summary counts |
| `/api/businesses` (GET) | Filter by score/category/website status |
| `/api/businesses/[id]/analyze` (POST) | Run website analysis for one business |
| `/api/businesses/[id]/ai-analysis` (POST) | AI analysis for top prospects |
| `/api/leads` (POST) · `/api/leads/[id]` (PATCH) | Save / update lead |
| `/api/leads/export` (GET) | CSV export |

### 3.2 Library modules (`src/lib/`)

```
lib/
├── supabase/            # client + server clients, helpers
├── business-providers/
│   ├── types.ts         # BusinessProvider interface, SearchParams
│   ├── osm.ts           # OpenStreetMapProvider (Overpass)
│   ├── google.ts        # (future) GooglePlacesProvider
│   └── index.ts         # factory: BUSINESS_PROVIDER env → provider
├── website-analyzer/
│   ├── analyzer.ts      # HTTP check: status, https, redirect, responseTime
│   ├── features.ts      # HTML checks: viewport, meta, contacts, keywords
│   └── index.ts         # combine into WebsiteAnalysis
├── scoring/
│   └── opportunity-score.ts   # deterministic rules → 0–100 + tier + issues
└── ai/
    ├── types.ts         # AIProvider interface, Analysis type
    ├── ollama.ts        # local dev provider
    ├── openai.ts        # production provider
    └── index.ts         # factory: AI_PROVIDER env → provider
```

### 3.3 Shared types (`src/types/`)

`business.ts` · `scan.ts` · `lead.ts` · `analysis.ts`

## 4. Key interfaces (the two swap points)

```ts
// lib/business-providers/types.ts
interface BusinessProvider {
  search(params: SearchParams): Promise<Business[]>;
  getDetails(id: string): Promise<Business>;
}

// lib/ai/types.ts
interface AIProvider {
  analyzeBusiness(data: BusinessData): Promise<Analysis>;
}
```

Swapping vendors = changing `BUSINESS_PROVIDER=osm|google` / `AI_PROVIDER=ollama|openai`. **No application code changes.**

## 5. Data model (Supabase)

```
profiles            scans                businesses
├─ id               ├─ id                ├─ id
├─ email            ├─ user_id           ├─ name, category, address
├─ name             ├─ location          ├─ latitude, longitude
└─ created_at       ├─ latitude          ├─ phone, website
                    ├─ longitude         ├─ source, source_id (unique together)
                    ├─ radius            └─ created_at, updated_at
                    ├─ category
                    └─ created_at

business_analysis                        leads
├─ id                                    ├─ id
├─ business_id                           ├─ user_id
├─ website_exists, website_status        ├─ business_id
├─ https, mobile_friendly                ├─ status        (New|Contacted|Interested|
├─ booking_available, ordering_available │                 Proposal|Won|Lost)
├─ contact_form                          ├─ notes
├─ opportunity_score, opportunity_tier   ├─ created_at
├─ analysis   (AI output)                └─ updated_at
└─ created_at
```

- `businesses` upserted on re-scan via `(source, source_id)` unique constraint
- `business_analysis` is 1:N with `businesses` (history of analyses; latest wins in UI)
- Row Level Security: users see only their scans/leads; `businesses`/`business_analysis` are shared read

## 6. Normalized core types

```ts
interface Business {
  id: string;
  name: string;
  category?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  source: string;      // "osm" | "google"
  sourceId: string;
}

interface WebsiteAnalysis {
  websiteExists: boolean;
  statusCode?: number;
  https?: boolean;
  responseTimeMs?: number;
  mobileViewport?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  hasPhone / hasEmail / hasAddress: boolean;
  bookingAvailable / orderingAvailable / hasContactForm: boolean;
  checks: Array<{ id, label, status: 'pass'|'fail'|'warn' }>;
}

interface OpportunityResult {
  score: number;              // 0–100
  tier: 'high' | 'medium' | 'low';
  issues: string[];           // e.g. ["No website", "No online ordering"]
}
```

## 7. Scoring engine (deterministic — no AI)

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

Sum → normalize to **0–100** → tier (`high` / `medium` / `low`). The emitted `issues[]` drives UI badges and the AI prompt.

## 8. AI usage policy (cost control)

- **Never** call AI per-business during a scan (500 businesses ≠ 500 LLM calls)
- Pipeline: rule-based scoring → rank → **top 20** eligible for AI analysis
- AI is on-demand per business detail view + explicit top-prospects batch
- Dev: Ollama (local). Prod: cheapest suitable hosted model, behind the interface

## 9. Cross-cutting concerns

- **Validation:** zod schemas on every API route input
- **Error handling:** provider timeouts/empty results degrade gracefully (business still listed, analysis marked unavailable); unreachable websites count as "unavailable/broken", never crash the pipeline
- **Rate limiting:** Overpass-friendly query pacing + timeout handling in `osm.ts`
- **Security:** Supabase RLS, service-role key only in API routes, no scraping of vendors that disallow it
- **Testing:** pure logic (scoring, analyzer, normalization) is unit-tested with fixtures; API routes integration-tested with mocked providers

## 10. Deployment view (post-MVP path)

```
Localhost dev (₱0)
  → Vercel + Supabase free tier
  → [first paying customer] Google Places API + paid AI + custom domain
```
