-- ═══════════════════════════════════════════════════════════════════
-- Migration 0001 — initial schema (docs/PLAN.md Phase 1)
-- Tables: profiles, scans, businesses, business_analysis, leads
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
-- (or `supabase db push` if you link the CLI later)
-- ═══════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ── Enums ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum
      ('new', 'contacted', 'interested', 'proposal', 'won', 'lost');
  end if;
end
$$;

-- ── profiles ──────────────────────────────────────────────────────
-- One row per auth user, created by the trigger below.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text,
  created_at timestamptz not null default now()
);

-- ── scans ─────────────────────────────────────────────────────────
create table if not exists public.scans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  location   text not null,
  latitude   double precision not null check (latitude between -90 and 90),
  longitude  double precision not null check (longitude between -180 and 180),
  radius     integer not null check (radius between 100 and 50000), -- meters, capped per PRD §8
  category   text not null,
  created_at timestamptz not null default now()
);

-- ── businesses ────────────────────────────────────────────────────
-- Shared reference data (not user-owned). Deduped on (source, source_id).
create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text,
  address    text,
  latitude   double precision,
  longitude  double precision,
  phone      text,
  website    text,
  source     text not null,
  source_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

-- ── business_analysis ─────────────────────────────────────────────
-- 1:N history; the UI uses the latest row per business.
create table if not exists public.business_analysis (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  website_exists    boolean not null,
  website_status    integer,           -- HTTP status; null if no site / no response
  https             boolean,
  mobile_friendly   boolean,
  booking_available boolean,
  ordering_available boolean,
  contact_form      boolean,
  opportunity_score integer not null check (opportunity_score between 0 and 100),
  opportunity_tier  text not null check (opportunity_tier in ('high', 'medium', 'low')),
  analysis          jsonb,             -- AI output (spec §12), added in Phase 9
  created_at        timestamptz not null default now()
);

-- ── leads ─────────────────────────────────────────────────────────
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status      public.lead_status not null default 'new',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A user saves a given business only once (spec: dedup on Save Lead).
  unique (user_id, business_id)
);

-- ── Indexes (query patterns from ARCHITECTURE §3.1) ───────────────
create index if not exists idx_scans_user           on public.scans (user_id, created_at desc);
create index if not exists idx_scans_category       on public.scans (category);
create index if not exists idx_businesses_source    on public.businesses (source, source_id);
create index if not exists idx_businesses_category  on public.businesses (category);
create index if not exists idx_biz_analysis_biz     on public.business_analysis (business_id, created_at desc);
create index if not exists idx_biz_analysis_score   on public.business_analysis (opportunity_score desc);
create index if not exists idx_leads_user_status    on public.leads (user_id, status);
create index if not exists idx_leads_user_created   on public.leads (user_id, created_at desc);

-- ── Triggers ──────────────────────────────────────────────────────
-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────
-- scans / leads: owner-only. businesses / business_analysis: readable by any
-- authenticated user (shared reference data); writes happen server-side via
-- the service-role key only. profiles: self-read/update (AGENTS §2 rule 5).

alter table public.profiles          enable row level security;
alter table public.scans             enable row level security;
alter table public.businesses        enable row level security;
alter table public.business_analysis enable row level security;
alter table public.leads             enable row level security;

-- profiles: users see & edit only their own
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- scans: owner-only, full CRUD
drop policy if exists "scans_select_own" on public.scans;
create policy "scans_select_own" on public.scans
  for select using (auth.uid() = user_id);

drop policy if exists "scans_insert_own" on public.scans;
create policy "scans_insert_own" on public.scans
  for insert with check (auth.uid() = user_id);

drop policy if exists "scans_delete_own" on public.scans;
create policy "scans_delete_own" on public.scans
  for delete using (auth.uid() = user_id);

-- businesses: shared read for authenticated users; no client-side writes
drop policy if exists "businesses_select_authed" on public.businesses;
create policy "businesses_select_authed" on public.businesses
  for select using (auth.role() = 'authenticated');

-- business_analysis: shared read for authenticated users; no client-side writes
drop policy if exists "biz_analysis_select_authed" on public.business_analysis;
create policy "biz_analysis_select_authed" on public.business_analysis
  for select using (auth.role() = 'authenticated');

-- leads: owner-only, full CRUD
drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own" on public.leads
  for select using (auth.uid() = user_id);

drop policy if exists "leads_insert_own" on public.leads;
create policy "leads_insert_own" on public.leads
  for insert with check (auth.uid() = user_id);

drop policy if exists "leads_update_own" on public.leads;
create policy "leads_update_own" on public.leads
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "leads_delete_own" on public.leads;
create policy "leads_delete_own" on public.leads
  for delete using (auth.uid() = user_id);
