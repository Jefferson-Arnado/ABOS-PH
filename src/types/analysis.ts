/**
 * Website analysis + opportunity scoring types.
 * See docs/ARCHITECTURE.md §6–§8.
 */

import type { Business } from "./business";

export type CheckStatus = "pass" | "fail" | "warn";

export interface AnalysisCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

/** Result of checking + analyzing a business's website (spec §7–§8). */
export interface WebsiteAnalysis {
  websiteExists: boolean;
  /** Present when websiteExists and the site responded. */
  statusCode?: number;
  https?: boolean;
  responseTimeMs?: number;
  mobileViewport?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasAddress?: boolean;
  bookingAvailable?: boolean;
  orderingAvailable?: boolean;
  hasContactForm?: boolean;
  /** Per-check results for the detail UI (spec §8 "Website Analysis" panel). */
  checks: AnalysisCheck[];
  /** True when a site exists but could not be fetched (counts as "broken"). */
  unavailable?: boolean;
}

export type OpportunityTier = "high" | "medium" | "low";

/** Deterministic scoring output (spec §9–§10). */
export interface OpportunityResult {
  /** 0–100. */
  score: number;
  tier: OpportunityTier;
  /** Human-readable issues, e.g. ["No website", "No online ordering"]. */
  issues: string[];
}

/** Business + analysis bundle as used by the results dashboard. */
export interface ScoredBusiness {
  business: Business;
  analysis: WebsiteAnalysis | null;
  opportunity: OpportunityResult;
}

export type RecommendedServicePriority = "high" | "medium" | "low";

export interface RecommendedService {
  name: string;
  priority: RecommendedServicePriority;
}

/** AI-generated analysis for top prospects (spec §12). */
export interface AiAnalysis {
  whyGoodProspect: string;
  recommendedServices: RecommendedService[];
  salesAngle: string;
}
