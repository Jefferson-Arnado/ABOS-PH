/**
 * ⚠️ TEMPORARY debug route — spot-check OSM provider output in the browser.
 * Delete before production (tracked in docs/PLAN.md cleanup notes).
 *
 * GET /api/debug/osm?lat=7.0731&lng=125.6128&radius=10000&category=restaurants&limit=10
 *
 * Options:
 *   noWebsite=1     — only businesses without a website
 *   analyze=1       — run the live website analyzer on businesses that have
 *                     a site (up to analyzeLimit) and attach checks[] output
 *   analyzeLimit=5  — how many sites to analyze (1–10)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/types/business";
import { getBusinessProvider } from "@/lib/business-providers";
import { analyzeWebsite } from "@/lib/website-analyzer";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(100).max(50_000),
  category: z.enum(CATEGORIES),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  // Only show businesses without a website (the interesting ones)
  noWebsite: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  // Live-analyze websites of businesses that have one
  analyze: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  analyzeLimit: z.coerce.number().int().min(1).max(10).default(5),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    lat: request.nextUrl.searchParams.get("lat") ?? undefined,
    lng: request.nextUrl.searchParams.get("lng") ?? undefined,
    radius: request.nextUrl.searchParams.get("radius") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    noWebsite: request.nextUrl.searchParams.get("noWebsite") ?? undefined,
    analyze: request.nextUrl.searchParams.get("analyze") ?? undefined,
    analyzeLimit: request.nextUrl.searchParams.get("analyzeLimit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    lat,
    lng,
    radius,
    category,
    limit,
    noWebsite,
    analyze,
    analyzeLimit,
  } = parsed.data;
  const provider = getBusinessProvider();

  try {
    const started = Date.now();
    const all = await provider.search({
      latitude: lat,
      longitude: lng,
      radius,
      category,
    });
    const searchMs = Date.now() - started;

    const filtered = noWebsite ? all.filter((b) => !b.website) : all;
    const businesses = filtered.slice(0, limit);

    // Optionally live-analyze the sites we can (different hosts, so a small
    // concurrent batch is polite — it's Overpass that needs pacing, not sites).
    let analysisMs = 0;
    const analysesById = new Map<string, Awaited<ReturnType<typeof analyzeWebsite>>>();
    if (analyze) {
      const targets = businesses.filter((b) => b.website).slice(0, analyzeLimit);
      if (targets.length > 0) {
        const analysisStarted = Date.now();
        const analyses = await Promise.all(
          targets.map((b) => analyzeWebsite(b.website as string, { timeoutMs: 10_000 }))
        );
        analysisMs = Date.now() - analysisStarted;
        targets.forEach((b, i) => analysesById.set(b.sourceId, analyses[i]));
      }
    }

    const withAnalysis = businesses.map((b) => {
      const analysis = analysesById.get(b.sourceId);
      if (!analysis) return b;
      const passed = analysis.checks.filter((c) => c.status === "pass").length;
      return {
        ...b,
        analysis: {
          ...analysis,
          summary: `${passed}/${analysis.checks.length} checks passed`,
        },
      };
    });

    return NextResponse.json({
      query: { lat, lng, radius, category, provider: provider.name, analyze },
      stats: {
        total: all.length,
        afterFilter: filtered.length,
        shown: businesses.length,
        withWebsite: all.filter((b) => b.website).length,
        withPhone: all.filter((b) => b.phone).length,
        analyzed: analysesById.size,
        searchMs,
        analysisMs,
      },
      businesses: withAnalysis,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provider failed" },
      { status: 502 }
    );
  }
}
