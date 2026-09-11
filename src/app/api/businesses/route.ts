/**
 * GET /api/businesses — filters: score, tier, website status, location
 * (spec §20). Reads businesses joined with their latest analysis from
 * Supabase (latest_business_analysis view); score/tier/website-status
 * filters run in PostgREST so pagination + totals are exact.
 *
 * Note: `location` (name/address substring) still filters in-process
 * over the fetched page. Auth: session required (401 without one).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/types/business";
import { getSessionUser } from "@/lib/supabase/clients";
import { queryBusinesses } from "@/lib/supabase/persist";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** Minimum opportunity score (0–100). */
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  /** `no_website` | `weak_website` | `has_website` */
  websiteStatus: z.enum(["no_website", "weak_website", "has_website"]).optional(),
  tier: z.enum(["high", "medium", "low"]).optional(),
  /** Case-insensitive substring match on name or address. */
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

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { total, businesses: page } = await queryBusinesses({
      minScore: filters.minScore,
      maxScore: filters.maxScore,
      tier: filters.tier,
      websiteStatus: filters.websiteStatus,
      limit: filters.limit,
      offset: filters.offset,
    });
    let businesses = page;

    // In-process refinements (see note above).
    if (filters.location) {
      const needle = filters.location.toLowerCase();
      businesses = businesses.filter(
        (s) =>
          s.business.name.toLowerCase().includes(needle) ||
          s.business.address?.toLowerCase().includes(needle)
      );
    }
    if (filters.category) {
      businesses = businesses.filter((s) => s.business.category === filters.category);
    }

    return NextResponse.json({ total, count: businesses.length, businesses });
  } catch (err) {
    return NextResponse.json(
      { error: "Businesses query failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
