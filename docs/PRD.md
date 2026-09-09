# 📄 PRD — AI Business Opportunity Scanner (MVP)

> **Doc suite:** [PRD](./PRD.md) · [Architecture](./ARCHITECTURE.md) · [Plan](./PLAN.md) · [Agent rules](./AGENTS.md) · [Full spec](./ai-business-opportunity-scanner-mvp.md)

---

## 1. Summary

A web app that scans a location for local businesses (e.g. "Restaurants within 10 km of Davao City"), detects weak or missing online presence, scores each business 0–100, and shows freelancers the best prospects to pitch web services to — with AI-generated explanations for the top leads.

## 2. Problem statement

Freelance web designers/developers waste hours manually hunting for businesses that need a website or a better one:

- Checking Google Maps / Facebook page by page is slow and unscalable
- There's no way to know which businesses are *most likely to buy*
- Prospecting lists sold online are stale and untargeted

**"I need clients, but finding businesses that actually need a website takes forever."** — target user

## 3. Target users

**V1 (only):** Freelance web developers / designers who sell websites, booking systems, and online ordering to local businesses.

Explicitly **not** targeting yet: agencies, sales teams, enterprise, non-web freelancers.

### Example user journey

1. Freelancer enters **Davao City · Restaurants · 10 km**, checks "No Website" + "Weak Website"
2. Scans → 247 businesses found, 43 opportunities
3. Opens the top prospect (score 92): no website, no online ordering, phone number available
4. Reads the AI analysis ("why this business", recommended services, sales angle)
5. Saves it as a lead and exports CSV to work their own outreach

## 4. Scope

### ✅ In scope (V1)

| Area | What we build |
|---|---|
| Scan | Location (lat/lng/radius) + category (10 types) + opportunity-type checkboxes |
| Data | OpenStreetMap / Overpass as the business data provider (provider abstraction ready for Google Places) |
| Analysis | Website existence check + homepage analysis (HTTPS, mobile viewport, metadata, contact info, booking/ordering/contact-form keywords) |
| Scoring | Deterministic rules → 0–100 opportunity score with HIGH/MEDIUM/LOW tiers |
| AI | Analysis for **top 20 prospects only** (why-this-business, recommended services, sales angle) |
| Leads | Save lead, 6 statuses (New → Lost), basic counts dashboard |
| Export | CSV of leads/prospects |

### ❌ Out of scope (V1)

Email automation · SMS · Full CRM · Stripe/payments · Team accounts · Advanced analytics · Mobile app · Browser extension · AI chatbot · Automated cold outreach · 50+ integrations · Complex maps · Enterprise permissions · Google Maps scraping (use official APIs only)

## 5. Key features & requirements

### F1 — Search screen
- Inputs: location (city text + lat/lng + radius), category, radius, opportunity types (No Website / Weak Website / No Online Booking / Poor Online Presence)
- "Scan Businesses" action with loading state

### F2 — Scan pipeline
- `Search → Normalize → Website check → Analyze → Score → Results`
- Each business gets: website existence, website analysis (if site exists), opportunity score 0–100, issue list

### F3 — Results dashboard
- Summary counts, filter tabs (All / High / Medium / No Website), sort by score
- Business cards with score badge, location, issues

### F4 — Business detail
- Score + tier, business info, problems, recommended services, AI analysis section

### F5 — Leads
- Save lead (deduped), status pipeline, My Leads dashboard with totals by status

### F6 — CSV export
- Columns: `Business, Category, Phone, Website, Score, Opportunity`

### F7 — AI opportunity analysis
- Triggered per-business on demand, **only for top prospects** (cost control — never per-business during a scan)
- Output: why-this-business narrative, potential services ranked, sales angle

## 6. Key success criteria

### MVP acceptance tests (from spec §26)

| # | Criterion |
|---|---|
| 1 | Davao City / Restaurants / 10km → businesses found |
| 2 | Every business classified: website exists / no website |
| 3 | Businesses with websites get a website analysis |
| 4 | Every business receives opportunity score 0–100 |
| 5 | User can filter: No Website / High Opportunity / Weak Website |
| 6 | User can open business → detailed analysis |
| 7 | User can save a lead |
| 8 | User can export CSV |
| 9 | Top leads receive AI-generated sales explanation |

### Quality gates

- `npm run test` (Vitest) and `npm run typecheck` pass
- Scoring engine verified against worked examples (no website + no booking + no ordering + active ≈ 80; complete site ≈ 12)
- Provider swap via env var only (`BUSINESS_PROVIDER`, `AI_PROVIDER`) — no app code changes

### Product success signals (post-launch)

- A freelancer completes their first full scan→lead flow unaided
- Exported CSV is used for real outreach (qualitative feedback)
- Scan completes for a 10km radius in a reasonable time without provider failures

## 7. Constraints & principles

- **$0 build cost:** OSM/Overpass, Supabase free tier, Ollama/local AI during development
- **AI cost control:** rule-based scoring first; AI only for top ~20 prospects
- **Provider independence:** never hard-depend on one data or AI vendor
- **No scraping:** use providers whose terms allow the intended use
- **Privacy:** collect only business-level public data; no personal data beyond the user's own account

## 8. Open questions

- [ ] Auth: Supabase email magic link sufficient for V1? (assumed yes)
- [ ] Scan runtime: synchronous request vs background job for large radii? (start sync, cap radius)
- [ ] AI analysis storage: regenerate on demand vs cache in `business_analysis.analysis`? (assumed cache)

> Resolved decisions should be recorded here with date + rationale.
