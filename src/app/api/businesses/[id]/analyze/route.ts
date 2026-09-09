/**
 * POST /api/businesses/:id/analyze — run/re-run the website analysis for one
 * business (spec §20), rescore it, and update the in-memory store. This is
 * the per-business re-analysis endpoint; with DB persistence it also inserts
 * a new business_analysis row (1:N history).
 */

import { NextRequest, NextResponse } from "next/server";
import type { WebsiteAnalysis } from "@/types/analysis";
import { ProviderError } from "@/lib/business-providers/types";
import { analyzeWebsite } from "@/lib/website-analyzer";
import { scoreOpportunity } from "@/lib/scoring/opportunity-score";
import { summarize } from "@/lib/scanning/pipeline";
import { getScan, listScans } from "@/lib/scanning/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Businesses live inside scans in the in-memory MVP; search newest first.
  const scans = listScans().sort(
    (a, b) => Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt)
  );
  let hit: { scanId: string; index: number } | undefined;
  for (const scan of scans) {
    const index = scan.businesses.findIndex((s) => s.business.id === id);
    if (index !== -1) {
      hit = { scanId: scan.record.id, index };
      break;
    }
  }
  if (!hit) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const stored = getScan(hit.scanId)!;
  const scored = stored.businesses[hit.index];

  try {
    // No website → analysis stays null (same invariant as the pipeline).
    let analysis: WebsiteAnalysis | null = null;
    if (scored.business.website) {
      analysis = await analyzeWebsite(scored.business.website, {
        timeoutMs: 10_000,
      });
    }

    const updated = {
      ...scored,
      analysis,
      opportunity: scoreOpportunity({ business: scored.business, analysis }),
    };
    stored.businesses[hit.index] = updated;
    // Tiers may have changed — keep the dashboard counts honest.
    stored.summary = summarize(stored.businesses);

    return NextResponse.json({ business: updated });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json(
        { error: "Website analysis failed", detail: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Analysis failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
