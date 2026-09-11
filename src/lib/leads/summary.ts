/**
 * Lead display helpers (spec §15–§16) — pure, dependency-free: the
 * opportunity label shared by the My Leads page and the CSV export, plus
 * status totals for the dashboard.
 */

import { LEAD_STATUSES } from "@/types/lead";
import type { Lead, LeadStatus, LeadSummary } from "@/types/lead";
import type { OpportunityTier } from "@/types/analysis";

/**
 * "Opportunity" CSV column / lead badge label. Mirrors the pipeline's
 * weak-website predicate (spec §3 "Weak Website"): a site that is
 * unreachable, non-HTTPS, or not mobile-friendly. Flags accept the DB's
 * `boolean | null | undefined` shape — null/unknown means "not checked".
 */
export function opportunityLabel(args: {
  website: string | null | undefined;
  analysis:
    | {
        unavailable?: boolean | null;
        https?: boolean | null;
        mobileViewport?: boolean | null;
      }
    | null;
  tier: OpportunityTier | null;
}): string {
  if (!args.website) return "No Website";
  if (
    args.analysis &&
    (args.analysis.unavailable === true ||
      args.analysis.https === false ||
      args.analysis.mobileViewport === false)
  ) {
    return "Weak Website";
  }
  const tier = args.tier ?? "low";
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Opportunity`;
}

/** Totals by status for the My Leads dashboard (spec §16). */
export function summarizeLeads(leads: readonly Lead[]): LeadSummary {
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<
    LeadStatus,
    number
  >;
  for (const lead of leads) {
    byStatus[lead.status] += 1;
  }
  return { total: leads.length, byStatus };
}
