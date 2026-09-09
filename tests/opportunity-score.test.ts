import { describe, expect, it } from "vitest";

import type { WebsiteAnalysis } from "@/types/analysis";
import {
  ISSUE_LABELS,
  SCORING_WEIGHTS,
  SLOW_THRESHOLD_MS,
  TIER_THRESHOLDS,
  isActiveBusiness,
  normalizeScore,
  scoreOpportunity,
  scoreToTier,
} from "@/lib/scoring/opportunity-score";

/** A business with no website — analysis is null (pipeline invariant, spec §7). */
const NO_WEBSITE = scoreOpportunity({ business: {}, analysis: null });

/** Business B (spec §10): a healthy website with everything present. */
function healthyAnalysis(): WebsiteAnalysis {
  return {
    websiteExists: true,
    statusCode: 200,
    https: true,
    responseTimeMs: 300,
    mobileViewport: true,
    metaTitle: "XYZ Restaurant",
    metaDescription: "Great food",
    bookingAvailable: true,
    orderingAvailable: true,
    hasContactForm: true,
    unavailable: false,
    checks: [],
  };
}

describe("scoreOpportunity — no website", () => {
  it("scores the spec §10 Business A baseline: 40 + 15 + 15", () => {
    expect(NO_WEBSITE.issues).toEqual([
      ISSUE_LABELS.noWebsite,
      ISSUE_LABELS.noBooking,
      ISSUE_LABELS.noOrdering,
    ]);
    expect(NO_WEBSITE.score).toBe(SCORING_WEIGHTS.noWebsite + SCORING_WEIGHTS.noBooking + SCORING_WEIGHTS.noOrdering);
  });

  it("skips website-quality checks — they do not apply", () => {
    for (const issue of [
      ISSUE_LABELS.noMobileViewport,
      ISSUE_LABELS.noContactForm,
      ISSUE_LABELS.missingMetadata,
      ISSUE_LABELS.slowWebsite,
      ISSUE_LABELS.websiteUnavailable,
    ]) {
      expect(NO_WEBSITE.issues).not.toContain(issue);
    }
  });

  it("reaches exactly 80 with the active-business bonus (spec §10 Business A)", () => {
    const result = scoreOpportunity({
      business: { phone: "+63 917 123 4567" },
      analysis: null,
    });
    expect(result.score).toBe(80);
    expect(result.tier).toBe("high");
  });

  it("treats analysis.websiteExists === false like no website", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: { ...healthyAnalysis(), websiteExists: false },
    });
    expect(result.issues).toContain(ISSUE_LABELS.noWebsite);
    expect(result.issues).not.toContain(ISSUE_LABELS.slowWebsite);
  });
});

describe("scoreOpportunity — website exists", () => {
  it("gives Business B (spec §10) a low score ≈ 12", () => {
    const result = scoreOpportunity({
      business: { phone: "+63 82 224 1234" }, // active business +10
      analysis: healthyAnalysis(),
    });
    expect(result.issues).toEqual([]);
    expect(result.score).toBe(SCORING_WEIGHTS.activeBusiness);
    expect(result.tier).toBe("low");
  });

  it("adds +30 and stops short of per-feature penalties when unavailable", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: {
        ...healthyAnalysis(),
        unavailable: true,
        responseTimeMs: SLOW_THRESHOLD_MS + 5_000,
      },
    });
    expect(result.issues).toEqual([ISSUE_LABELS.websiteUnavailable]);
    expect(result.score).toBe(SCORING_WEIGHTS.websiteUnavailable);
  });

  it("penalizes each missing feature independently", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: {
        ...healthyAnalysis(),
        mobileViewport: false,
        bookingAvailable: false,
        orderingAvailable: false,
        hasContactForm: false,
      },
    });
    expect(result.issues).toEqual([
      ISSUE_LABELS.noMobileViewport,
      ISSUE_LABELS.noBooking,
      ISSUE_LABELS.noOrdering,
      ISSUE_LABELS.noContactForm,
    ]);
    expect(result.score).toBe(15 + 15 + 15 + 5);
  });

  it("flags missing metadata when both title and description are absent", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: { ...healthyAnalysis(), metaTitle: undefined, metaDescription: "" },
    });
    expect(result.issues).toContain(ISSUE_LABELS.missingMetadata);
    expect(result.score).toBe(SCORING_WEIGHTS.missingMetadata);
  });

  it("flags missing metadata for whitespace-only strings", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: { ...healthyAnalysis(), metaTitle: "  ", metaDescription: "\n" },
    });
    expect(result.issues).toContain(ISSUE_LABELS.missingMetadata);
  });

  it("flags slow websites beyond the threshold, not at it", () => {
    const atThreshold = scoreOpportunity({
      business: {},
      analysis: { ...healthyAnalysis(), responseTimeMs: SLOW_THRESHOLD_MS },
    });
    expect(atThreshold.issues).not.toContain(ISSUE_LABELS.slowWebsite);

    const slow = scoreOpportunity({
      business: {},
      analysis: { ...healthyAnalysis(), responseTimeMs: SLOW_THRESHOLD_MS + 1 },
    });
    expect(slow.issues).toContain(ISSUE_LABELS.slowWebsite);
    expect(slow.score).toBe(SCORING_WEIGHTS.slowWebsite);
  });

  it("treats undefined feature flags as missing (unknown → penalized)", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: { websiteExists: true, checks: [] },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        ISSUE_LABELS.noMobileViewport,
        ISSUE_LABELS.noBooking,
        ISSUE_LABELS.noOrdering,
        ISSUE_LABELS.noContactForm,
        ISSUE_LABELS.missingMetadata,
      ])
    );
    expect(result.score).toBe(15 + 15 + 15 + 5 + 5);
  });
});

