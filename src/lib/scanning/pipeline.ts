/**
 * Scan pipeline (docs/PLAN.md Phase 5) — Search → Normalize → Website check →
 * Analyze → Score → Results. Deterministic and provider-agnostic: both the
 * business provider and the website analyzer are injectable so API routes and
 * tests can swap them (docs/AGENTS.md §2 rule 4). No AI here (rule 3).
 */

import type { Business } from "@/types/business";
import type { ScanParams, ScanSummary } from "@/types/scan";
import type { ScoredBusiness, WebsiteAnalysis } from "@/types/analysis";
import type { BusinessProvider } from "@/lib/business-providers/types";
import { getBusinessProvider } from "@/lib/business-providers";
import { analyzeWebsite } from "@/lib/website-analyzer";
import { scoreOpportunity } from "@/lib/scoring/opportunity-score";

/** Parallel website analyses during a scan. Sites are different hosts, so a small concurrent batch is polite (Overpass is the rate-limited one). */
export const DEFAULT_ANALYZE_CONCURRENCY = 8;

export interface ScanRequest extends ScanParams {
  /** Human-readable location label, e.g. "Davao City" (spec §3 search form). */
  location: string;
}

export interface RunScanOptions {
  provider?: BusinessProvider;
  analyze?: typeof analyzeWebsite;
  /** Max parallel website analyses. */
  concurrency?: number;
}

export interface ScanRunResult {
  params: ScanRequest;
  /** Sorted by opportunity score, highest first. */
  businesses: ScoredBusiness[];
  summary: ScanSummary;
}

/** Minimal analysis used when the analyzer itself throws (never crash a scan — AGENTS §2 rule 7). */
export function unavailableAnalysis(): WebsiteAnalysis {
  return {
    websiteExists: true,
    unavailable: true,
    checks: [
      { id: "reachability", label: "Site unreachable", status: "fail" },
    ],
  };
}

/** `fn` over `items` with at most `limit` promises in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/** A business has no site when the provider record has none. */
export function hasNoWebsite(scored: ScoredBusiness): boolean {
  return (
    !scored.business.website ||
    scored.analysis === null ||
    scored.analysis.websiteExists === false
  );
}

/**
 * "Weak website" = a site that exists but shows red flags: unreachable,
 * no HTTPS, or not mobile-friendly (spec §3 "Weak Website" opportunity type).
 */
export function hasWeakWebsite(scored: ScoredBusiness): boolean {
  if (!scored.business.website || !scored.analysis) return false;
  const a = scored.analysis;
  return a.unavailable === true || a.https === false || a.mobileViewport === false;
}

/** Dashboard counts (spec §13): "43 opportunities" = medium + high tier. */
export function summarize(businesses: readonly ScoredBusiness[]): ScanSummary {
  const summary: ScanSummary = {
    businessesFound: businesses.length,
    opportunities: 0,
    high: 0,
    medium: 0,
    low: 0,
    noWebsite: 0,
    weakWebsite: 0,
  };
  for (const scored of businesses) {
    summary[scored.opportunity.tier] += 1;
    if (hasNoWebsite(scored)) summary.noWebsite += 1;
    if (hasWeakWebsite(scored)) summary.weakWebsite += 1;
  }
  summary.opportunities = summary.high + summary.medium;
  return summary;
}

/**
 * Run a full scan. Provider failures propagate as `ProviderError` (routes map
 * them to 502); individual website-analysis failures degrade to an
 * `unavailable` analysis instead of failing the scan.
 */
export async function runScan(
  params: ScanRequest,
  options: RunScanOptions = {}
): Promise<ScanRunResult> {
  const provider = options.provider ?? getBusinessProvider();
  const analyze = options.analyze ?? analyzeWebsite;
  const concurrency = options.concurrency ?? DEFAULT_ANALYZE_CONCURRENCY;

  const found = await provider.search({
    latitude: params.latitude,
    longitude: params.longitude,
    radius: params.radius,
    category: params.category,
  });

  const withWebsite = found.filter((b): b is Business & { website: string } =>
    Boolean(b.website)
  );

  const analyses = await mapWithConcurrency(
    withWebsite,
    concurrency,
    async (business): Promise<WebsiteAnalysis> => {
      try {
        return await analyze(business.website, { timeoutMs: 10_000 });
      } catch {
        // analyzeWebsite never throws by contract; belt-and-braces for
        // swapped implementations — one bad site must not kill a scan.
        return unavailableAnalysis();
      }
    }
  );

  const analysisBySourceId = new Map<string, WebsiteAnalysis>();
  withWebsite.forEach((business, i) => {
    analysisBySourceId.set(business.sourceId, analyses[i]);
  });

  const businesses: ScoredBusiness[] = found.map((business) => {
    const analysis = business.website
      ? (analysisBySourceId.get(business.sourceId) ?? unavailableAnalysis())
      : null;
    const opportunity = scoreOpportunity({ business, analysis });
    return { business, analysis, opportunity };
  });

  businesses.sort((a, b) => b.opportunity.score - a.opportunity.score);

  return { params, businesses, summary: summarize(businesses) };
}
