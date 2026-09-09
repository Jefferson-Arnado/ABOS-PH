/**
 * DB persistence for the scan pipeline (docs/PLAN.md Phase 5) — the swap
 * point for lib/scanning/store.ts. Service-role only, server-side.
 *
 * Layout: scans + scan_businesses (join with score snapshot) +
 * businesses (upserted on (source, source_id)) + business_analysis
 * (1:N history; latest wins via the latest_business_analysis view).
 */

import type { Category } from "@/types/business";
import type { OpportunityTier, ScoredBusiness } from "@/types/analysis";
import type { ScanRecord, ScanSummary } from "@/types/scan";
import type { BusinessRow } from "@/types/db";
import { getSupabaseAdmin } from "./server";
import {
  analysisRowToWebsiteAnalysis,
  analysisToInsert,
  businessToInsert,
  rowToBusiness,
  type AnalysisRowSnake,
} from "./mappers";

/** Scan + its scored businesses, as persisted/read from the DB. */
export interface PersistedScan {
  record: ScanRecord;
  businesses: ScoredBusiness[];
  summary: ScanSummary;
}

/**
 * Persist one completed scan. Businesses are upserted on
 * (source, source_id); analyses append history; the join rows snapshot
 * the score at scan time. One failing analysis insert must not kill the
 * scan (AGENTS §2 rule 7) — join rows fall back to analysis_id = null.
 */
export async function persistScan(
  params: {
    location: string;
    latitude: number;
    longitude: number;
    radius: number;
    category: Category;
  },
  userId: string,
  businesses: ScoredBusiness[]
): Promise<ScanRecord> {
  const db = getSupabaseAdmin();

  // 1. Scan row (id comes back from the default gen_random_uuid()).
  const { data: scanRow, error: scanErr } = await db
    .from("scans")
    .insert({
      user_id: userId,
      location: params.location,
      latitude: params.latitude,
      longitude: params.longitude,
      radius: params.radius,
      category: params.category,
    })
    .select("id, user_id, location, latitude, longitude, radius, category, created_at")
    .single();
  if (scanErr) throw new Error(`scan insert failed: ${scanErr.message}`);

  const record: ScanRecord = {
    id: scanRow.id,
    userId: scanRow.user_id,
    location: scanRow.location,
    latitude: scanRow.latitude,
    longitude: scanRow.longitude,
    radius: scanRow.radius,
    category: scanRow.category as Category,
    createdAt: scanRow.created_at,
  };

  // 2. Businesses upsert (dedup on the unique (source, source_id) pair).
  //    Re-scan: same rows, no duplicates (AGENTS §8).
  const upserts = businesses.map((s) => businessToInsert(s.business));
  const { data: bizRows, error: bizErr } = await db
    .from("businesses")
    .upsert(upserts, { onConflict: "source,source_id" })
    .select("id, source, source_id");
  if (bizErr) throw new Error(`businesses upsert failed: ${bizErr.message}`);

  const dbIdBySourceId = new Map<string, string>();
  for (const row of (bizRows ?? []) as Array<{
    id: string;
    source: string;
    source_id: string;
  }>) {
    dbIdBySourceId.set(row.source_id, row.id);
  }

  // 3. Analyses (history, batched) + join rows (score snapshot) — degrade per business.
  const analysisInserts: ReturnType<typeof analysisToInsert>[] = [];
  const analysisIdByBusinessId = new Map<string, string>();
  const scoredByBusinessId = new Map<string, ScoredBusiness>();
  const joinRows: Array<{
    scan_id: string;
    business_id: string;
    analysis_id: string | null;
    score_at_scan: number;
    tier_at_scan: OpportunityTier;
  }> = [];

  for (const scored of businesses) {
    const businessId = dbIdBySourceId.get(scored.business.sourceId);
    if (!businessId) continue; // upsert select missed it; skip rather than fail

    const insert = analysisToInsert(
      businessId,
      scored.analysis,
      scored.opportunity.score,
      scored.opportunity.tier,
      scored.opportunity.issues
    );
    analysisInserts.push(insert);
    scoredByBusinessId.set(businessId, scored);
  }

  // Batched analysis inserts (1,700 round trips would take minutes).
  // A chunk that fails entirely (e.g. a check constraint) falls back to
  // per-row inserts so one bad business can't lose the whole chunk
  // (AGENTS §2 rule 7).
  const ANALYSIS_CHUNK = 200;
  for (let i = 0; i < analysisInserts.length; i += ANALYSIS_CHUNK) {
    const chunk = analysisInserts.slice(i, i + ANALYSIS_CHUNK);
    const { data, error } = await db
      .from("business_analysis")
      .insert(chunk)
      .select("id, business_id");

    if (error) {
      for (const insert of chunk) {
        const { data: one, error: oneErr } = await db
          .from("business_analysis")
          .insert(insert)
          .select("id, business_id")
          .single();
        if (oneErr) continue; // keep the scan↔business link with null analysis
        analysisIdByBusinessId.set(one.business_id, one.id);
      }
      continue;
    }

    for (const row of (data ?? []) as Array<{ id: string; business_id: string }>) {
      analysisIdByBusinessId.set(row.business_id, row.id);
    }
  }

  for (const [businessId, scored] of scoredByBusinessId) {
    joinRows.push({
      scan_id: record.id,
      business_id: businessId,
      analysis_id: analysisIdByBusinessId.get(businessId) ?? null,
      score_at_scan: scored.opportunity.score,
      tier_at_scan: scored.opportunity.tier,
    });
  }

  // Chunked insert — scan_businesses rows can exceed the URL/row limits.
  const CHUNK = 500;
  for (let i = 0; i < joinRows.length; i += CHUNK) {
    const { error } = await db
      .from("scan_businesses")
      .insert(joinRows.slice(i, i + CHUNK));
    if (error) throw new Error(`scan_businesses insert failed: ${error.message}`);
  }

  return record;
}

