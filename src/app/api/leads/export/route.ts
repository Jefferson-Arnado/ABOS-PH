/**
 * GET /api/leads/export — CSV download of the user's leads (spec §17,
 * PLAN.md Phase 8). Columns: Business, Category, Phone, Website, Score,
 * Opportunity. Streams with `Content-Disposition: attachment` so the
 * browser saves leads.csv.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { listLeadsWithBusiness } from "@/lib/leads/lead-service";
import { leadRowsToCsv, type LeadCsvRow } from "@/lib/leads/csv";
import { opportunityLabel } from "@/lib/leads/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    getSupabaseAdmin();
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
    const leads = await listLeadsWithBusiness(user.id);
    const rows: LeadCsvRow[] = leads.map((entry) => ({
      businessName: entry.business.name,
      category: entry.business.category,
      phone: entry.business.phone,
      website: entry.business.website,
      score: entry.score,
      opportunity: opportunityLabel({
        website: entry.business.website,
        analysis: {
          unavailable: entry.analysisFlags.unavailable,
          https: entry.analysisFlags.https,
          mobileViewport: entry.analysisFlags.mobileFriendly,
        },
        tier: entry.tier,
      }),
    }));

    const csv = leadRowsToCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="leads.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "CSV export failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
