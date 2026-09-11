/**
 * GET /api/scans/:id — scan metadata + summary counts + scored businesses
 * (spec §20/§13), reconstructed from the persisted join rows.
 *
 * Auth: session required; users may only read their own scans (the UI
 * redirects on foreign scans — here it's a 404 to avoid existence leaks).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/clients";
import { getScanById } from "@/lib/supabase/persist";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const scan = await getScanById(id);
    if (!scan || scan.record.userId !== user.id) {
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