/** Scan + joined businesses with their analysis rows (join query). */
export async function getScanById(id: string): Promise<PersistedScan | null> {
  const db = getSupabaseAdmin();

  const { data: scan, error } = await db
    .from("scans")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !scan) return null;

  interface JoinRow {
    score_at_scan: number;
    tier_at_scan: OpportunityTier;
    businesses: {
      id: string;
      name: string;
      category: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      phone: string | null;
      website: string | null;
      source: string;
      source_id: string;
    };
    business_analysis: AnalysisRowSnake | null;
  }

  // PostgREST caps responses at 1,000 rows by default — paginate.
  const PAGE = 1_000;
  const joins: JoinRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error: joinErr } = await db
      .from("scan_businesses")
      .select(
        "score_at_scan, tier_at_scan, businesses!inner(*), business_analysis(*)"
      )
      .eq("scan_id", id)
      .order("score_at_scan", { ascending: false })
      .range(from, from + PAGE - 1);
    if (joinErr) throw new Error(`scan_businesses query failed: ${joinErr.message}`);
    const rows = (data ?? []) as unknown as JoinRow[];
    joins.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const businesses: ScoredBusiness[] = [];
  let high = 0;
  let medium = 0;
  let low = 0;
  let noWebsite = 0;
  let weakWebsite = 0;

  for (const join of joins) {
    const business = join.businesses
      ? rowToBusiness({
          ...join.businesses,
          source: join.businesses.source as BusinessRow["source"],
          sourceId: join.businesses.source_id,
          createdAt: "",
          updatedAt: "",
        })
      : null;
    if (!business) continue;
    const analysisRow = join.business_analysis;
    const analysis = analysisRow
      ? analysisRowToWebsiteAnalysis(analysisRow)
      : null;
    const issues = (analysisRow?.issues as string[] | null) ?? [];
    const opportunity = {
      score: join.score_at_scan,
      tier: join.tier_at_scan,
      issues,
    };
    businesses.push({ business, analysis, opportunity });

    if (opportunity.tier === "high") high += 1;
    else if (opportunity.tier === "medium") medium += 1;
    else low += 1;
    if (!business.website || !analysis) noWebsite += 1;
    if (
      business.website &&
      analysis &&
      (analysis.unavailable === true || analysis.https === false || analysis.mobileViewport === false)
    ) {
      weakWebsite += 1;
    }
  }

  const summary: ScanSummary = {
    businessesFound: businesses.length,
    opportunities: high + medium,
    high,
    medium,
    low,
    noWebsite,
    weakWebsite,
  };

  return {
    record: {
      id: scan.id,
      userId: scan.user_id,
      location: scan.location,
      latitude: scan.latitude,
      longitude: scan.longitude,
      radius: scan.radius,
      category: scan.category as Category,
      createdAt: scan.created_at,
    },
    businesses,
    summary,
  };
}

