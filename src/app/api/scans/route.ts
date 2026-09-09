/**
 * POST /api/scans — run a scan (spec §20). Validates the request, executes
 * the pipeline (search → analyze → score), stores the result in memory and
 * returns the scan id + summary counts for the dashboard.
 *
 * Persistence note: results live in the in-memory store (lib/scanning/store)
 * for this MVP iteration; swapping to Supabase persistence touches only
 * saveScan/getScan.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/types/business";
import { ProviderError } from "@/lib/business-providers/types";
import { runScan } from "@/lib/scanning/pipeline";
import { makeScanId, saveScan } from "@/lib/scanning/store";

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

  try {
    const startedAt = Date.now();
    const result = await runScan(params);
    const id = makeScanId();

    saveScan({
      record: {
        id,
        userId: "anonymous", // auth + user-scoped scans arrive with Supabase persistence
        location: params.location,
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius,
        category: params.category,
        createdAt: new Date().toISOString(),
      },
      businesses: result.businesses,
      summary: result.summary,
    });

    return NextResponse.json(
      {
        scanId: id,
        summary: result.summary,
        elapsedMs: Date.now() - startedAt,
      },
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
