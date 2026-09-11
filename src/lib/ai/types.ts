/**
 * AI provider types (docs/PLAN.md Phase 9, spec §12 + §23). The provider
 * interface is the swap point (ARCHITECTURE §4): Ollama in dev, hosted
 * OpenAI-compatible later — switching is an env var, never app code.
 *
 * Cost-control context (spec §11, AGENTS §2 rule 3): AI is NEVER called
 * per-business during a scan. It runs on demand for individual businesses
 * and the route layer caps eligibility to the top-scored prospects.
 */

import type { AiAnalysis, RecommendedService } from "@/types/analysis";

/**
 * Data sent to the AI provider (spec §12 input). Deliberately small and
 * fact-based: score/issues come from the deterministic engine, so the AI
 * explains the opportunity rather than inventing one.
 */
export interface BusinessAnalysisInput {
  businessName: string;
  category: string | null;
  /** Location label, e.g. "Davao City" (the scan's location). */
  location?: string;
  /** Absolute opportunity score 0–100 from the scoring engine. */
  opportunityScore: number;
  tier: "high" | "medium" | "low";
  /** Issue list emitted by the scoring engine, e.g. ["No website"]. */
  issues: string[];
  website: string | null;
  phone: string | null;
  /** Free-form notes the user saved on the lead (optional context). */
  notes?: string | null;
}

/** Provider contract (spec §23) — the only AI swap point. */
export interface AIProvider {
  readonly name: string;
  analyzeBusiness(data: BusinessAnalysisInput): Promise<AiAnalysis>;
}

/** Re-export so consumers don't import from two places. */
export type { AiAnalysis, RecommendedService };

/** Error thrown by AI providers — routes map it to 502. */
export class AIProviderError extends Error {
  readonly provider: string;
  constructor(message: string, provider: string, cause?: unknown) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.cause = cause;
  }
}