export interface BusinessQueryFilters {
  minScore?: number;
  maxScore?: number;
  tier?: OpportunityTier;
  websiteStatus?: "no_website" | "weak_website" | "has_website";
  limit: number;
  offset: number;
}

/**
 * Query businesses joined with their latest analysis (latest row wins,
 * ARCHITECTURE §5). The view is the primary resource; businesses embeds
 * through its business_id column. All score/tier/website filters are
 * direct PostgREST filters so pagination + totals stay exact; only the
 * composite weak-website predicate (3-flag OR with nulls) runs
 * in-process over the fetched page.
 */
export async function queryBusinesses(
  filters: BusinessQueryFilters
): Promise<{ total: number; businesses: ScoredBusiness[] }> {
  const db = getSupabaseAdmin();

  let query = db
    .from("latest_business_analysis")
    .select("*, businesses!inner(*)", { count: "exact" })
    .order("opportunity_score", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  if (filters.minScore !== undefined) {
    query = query.gte("opportunity_score", filters.minScore);
  }
  if (filters.maxScore !== undefined) {
    query = query.lte("opportunity_score", filters.maxScore);
  }
  if (filters.tier) {
    query = query.eq("opportunity_tier", filters.tier);
  }
  if (filters.websiteStatus === "no_website") {
    query = query.is("businesses.website", null);
  } else if (filters.websiteStatus === "has_website") {
    query = query.not("businesses.website", "is", null);
  } else if (filters.websiteStatus === "weak_website") {
    // Composite predicate pushed into PostgREST: has a site AND
    // (unreachable OR no HTTPS OR no mobile viewport).
    query = query
      .not("businesses.website", "is", null)
      .or(
        [
          "unavailable.is.true",
          "https.is.false",
          "mobile_friendly.is.false",
        ].join(",")
      );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`businesses query failed: ${error.message}`);

  const out: ScoredBusiness[] = [];
  for (const row of (data ?? []) as unknown as Array<
    AnalysisRowSnake & {
      opportunity_score: number;
      opportunity_tier: OpportunityTier;
      businesses: {
        id: string;
        name: string;
        category: string | null;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        phone: string | null;
        website: string | null;
        source: string;
        source_id: string;
      };
    }
  >) {
    const business = rowToBusiness({
      ...row.businesses,
      source: row.businesses.source as BusinessRow["source"],
      sourceId: row.businesses.source_id,
      createdAt: "",
      updatedAt: "",
    });
    const analysis = analysisRowToWebsiteAnalysis(row);
    const opportunity = {
      score: row.opportunity_score,
      tier: row.opportunity_tier,
      issues: row.issues ?? [],
    };

    out.push({ business, analysis, opportunity });
  }

  return { total: count ?? out.length, businesses: out };
}

/** Re-analysis upsert path: insert a new analysis row for one business. */
export async function insertAnalysis(
  businessId: string,
  scored: ScoredBusiness
): Promise<ScoredBusiness> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("business_analysis")
    .insert(
      analysisToInsert(
        businessId,
        scored.analysis,
        scored.opportunity.score,
        scored.opportunity.tier,
        scored.opportunity.issues
      )
    )
    .select("*")
    .single();
  if (error) throw new Error(`analysis insert failed: ${error.message}`);

  const row = data as AnalysisRowSnake & {
    opportunity_score: number;
    opportunity_tier: OpportunityTier;
  };
  return {
    business: scored.business,
    analysis: analysisRowToWebsiteAnalysis(row),
    opportunity: {
      score: row.opportunity_score,
      tier: row.opportunity_tier,
      issues: row.issues ?? [],
    },
  };
}

/** Look up a business's DB id by provider id (e.g. "node/123"). */
export async function getBusinessIdBySourceId(
  sourceId: string
): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("businesses")
    .select("id")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error) throw new Error(`business lookup failed: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}
