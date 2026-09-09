/**
 * POST /api/businesses/:id/analyze — run/re-run the website analysis for
 * one business (spec §20). Accepts either the DB UUID or the provider id
 * (e.g. "osm:node/1802759779" — URL-encode `:` and `/`). A new
 * business_analysis row is appended (1:N history); readers see the
 * latest via the latest_business_analysis view.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Business } from "@/types/business";
import { analyzeWebsite } from "@/lib/website-analyzer";
import { scoreOpportunity } from "@/lib/scoring/opportunity-score";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  insertAnalysis,
} from "@/lib/supabase/persist";
import type { BusinessRow } from "@/types/db";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = getSupabaseAdmin();

    // Resolve the business row by UUID directly, or by provider id.
    let row: BusinessRow | null = null;
    if (UUID_RE.test(id)) {
      const { data, error } = await db
        .from("businesses")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      row = (data as BusinessRow | null) ?? null;
    } else {
      const separator = id.indexOf(":");
      if (separator === -1) {
        return NextResponse.json(
          { error: "Invalid business id — use a UUID or provider id like osm:node/123" },
          { status: 400 }
        );
      }
      const sourceId = id.slice(separator + 1);
      const { data, error } = await db
        .from("businesses")
        .select("*")
        .eq("source_id", sourceId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      row = (data as BusinessRow | null) ?? null;
    }

    if (!row) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    const business: Business = {
      id: row.id,
      name: row.name,
      category: row.category ?? undefined,
      address: row.address ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      phone: row.phone ?? undefined,
      website: row.website ?? undefined,
      source: row.source,
      sourceId: row.sourceId,
    };

    // No website → analysis stays null (same invariant as the pipeline).
    let analysis = null;
    if (business.website) {
      analysis = await analyzeWebsite(business.website, { timeoutMs: 10_000 });
    }

    const opportunity = scoreOpportunity({ business, analysis });
    const updated = await insertAnalysis(row.id, {
      business,
      analysis,
      opportunity,
    });

    return NextResponse.json({ business: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "Analysis failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
