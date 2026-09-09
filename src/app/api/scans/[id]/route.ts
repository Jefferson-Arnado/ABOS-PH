/**
 * GET /api/scans/:id — scan metadata + summary counts + scored businesses
 * (spec §20/§13), reconstructed from the persisted join rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { getScanById } from "@/lib/supabase/persist";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const scan = await getScanById(id);
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    return NextResponse.json({
      record: scan.record,
      summary: scan.summary,
      businesses: scan.businesses,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Scan query failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
