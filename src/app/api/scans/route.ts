/**
 * POST /api/scans — run a scan (spec §20). Validates the request, executes
 * the pipeline (search → analyze → score), persists everything to Supabase
 * (scans + businesses upsert + business_analysis + scan_businesses join)
 * and returns the scan id + summary.
 *
 * Scan ownership uses DEV_USER_ID until Phase 6 auth lands (user decision
 * 2026-09-10, scripts/seed-dev-user.mjs).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/types/business";
import { ProviderError } from "@/lib/business-providers/types";
import { runScan } from "@/lib/scanning/pipeline";
import { getDevUserId, getSupabaseAdmin } from "@/lib/supabase/server";
import { persistScan } from "@/lib/supabase/persist";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  location: z.string().trim().min(1).max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  /** Meters, capped per the migration check + PRD §8. */
  radius: z.coerce.number().int().min(100).max(50_000),
  category: z.enum(CATEGORIES),
});

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const params = parsed.data;

  // Fail fast (before the ~30s pipeline) when persistence isn't configured.
  try {
    getSupabaseAdmin();
    getDevUserId();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Persistence not configured",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }

  try {
    const result = await runScan(params);
    const record = await persistScan(params, getDevUserId(), result.businesses);

    return NextResponse.json(
      { scanId: record.id, summary: result.summary },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json(
        { error: "Business data provider failed", detail: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Scan failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
