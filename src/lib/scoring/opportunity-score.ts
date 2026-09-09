/**
 * Opportunity scoring engine (spec §9–§10) — deterministic, rule-based,
 * no AI (docs/AGENTS.md §2 rule 3). Takes a business and its website
 * analysis and produces a 0–100 score, a tier, and the human-readable
 * issue list the UI badges and the AI prompt consume.
 */

import type { Business } from "@/types/business";
import type {
  OpportunityResult,
  OpportunityTier,
  WebsiteAnalysis,
} from "@/types/analysis";

/** Weights per condition (spec §9 rule table). */
export const SCORING_WEIGHTS = {
  noWebsite: 40,
  websiteUnavailable: 30,
  noMobileViewport: 15,
  noBooking: 15,
  noOrdering: 15,
  noContactForm: 5,
  missingMetadata: 5,
  slowWebsite: 10,
  /** Spec §10 "Active business" bonus — provider record looks operational. */
  activeBusiness: 10,
} as const;

/**
 * Tier thresholds on the normalized 0–100 score. The no-website baseline
 * (40 + 15 + 15 = 70) must land in `high` (spec §10 Business A → 🔥).
 */
export const TIER_THRESHOLDS = {
  high: 70,
  medium: 40,
} as const;

/** Sites slower than this count as "slow website" (matches analyzer default). */
export const SLOW_THRESHOLD_MS = 5_000;

/** Issue labels — the exact strings UI badges and the AI prompt use. */
export const ISSUE_LABELS = {
  noWebsite: "No website",
  websiteUnavailable: "Website unavailable/broken",
  noMobileViewport: "No mobile viewport",
  noBooking: "No online booking",
  noOrdering: "No online ordering",
  noContactForm: "No contact form",
  missingMetadata: "Missing metadata",
  slowWebsite: "Slow website",
} as const;

export interface ScoreOpportunityInput {
  business: Pick<Business, "phone" | "address">;
  /** Website analysis, or null when the business has no website (spec §7). */
  analysis: WebsiteAnalysis | null;
}

/** Clamp an arbitrary sum into the 0–100 range. */
export function normalizeScore(raw: number): number {
  if (Number.isNaN(raw)) return 0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** Map a normalized score to a tier (spec §10: 🔥 / 🟡 / 🟢). */
export function scoreToTier(score: number): OpportunityTier {
  if (score >= TIER_THRESHOLDS.high) return "high";
  if (score >= TIER_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * True when the provider record suggests an operating business: a phone
 * number or a street address on file. Spec §10 grants +10 for it.
 */
export function isActiveBusiness(
  business: Pick<Business, "phone" | "address">
): boolean {
  return Boolean(business.phone?.trim() || business.address?.trim());
}

/**
 * Score one business deterministically (spec §9–§10).
 *
 * - No website → +40, and website-quality checks are skipped entirely
 *   (nothing to check); "no booking"/"no ordering" are implied (+15 each,
 *   per spec §10 Business A).
 * - Website exists → per-feature rules; `unavailable` counts as broken.
 */
export function scoreOpportunity(input: ScoreOpportunityInput): OpportunityResult {
  const { business, analysis } = input;

  let raw = 0;
  const issues: string[] = [];

  if (!analysis || analysis.websiteExists === false) {
    // No website: only the no-website baseline + implied functionality gaps.
    raw += SCORING_WEIGHTS.noWebsite;
    issues.push(ISSUE_LABELS.noWebsite);
    raw += SCORING_WEIGHTS.noBooking;
    issues.push(ISSUE_LABELS.noBooking);
    raw += SCORING_WEIGHTS.noOrdering;
    issues.push(ISSUE_LABELS.noOrdering);
  } else {
    if (analysis.unavailable) {
      raw += SCORING_WEIGHTS.websiteUnavailable;
      issues.push(ISSUE_LABELS.websiteUnavailable);
    }

    // Website-quality checks only apply when there is something to check.
    // `undefined` feature flags mean "unknown" → treat as missing.
    const hasViewport = analysis.mobileViewport === true;
    if (!hasViewport && !analysis.unavailable) {
      raw += SCORING_WEIGHTS.noMobileViewport;
      issues.push(ISSUE_LABELS.noMobileViewport);
    }

    if (analysis.bookingAvailable !== true) {
      raw += SCORING_WEIGHTS.noBooking;
      issues.push(ISSUE_LABELS.noBooking);
    }
    if (analysis.orderingAvailable !== true) {
      raw += SCORING_WEIGHTS.noOrdering;
      issues.push(ISSUE_LABELS.noOrdering);
    }

    if (analysis.hasContactForm !== true && !analysis.unavailable) {
      raw += SCORING_WEIGHTS.noContactForm;
      issues.push(ISSUE_LABELS.noContactForm);
    }

    const hasTitle = Boolean(analysis.metaTitle?.trim());
    const hasDescription = Boolean(analysis.metaDescription?.trim());
    if (!hasTitle && !hasDescription && !analysis.unavailable) {
      raw += SCORING_WEIGHTS.missingMetadata;
      issues.push(ISSUE_LABELS.missingMetadata);
    }

    const responseTime = analysis.responseTimeMs;
    if (
      !analysis.unavailable &&
      typeof responseTime === "number" &&
      responseTime > SLOW_THRESHOLD_MS
    ) {
      raw += SCORING_WEIGHTS.slowWebsite;
      issues.push(ISSUE_LABELS.slowWebsite);
    }
  }

  if (isActiveBusiness(business)) {
    raw += SCORING_WEIGHTS.activeBusiness;
  }

  const score = normalizeScore(raw);

  return { score, tier: scoreToTier(score), issues };
}
