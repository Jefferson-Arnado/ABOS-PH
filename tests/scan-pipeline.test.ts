import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Business } from "@/types/business";
import type { ScoredBusiness } from "@/types/analysis";
import type { BusinessProvider } from "@/lib/business-providers/types";
import { ProviderError } from "@/lib/business-providers/types";
import { analyzeWebsite } from "@/lib/website-analyzer";
import {
  hasNoWebsite,
  hasWeakWebsite,
  mapWithConcurrency,
  runScan,
  summarize,
  unavailableAnalysis,
} from "@/lib/scanning/pipeline";
import {
  clearScans,
  getScan,
  makeScanId,
  saveScan,
  scanCount,
} from "@/lib/scanning/store";

function business(overrides: Partial<Business> & { id: string }): Business {
  return {
    name: `Biz ${overrides.id}`,
    source: "osm",
    sourceId: overrides.id,
    ...overrides,
  };
}

/** Analysis with every check passing (a healthy website). */
function healthyAnalysis() {
  return {
    websiteExists: true,
    statusCode: 200,
    https: true,
    responseTimeMs: 200,
    mobileViewport: true,
    metaTitle: "T",
    metaDescription: "D",
    bookingAvailable: true,
    orderingAvailable: true,
    hasContactForm: true,
    unavailable: false,
    checks: [],
  };
}

const DAO = { latitude: 7.0731, longitude: 125.6128, radius: 10_000, category: "restaurants" as const };

function makeProvider(businesses: Business[], impl?: Partial<BusinessProvider>): BusinessProvider {
  return {
    name: "mock",
    search: vi.fn().mockResolvedValue(businesses),
    getDetails: vi.fn(),
    ...impl,
  };
}

describe("mapWithConcurrency", () => {
  it("maps all items in order with limited parallelism", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});

describe("runScan", () => {
  it("scores, sorts, and summarizes an end-to-end scan (Tests #1–#4 shape)", async () => {
    const provider = makeProvider([
      business({ id: "n1", website: "https://weak.example" }),
      business({ id: "n2" }), // no website
      business({ id: "n3", website: "https://great.example" }),
    ]);
    const analyze = vi
      .fn<typeof analyzeWebsite>()
      .mockResolvedValueOnce({ ...healthyAnalysis(), mobileViewport: false } as never)
      .mockResolvedValueOnce(healthyAnalysis() as never);

    const result = await runScan({ ...DAO, location: "Davao City" }, { provider, analyze });

    expect(provider.search).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledTimes(2); // no-site business is never fetched

    const [first, , third] = result.businesses;
    expect(first.business.id).toBe("n2"); // no website → highest score
    expect(first.analysis).toBeNull();
    expect(first.opportunity.tier).toBe("high");
    expect(third.business.id).toBe("n3"); // healthy site → lowest score
    expect(third.opportunity.tier).toBe("low");

    // Scores descending
    const scores = result.businesses.map((s) => s.opportunity.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    // Acceptance Test #4: every business gets a 0–100 score
    for (const s of result.businesses) {
      expect(s.opportunity.score).toBeGreaterThanOrEqual(0);
      expect(s.opportunity.score).toBeLessThanOrEqual(100);
    }

    expect(result.summary.businessesFound).toBe(3);
    expect(result.summary.opportunities).toBe(result.summary.high + result.summary.medium);
    expect(result.summary.noWebsite).toBe(1);
    expect(result.summary.weakWebsite).toBe(1); // viewport=false site
  });

  it("never lets one failing analysis crash the scan", async () => {
    const provider = makeProvider([business({ id: "n1", website: "https://x.example" })]);
    const analyze = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await runScan({ ...DAO, location: "X" }, { provider, analyze });

    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].analysis?.unavailable).toBe(true);
    expect(result.businesses[0].opportunity.issues).toContain("Website unavailable/broken");
  });

  it("propagates provider failure as ProviderError", async () => {
    const provider = makeProvider([], {
      search: vi.fn().mockRejectedValue(new ProviderError("overpass down", "osm")),
    });
    await expect(
      runScan({ ...DAO, location: "X" }, { provider })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("handles an empty scan gracefully", async () => {
    const provider = makeProvider([]);
    const result = await runScan({ ...DAO, location: "X" }, { provider });
    expect(result.businesses).toEqual([]);
    expect(result.summary).toEqual({
      businessesFound: 0,
      opportunities: 0,
      high: 0,
      medium: 0,
      low: 0,
      noWebsite: 0,
      weakWebsite: 0,
    });
  });

  it("respects the concurrency limit for analyses", async () => {
    const businesses = Array.from({ length: 20 }, (_, i) =>
      business({ id: `n${i}`, website: `https://s${i}.example` })
    );
    const provider = makeProvider(businesses);
    let inFlight = 0;
    let max = 0;
    const analyze = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return healthyAnalysis() as never;
    });

    await runScan({ ...DAO, location: "X" }, { provider, analyze, concurrency: 4 });
    expect(max).toBeLessThanOrEqual(4);
    expect(analyze).toHaveBeenCalledTimes(20);
  });
});

describe("summarize / helpers", () => {
  it("counts opportunities as high+medium and detects no/weak websites", () => {
    const noSite: ScoredBusiness = {
      business: business({ id: "a" }),
      analysis: null,
      opportunity: { score: 80, tier: "high", issues: ["No website"] },
    };
    const weak: ScoredBusiness = {
      business: business({ id: "b", website: "https://b.example" }),
      analysis: { ...healthyAnalysis(), unavailable: true } as never,
      opportunity: { score: 50, tier: "medium", issues: ["Website unavailable/broken"] },
    };
    const good: ScoredBusiness = {
      business: business({ id: "c", website: "https://c.example" }),
      analysis: healthyAnalysis() as never,
      opportunity: { score: 10, tier: "low", issues: [] },
    };

    expect(hasNoWebsite(noSite)).toBe(true);
    expect(hasNoWebsite(weak)).toBe(false);
    expect(hasWeakWebsite(weak)).toBe(true);
    expect(hasWeakWebsite(good)).toBe(false);

    const summary = summarize([noSite, weak, good]);
    expect(summary).toMatchObject({
      businessesFound: 3,
      opportunities: 2,
      high: 1,
      medium: 1,
      low: 1,
      noWebsite: 1,
      weakWebsite: 1,
    });
  });

  it("builds an unavailable analysis fallback", () => {
    const a = unavailableAnalysis();
    expect(a.unavailable).toBe(true);
    expect(a.checks[0]?.id).toBe("reachability");
  });
});

describe("in-memory store", () => {
  beforeEach(() => {
    clearScans();
  });

  it("saves, gets, and counts scans", () => {
    const id = makeScanId();
    saveScan({
      record: {
        id,
        userId: "u1",
        location: "Davao City",
        ...DAO,
        createdAt: new Date().toISOString(),
      },
      businesses: [],
      summary: summarize([]),
    });

    expect(scanCount()).toBe(1);
    expect(getScan(id)?.record.location).toBe("Davao City");
    expect(getScan("missing")).toBeUndefined();
  });

  it("generates unique sequential ids", () => {
    const ids = new Set([makeScanId(), makeScanId(), makeScanId()]);
    expect(ids.size).toBe(3);
  });
});
