/**
 * GET /api/businesses — filters: score, category, website status, location
 * (spec §20). In this MVP iteration the query runs over the most recent
 * in-memory scan; with DB persistence this becomes a Supabase query.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/types/business";
import { hasNoWebsite, hasWeakWebsite } from "@/lib/scanning/pipeline";
import { listScans } from "@/lib/scanning/store";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** Minimum opportunity score (0–100). */
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  /** `no_website` | `weak_website` | `has_website` */
  websiteStatus: z.enum(["no_website", "weak_website", "has_website"]).optional(),
  tier: z.enum(["high", "medium", "low"]).optional(),
  /** Case-insensitive substring match on name or address (location filter). */
  location: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const filters = parsed.data;

  const latest = listScans().sort(
    (a, b) => Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt)
  )[0];
  if (!latest) {
    return NextResponse.json(
      { error: "No scan available — run POST /api/scans first" },
      { status: 404 }
    );
  }

  let businesses = latest.businesses;
  if (filters.minScore !== undefined) {
    businesses = businesses.filter((s) => s.opportunity.score >= filters.minScore!);
  }
  if (filters.maxScore !== undefined) {
    businesses = businesses.filter((s) => s.opportunity.score <= filters.maxScore!);
  }
  if (filters.category) {
    businesses = businesses.filter((s) => s.business.category === filters.category);
  }
  if (filters.tier) {
    businesses = businesses.filter((s) => s.opportunity.tier === filters.tier);
  }
  if (filters.websiteStatus === "no_website") {
    businesses = businesses.filter(hasNoWebsite);
  } else if (filters.websiteStatus === "weak_website") {
    businesses = businesses.filter(hasWeakWebsite);
  } else if (filters.websiteStatus === "has_website") {
    businesses = businesses.filter((s) => !hasNoWebsite(s));
  }
  if (filters.location) {
    const needle = filters.location.toLowerCase();
    businesses = businesses.filter(
      (s) =>
        s.business.name.toLowerCase().includes(needle) ||
        s.business.address?.toLowerCase().includes(needle)
    );
  }

  const total = businesses.length;
  const page = businesses.slice(filters.offset, filters.offset + filters.limit);

  return NextResponse.json({ total, count: page.length, businesses: page });
}
