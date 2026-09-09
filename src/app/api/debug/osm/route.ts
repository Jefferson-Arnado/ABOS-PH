/**
 * ⚠️ TEMPORARY debug route — spot-check OSM provider output in the browser.
 * Delete before production (tracked in docs/PLAN.md cleanup notes).
 *
 * GET /api/debug/osm?lat=7.0731&lng=125.6128&radius=10000&category=restaurants&limit=10
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/types/business";
import { getBusinessProvider } from "@/lib/business-providers";

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
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    lat: request.nextUrl.searchParams.get("lat") ?? undefined,
    lng: request.nextUrl.searchParams.get("lng") ?? undefined,
    radius: request.nextUrl.searchParams.get("radius") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    noWebsite: request.nextUrl.searchParams.get("noWebsite") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { lat, lng, radius, category, limit, noWebsite } = parsed.data;
  const provider = getBusinessProvider();

  try {
    const started = Date.now();
    const all = await provider.search({
      latitude: lat,
      longitude: lng,
      radius,
      category,
    });
    const elapsedMs = Date.now() - started;

    const filtered = noWebsite ? all.filter((b) => !b.website) : all;
    const businesses = filtered.slice(0, limit);

    return NextResponse.json({
      query: { lat, lng, radius, category, provider: provider.name },
      stats: {
        total: all.length,
        afterFilter: filtered.length,
        shown: businesses.length,
        withWebsite: all.filter((b) => b.website).length,
        withPhone: all.filter((b) => b.phone).length,
        elapsedMs,
      },
      businesses,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provider failed" },
      { status: 502 }
    );
  }
}
