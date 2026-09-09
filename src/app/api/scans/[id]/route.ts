/**
 * GET /api/scans/:id — scan metadata + summary counts (spec §20), plus the
 * scored businesses for the results dashboard (spec §13).
 */

import { NextRequest, NextResponse } from "next/server";
import { getScan } from "@/lib/scanning/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stored = getScan(id);

  if (!stored) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json({
    record: stored.record,
    summary: stored.summary,
    businesses: stored.businesses,
  });
}