describe("scoreOpportunity — active business bonus", () => {
  it("adds +10 for phone or address on file", () => {
    expect(
      scoreOpportunity({ business: { phone: "0917 123 4567" }, analysis: null }).score
    ).toBe(80);
    expect(
      scoreOpportunity({ business: { address: "123 Rizal St, Davao" }, analysis: null }).score
    ).toBe(80);
  });

  it("ignores blank strings and awards nothing with no contact info", () => {
    expect(isActiveBusiness({ phone: "   " })).toBe(false);
    expect(isActiveBusiness({ address: undefined })).toBe(false);
    expect(scoreOpportunity({ business: {}, analysis: null }).score).toBe(70);
  });
});

describe("normalizeScore", () => {
  it("clamps into 0–100 and rounds", () => {
    expect(normalizeScore(-5)).toBe(0);
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(42.4)).toBe(42);
    expect(normalizeScore(42.6)).toBe(43);
    expect(normalizeScore(135)).toBe(100);
    expect(normalizeScore(Number.NaN)).toBe(0);
  });

  it("worst existing-website case sums all quality penalties (+ bonus)", () => {
    const worst = scoreOpportunity({
      business: { phone: "0917 123 4567" },
      analysis: {
        websiteExists: true,
        unavailable: false,
        statusCode: 200,
        responseTimeMs: SLOW_THRESHOLD_MS + 1,
        mobileViewport: false,
        metaTitle: undefined,
        metaDescription: undefined,
        bookingAvailable: false,
        orderingAvailable: false,
        hasContactForm: false,
        checks: [],
      },
    });
    // 15 + 15 + 15 + 5 + 5 + 10 + 10 (bonus) = 75 — no-website (+40) is
    // mutually exclusive with the website checks, so this is the true max.
    expect(worst.score).toBe(75);
    expect(worst.tier).toBe("high");
  });

  it("no-website path maxes at 80 (spec §10 Business A is the floor for 🔥)", () => {
    // Already asserted above; documents the mutually-exclusive rule paths.
    expect(SCORING_WEIGHTS.noWebsite + SCORING_WEIGHTS.noBooking + SCORING_WEIGHTS.noOrdering + SCORING_WEIGHTS.activeBusiness).toBe(80);
  });
});

describe("scoreToTier / thresholds", () => {
  it("maps 🔥 ≥ 70, 🟡 40–69, 🟢 < 40", () => {
    expect(TIER_THRESHOLDS.high).toBe(70);
    expect(TIER_THRESHOLDS.medium).toBe(40);
    expect(scoreToTier(100)).toBe("high");
    expect(scoreToTier(70)).toBe("high");
    expect(scoreToTier(69)).toBe("medium");
    expect(scoreToTier(40)).toBe("medium");
    expect(scoreToTier(39)).toBe("low");
    expect(scoreToTier(0)).toBe("low");
  });

  it("keeps the no-website baseline (70) in the high tier", () => {
    expect(NO_WEBSITE.tier).toBe("high");
    expect(NO_WEBSITE.score).toBe(TIER_THRESHOLDS.high);
  });
});

describe("issue list contract", () => {
  it("emits labels matching the spec wording for UI + AI prompts", () => {
    expect(Object.values(ISSUE_LABELS)).toEqual([
      "No website",
      "Website unavailable/broken",
      "No mobile viewport",
      "No online booking",
      "No online ordering",
      "No contact form",
      "Missing metadata",
      "Slow website",
    ]);
  });

  it("returns no duplicate issues for a single business", () => {
    const result = scoreOpportunity({
      business: {},
      analysis: {
        websiteExists: true,
        unavailable: false,
        bookingAvailable: false,
        orderingAvailable: false,
        mobileViewport: false,
        hasContactForm: false,
        responseTimeMs: SLOW_THRESHOLD_MS + 1,
        checks: [],
      },
    });
    expect(new Set(result.issues).size).toBe(result.issues.length);
  });
});
