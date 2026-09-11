/**
 * Lead persistence (docs/PLAN.md Phase 8) — server-side helpers over the
 * service-role client, mirroring the lib/supabase/ pattern. The DB-level
 * `unique (user_id, business_id)` constraint dedupes Save Lead (spec §15);
 * the race window is resolved by re-fetching the existing row on conflict.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/types/lead";
import type { Lead, LeadStatus } from "@/types/lead";

interface LeadRowLike {
  id: string;
  user_id: string;
  business_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToLead(row: LeadRowLike): Lead {
  return {
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    status: row.status as LeadStatus,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LeadExistsError extends Error {
  readonly lead: Lead;
  constructor(lead: Lead) {
    super("Lead already exists for this business");
    this.name = "LeadExistsError";
    this.lead = lead;
  }
}

/**
 * Save Lead (spec §15): insert with status `new`. If the user already
 * saved this business, the existing lead is returned unchanged (dedup).
 */
export async function createLead(userId: string, businessId: string): Promise<Lead> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("leads")
    .insert({ user_id: userId, business_id: businessId, status: "new" })
    .select("id, user_id, business_id, status, notes, created_at, updated_at")
    .single();

  if (!error) return rowToLead(data as LeadRowLike);

  // Unique violation on (user_id, business_id) — the user already saved
  // this business. Return the existing row instead of failing.
  if (error.code === "23505") {
    const existing = await getLeadByBusiness(userId, businessId);
    if (existing) return existing;
  }
  throw new Error(`lead insert failed: ${error.message}`);
}

export async function getLeadByBusiness(
  userId: string,
  businessId: string
): Promise<Lead | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("leads")
    .select("id, user_id, business_id, status, notes, created_at, updated_at")
    .eq("user_id", userId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`lead lookup failed: ${error.message}`);
  return data ? rowToLead(data as LeadRowLike) : null;
}

export interface LeadUpdate {
  status?: LeadStatus;
  notes?: string | null;
}

/** PATCH /api/leads/:id body — update status and/or notes. */
export async function updateLead(
  userId: string,
  leadId: string,
  update: LeadUpdate
): Promise<Lead | null> {
  const db = getSupabaseAdmin();
  const patch: { status?: string; notes?: string | null } = {};
  if (update.status !== undefined) {
    if (!LEAD_STATUSES.includes(update.status)) {
      throw new Error(`invalid lead status: ${update.status}`);
    }
    patch.status = update.status;
  }
  if (update.notes !== undefined) patch.notes = update.notes;
  if (Object.keys(patch).length === 0) {
    return getLeadById(userId, leadId);
  }

  const { data, error } = await db
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .eq("user_id", userId) // owner-only (RLS mirrors this)
    .select("id, user_id, business_id, status, notes, created_at, updated_at")
    .maybeSingle();
  if (error) throw new Error(`lead update failed: ${error.message}`);
  return data ? rowToLead(data as LeadRowLike) : null;
}

export async function getLeadById(userId: string, leadId: string): Promise<Lead | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("leads")
    .select("id, user_id, business_id, status, notes, created_at, updated_at")
    .eq("id", leadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`lead lookup failed: ${error.message}`);
  return data ? rowToLead(data as LeadRowLike) : null;
}

/** Latest-analysis columns embedded through the businesses join. */
interface AnalysisEmbed {
  opportunity_score: number;
  opportunity_tier: "high" | "medium" | "low";
  issues: string[] | null;
  unavailable: boolean | null;
  https: boolean | null;
  mobile_friendly: boolean | null;
}

/** A lead with its joined business + latest analysis (list/detail views). */
export interface LeadWithBusiness {
  lead: Lead;
  business: {
    id: string;
    name: string;
    category: string | null;
    phone: string | null;
    website: string | null;
    source: string;
    sourceId: string;
  };
  score: number | null;
  tier: "high" | "medium" | "low" | null;
  issues: string[];
  /** Latest-analysis weak-website flags (null when never analyzed). */
  analysisFlags: {
    unavailable: boolean | null;
    https: boolean | null;
    mobileFriendly: boolean | null;
  };
}

/**
 * All leads for a user, newest first, with business + the latest analysis
 * score via the latest_business_analysis view.
 *
 * PostgREST embed note: the view has no FK from `leads`, so it must be
 * embedded through `businesses` (leads.business_id → businesses.id ←
 * latest_business_analysis.business_id). A top-level
 * `latest_business_analysis(...)` on leads fails with "Could not find a
 * relationship" (schema-cache error, verified live 2026-09-11).
 */
export async function listLeadsWithBusiness(userId: string): Promise<LeadWithBusiness[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("leads")
    .select(
      "id, user_id, business_id, status, notes, created_at, updated_at, businesses(*, latest_business_analysis(opportunity_score, opportunity_tier, issues, unavailable, https, mobile_friendly))"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`leads query failed: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<
    LeadRowLike & {
      businesses:
        | ({
            id: string;
            name: string;
            category: string | null;
            phone: string | null;
            website: string | null;
            source: string;
            source_id: string;
          } & {
            latest_business_analysis: AnalysisEmbed | AnalysisEmbed[] | null;
          })
        | null;
    }
  >;

  return rows.flatMap((row) => {
    if (!row.businesses) return []; // business row deleted → cascade removed the lead anyway
    // PostgREST treats a view embed as 1:M (no unique constraint on the
    // view's business_id), so the payload may be an object OR an array.
    const raw = row.businesses.latest_business_analysis;
    const analysis = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
    return [
      {
        lead: rowToLead(row),
        business: {
          id: row.businesses.id,
          name: row.businesses.name,
          category: row.businesses.category,
          phone: row.businesses.phone,
          website: row.businesses.website,
          source: row.businesses.source,
          sourceId: row.businesses.source_id,
        },
        score: analysis?.opportunity_score ?? null,
        tier: analysis?.opportunity_tier ?? null,
        issues: analysis?.issues ?? [],
        analysisFlags: {
          unavailable: analysis?.unavailable ?? null,
          https: analysis?.https ?? null,
          mobileFriendly: analysis?.mobile_friendly ?? null,
        },
      },
    ];
  });
}
