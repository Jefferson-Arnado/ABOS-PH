# 🤖 AGENTS.md — AI Coding Agent Rules

> **Doc suite:** [PRD](./PRD.md) · [Architecture](./ARCHITECTURE.md) · [Plan](./PLAN.md) · **Agent rules** · [Full spec](./ai-business-opportunity-scanner-mvp.md)

Instructions for AI coding agents (Claude Code, Cursor, Codebuff, etc.) working in this repo.

---

## 1. Project context (read first)

- **What:** AI Business Opportunity Scanner MVP — find local businesses with weak/missing online presence, score them 0–100, surface top prospects for freelance web devs.
- **Read these before coding:** `PRD.md` (what/why), `ARCHITECTURE.md` (how), `PLAN.md` (current phase + checklist).
- **Current phase of record:** check the progress tracker in `PLAN.md` — keep it updated as you complete phases.

## 2. Non-negotiable rules

1. **Stay in MVP scope.** Do NOT build: email automation, SMS, CRM features, Stripe, team accounts, analytics, browser extension, automated outreach. See PRD §4.
2. **Never scrape Google Maps HTML.** Business data comes from the provider interface (OSM/Overpass in V1; official APIs only afterward).
3. **Never call AI per-business during a scan.** Rule-based scoring for all; AI only for top ~20 prospects on demand. This is a hard cost constraint.
4. **Providers must stay swappable.** All business data goes through `BusinessProvider`; all AI goes through `AIProvider`. No vendor SDK calls outside those modules. Switching = env var only.
5. **Secrets stay out of code.** Env vars via `.env.local` (never commit); `.env.example` documents keys. Never print secret values in logs, commits, or docs.
6. **TypeScript strict mode.** No `any` unless justified in a comment; no unchecked casts at provider/DB boundaries — validate with zod instead.
7. **Don't break the pipeline.** One business's website being unreachable must never fail the whole scan — catch, mark "unavailable/broken", continue.

## 3. Commands

```bash
npm run dev          # start dev server (localhost)
npm run build        # production build
npm run typecheck    # tsc --noEmit — must pass before finishing any task
npm run test         # vitest run — must pass before finishing any task
npm run lint         # eslint
npx supabase db push # apply migrations (requires Supabase env)
```

**Definition of done for any code change:** `npm run typecheck` ✅ + `npm run test` ✅ + relevant new logic covered by a test.

## 4. Code style & conventions

- Next.js **App Router** with `src/` directory — follow the structure in ARCHITECTURE §3
- **Functional style:** plain functions + modules; avoid classes except where an interface demands a provider object
- **Named exports** for lib modules; default exports only for pages/layouts
- Formatting: Prettier defaults (2-space, single quotes, semicolons); ESLint clean — no suppressed rules without a comment explaining why
- **Server/client split:** data fetching, providers, scoring, AI = server-only; mark client components explicitly with `"use client"`
- No business logic in React components or API route handlers — extract to `lib/` and unit-test it there
- DB access via small helpers in `lib/supabase/`; no ad-hoc supabase calls sprinkled through components
- Commit style: short imperative subject, scope in brackets when useful — e.g. `feat(scoring): normalize score to 0–100`

## 5. Testing rules

- Framework: **Vitest**. Tests live in `tests/` (or co-located `*.test.ts`), fixtures in `tests/fixtures/`
- Pure logic (scoring, analyzer, normalization, CSV) must have unit tests with fixtures:
  - OSM/Overpass sample JSON → normalized `Business[]`
  - Sample HTML pages (with/without viewport, booking keywords, contact info) → `WebsiteAnalysis`
  - Scoring table incl. spec §10 worked examples and edge cases (no website → skip website checks)
- API routes: integration tests with mocked providers (no real network in tests)
- Bug fixes: add a failing test first, then fix
- Never point tests at the real Supabase project or real external APIs

## 6. Workflow expectations

- Work **phase by phase** per `PLAN.md`; tick checklist items as completed, and update the phase status table
- Small, focused changes; finish one checklist item group before starting the next
- When a decision contradicts the docs, **update the docs in the same change** (especially PRD §8 open questions → record resolution + date)
- Ask the user before: adding dependencies, changing the DB schema, touching auth, or any paid service
- If a phase's "Done when" criteria can't be met, stop and report why instead of working around it

## 7. Environment variables

| Var | Values | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | key | Client-side Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | key | Server-only DB operations |
| `BUSINESS_PROVIDER` | `osm` (default) \| `google` | Business data source |
| `AI_PROVIDER` | `ollama` (default) \| `openai` | AI analysis source |
| `OLLAMA_BASE_URL` | URL (default `http://localhost:11434`) | Ollama endpoint |
| `OPENAI_API_KEY` | key | Only if `AI_PROVIDER=openai` |
| `OVERPASS_URL` | URL (optional override) | Overpass API endpoint |
| `OVERPASS_USER_AGENT` | string | UA contact info per Overpass etiquette |

## 8. Known traps (learned the hard way, avoid anyway)

- Overpass **rejects requests without a `User-Agent`** (HTTP 406) — the OSM provider always sends one; include real contact info via `OVERPASS_USER_AGENT` in production

- Don't hardcode category names in the scoring/analyzer — pass them through config so new categories don't touch logic
- Don't store raw HTML in the DB — store extracted analysis results
- Don't compute scores in the UI — scores come from the pipeline and are persisted
- Don't let a re-scan create duplicate businesses — upsert on `(source, source_id)`
- Don't render AI output as raw markdown/HTML without sanitizing
