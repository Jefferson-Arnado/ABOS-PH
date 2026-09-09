/**
 * Recommended services from the issue list (spec §14) — pure config-driven
 * logic so new issues/services don't touch UI code (docs/AGENTS.md §8).
 * Names are plain text; the UI pairs them with lucide icons.
 */

import type { OpportunityTier, RecommendedService } from "@/types/analysis";
import { ISSUE_LABELS } from "@/lib/scoring/opportunity-score";

interface ServiceRule {
  /** Service display name (spec §14 wording). */
  name: string;
  /** Which issue triggers the recommendation. */
  issue: string;
  /** Priority from the tier of the score that produced the issue (spec §14). */
  highPriority: OpportunityTier[];
  lowPriority: OpportunityTier[];
}

const RULES: ServiceRule[] = [
  {
    name: "Business website",
    issue: ISSUE_LABELS.noWebsite,
    highPriority: ["high", "medium"],
    lowPriority: ["low"],
  },
  {
    name: "Online ordering",
    issue: ISSUE_LABELS.noOrdering,
    highPriority: ["high", "medium"],
    lowPriority: ["low"],
  },
  {
    name: "Reservation / booking system",
    issue: ISSUE_LABELS.noBooking,
    highPriority: ["high", "medium"],
    lowPriority: ["low"],
  },
  {
    name: "Mobile-friendly redesign",
    issue: ISSUE_LABELS.noMobileViewport,
    highPriority: ["high"],
    lowPriority: ["medium", "low"],
  },
  {
    name: "Website repair",
    issue: ISSUE_LABELS.websiteUnavailable,
    highPriority: ["high", "medium"],
    lowPriority: ["low"],
  },
  {
    name: "Contact form setup",
    issue: ISSUE_LABELS.noContactForm,
    highPriority: [],
    lowPriority: ["high", "medium", "low"],
  },
  {
    name: "SEO / metadata setup",
    issue: ISSUE_LABELS.missingMetadata,
    highPriority: [],
    lowPriority: ["high", "medium", "low"],
  },
  {
    name: "Performance optimization",
    issue: ISSUE_LABELS.slowWebsite,
    highPriority: [],
    lowPriority: ["high", "medium", "low"],
  },
];

/**
 * Map the issue list + overall tier to recommended services, prioritized
 * by how the tier colors the pitch (spec §14's high/medium markers).
 */
export function recommendServices(
  issues: readonly string[],
  tier: OpportunityTier
): RecommendedService[] {
  const services: RecommendedService[] = [];

  for (const rule of RULES) {
    if (!issues.includes(rule.issue)) continue;
    const priority = rule.highPriority.includes(tier)
      ? "high"
      : rule.lowPriority.includes(tier)
        ? "low"
        : "medium";
    services.push({ name: rule.name, priority });
  }

  // Sort: high-priority pitches first — the detail page lists them in order.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return services.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
