-- ═══════════════════════════════════════════════════════════════════
-- Migration 0002 — scan↔business linkage + analysis fidelity columns
-- (docs/PLAN.md Phase 5, persistence step)
--
-- 1. scan_businesses: join table so GET /api/scans/:id can reconstruct
--    exactly the businesses a scan produced (upserts keep old scans
--    stable as businesses are shared reference data).
-- 2. business_analysis extra columns: issues / response_time_ms /
--    unavailable — without these the stored row cannot reproduce the
--    opportunity score or the UI issue list faithfully.
-- 3. latest view + index: "current analysis per business" (latest row
--    wins in the UI, docs/ARCHITECTURE.md §5).
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. scan_businesses join table ─────────────────────────────────
-- Links a scan to the businesses it surfaced, with a snapshot of the
-- score at scan time (scores are re-derivable, but the snapshot makes
-- historical scans stable).
create table if not exists public.scan_businesses (
  scan_id           uuid not null references public.scans (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  analysis_id       uuid references public.business_analysis (id) on delete set null,
  score_at_scan     integer not null check (score_at_scan between 0 and 100),
  tier_at_scan      text not null check (tier_at_scan in ('high', 'medium', 'low')),
  primary key (scan_id, business_id)
);

create index if not exists idx_scan_businesses_scan
  on public.scan_businesses (scan_id, score_at_scan desc);

-- Shared read like businesses/business_analysis; writes are
-- service-role only (docs/AGENTS.md §2 rule 5, ARCHITECTURE §9).
alter table public.scan_businesses enable row level security;

drop policy if exists "scan_businesses_select_authed" on public.scan_businesses;
create policy "scan_businesses_select_authed" on public.scan_businesses
  for select using (auth.role() = 'authenticated');

-- ── 2. business_analysis fidelity columns ─────────────────────────
-- Score = f(flags, issues, response time). Store all inputs.
alter table public.business_analysis
  add column if not exists issues jsonb,
  add column if not exists response_time_ms integer,
  add column if not exists unavailable boolean;

-- ── 3. Latest analysis per business ───────────────────────────────
-- UI rule: latest row wins (ARCHITECTURE §5). Postgres lacks
-- DISTINCT ON in the PostgREST layer, so expose it as a view.
create or replace view public.latest_business_analysis as
select distinct on (ba.business_id)
  ba.id,
  ba.business_id,
  ba.website_exists,
  ba.website_status,
  ba.https,
  ba.mobile_friendly,
  ba.booking_available,
  ba.ordering_available,
  ba.contact_form,
  ba.opportunity_score,
  ba.opportunity_tier,
  ba.issues,
  ba.response_time_ms,
  ba.unavailable,
  ba.analysis,
  ba.created_at
from public.business_analysis ba
order by ba.business_id, ba.created_at desc, ba.id desc;

-- Views run with the owner's rights by default; the owner is the
-- service role in Supabase. Force RLS interpretation explicitly so the
-- shared-read rule from the base table applies.
alter view public.latest_business_analysis
  set (security_invoker = true);
