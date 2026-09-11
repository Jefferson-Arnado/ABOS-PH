/**
 * Pure row ↔ domain mappers between the snake_case DB schema
 * (supabase/migrations/0001_init.sql + 0002_scan_linkage.sql) and the
 * camelCase app types. Kept dependency-free so they unit-test trivially
 * (docs/AGENTS.md §5) and stay in sync with db.ts row types.
 */

import type { Business, BusinessSource } from "@/types/business";
import type {
  AiAnalysis,
  OpportunityTier,
  RecommendedService,
  WebsiteAnalysis,
} from "@/types/analysis";
import type { BusinessRow } from "@/types/db";

// ── AI analysis JSONB (spec §12) ──────────────────────────────────

const SERVICE_PRIORITIES: RecommendedService["priority"][] = [
  "high",
  "medium",
  "low",
];

/**
 * Validate a `business_analysis.analysis` JSONB payload into an
 * AiAnalysis. Returns null for null/anything malformed — the UI simply
 * hides the AI section, and one bad row never breaks a page.
 */
export function aiAnalysisFromJson(raw: unknown): AiAnalysis | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.whyGoodProspect !== "string" ||
    !obj.whyGoodProspect.trim() ||
    typeof obj.salesAngle !== "string" ||
    !obj.salesAngle.trim()
  ) {
    return null;
  }
  const services: RecommendedService[] = Array.isArray(obj.recommendedServices)
    ? obj.recommendedServices.flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const rec = s as Record<string, unknown>;
        if (typeof rec.name !== "string" || !rec.name.trim()) return [];
        const priority = SERVICE_PRIORITIES.includes(
          rec.priority as RecommendedService["priority"]
        )
          ? (rec.priority as RecommendedService["priority"])
          : "medium";
        return [{ name: rec.name.trim(), priority }];
      })
    : [];
  return {
    whyGoodProspect: obj.whyGoodProspect.trim(),
    recommendedServices: services,
    salesAngle: obj.salesAngle.trim(),
  };
}

// ── Business ────────────────────────────────────────────────────────

export interface BusinessInsert {
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  source: string;
  source_id: string;
}

export function businessToInsert(business: Business): BusinessInsert {
  return {
    name: business.name,
    category: business.category ?? null,
    address: business.address ?? null,
    latitude: business.latitude ?? null,
    longitude: business.longitude ?? null,
    phone: business.phone ?? null,
    website: business.website ?? null,
    source: business.source,
    source_id: business.sourceId,
  };
}

export function rowToBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? undefined,
    address: row.address ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    source: row.source as BusinessSource,
    sourceId: row.sourceId,
  };
}

// ── WebsiteAnalysis ↔ business_analysis row ─────────────────────────

export interface AnalysisInsert {
  business_id: string;
  website_exists: boolean;
  website_status: number | null;
  https: boolean | null;
  mobile_friendly: boolean | null;
  booking_available: boolean | null;
  ordering_available: boolean | null;
  contact_form: boolean | null;
  opportunity_score: number;
  opportunity_tier: OpportunityTier;
  issues: string[] | null;
  response_time_ms: number | null;
  unavailable: boolean | null;
}

/** Flatten a scored analysis into a `business_analysis` insert. */
export function analysisToInsert(
  businessId: string,
  analysis: WebsiteAnalysis | null,
  score: number,
  tier: OpportunityTier,
  issues: string[]
): AnalysisInsert {
  return {
    business_id: businessId,
    website_exists: analysis ? analysis.websiteExists : false,
    website_status: analysis?.statusCode ?? null,
    https: analysis?.https ?? null,
    mobile_friendly: analysis?.mobileViewport ?? null,
    booking_available: analysis?.bookingAvailable ?? null,
    ordering_available: analysis?.orderingAvailable ?? null,
    contact_form: analysis?.hasContactForm ?? null,
    opportunity_score: score,
    opportunity_tier: tier,
    issues: issues.length > 0 ? issues : null,
    response_time_ms: analysis?.responseTimeMs ?? null,
    unavailable: analysis ? (analysis.unavailable ?? false) : null,
  };
}

/**
 * Rebuild a `WebsiteAnalysis` from a persisted row (round-trip). The
 * per-check `checks[]` list is UI-derived, so it is reconstructed from
 * the stored flags — labels match the analyzer's output.
 *
 * Accepts the raw PostgREST payload shape: snake_case columns (the
 * camelCase `BusinessAnalysisRow` is the logical app-side view; the DB
 * returns `website_exists`, `mobile_friendly`, …).
 */
export interface AnalysisRowSnake {
  website_exists: boolean;
  website_status: number | null;
  https: boolean | null;
  mobile_friendly: boolean | null;
  booking_available: boolean | null;
  ordering_available: boolean | null;
  contact_form: boolean | null;
  issues: string[] | null;
  response_time_ms: number | null;
  unavailable: boolean | null;
}

export function analysisRowToWebsiteAnalysis(
  row: Partial<AnalysisRowSnake>
): WebsiteAnalysis {
  const checks: WebsiteAnalysis["checks"] = [];
  if (row.unavailable) {
    checks.push({
      id: "reachability",
      label: "Site unreachable",
      status: "fail",
    });
  } else {
    if (row.https === false) {
      checks.push({ id: "https", label: "HTTPS", status: "fail" });
    }
    if (row.mobile_friendly === false) {
      checks.push({
        id: "mobile_viewport",
        label: "Mobile viewport",
        status: "fail",
      });
    }
  }

  return {
    websiteExists: row.website_exists ?? false,
    statusCode: row.website_status ?? undefined,
    https: row.https ?? undefined,
    responseTimeMs: row.response_time_ms ?? undefined,
    mobileViewport: row.mobile_friendly ?? undefined,
    bookingAvailable: row.booking_available ?? undefined,
    orderingAvailable: row.ordering_available ?? undefined,
    hasContactForm: row.contact_form ?? undefined,
    unavailable: row.unavailable ?? undefined,
    checks,
  };
}
