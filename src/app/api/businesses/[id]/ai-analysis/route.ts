/**
 * POST /api/businesses/:id/ai-analysis — AI opportunity analysis for top
 * prospects (spec §12, PLAN.md Phase 9).
 *
 * Cost control (spec §11, AGENTS §2 rule 3 — hard rule): AI is NEVER run
 * per-business during scans and only the top-scored prospects are
 * eligible here (TOP_PROSPECTS_LIMIT, default 20 by latest-analysis
 * score). Eligible output is cached in business_analysis.analysis — a
 * second call is a cache hit, not another model run.
 *
 * Accepts the DB UUID or provider id (like the analyze route).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { AIProviderError } from "@/lib/ai/types";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getLatestAnalysisMeta,
  getLatestScanLocationForBusiness,
  getTopProspectBusinessIds,
  resolveBusiness,
  saveAiAnalysis,
} from "@/lib/supabase/persist";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // local models can be slow

/** Spec §11: rank → top 20 → AI. Generous with ties (see getTopProspectBusinessIds). */
export const TOP_PROSPECTS_LIMIT = 20;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
    const business = await resolveBusiness(id);
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const meta = await getLatestAnalysisMeta(business.id);
    if (!meta) {
      return NextResponse.json(
        { error: "Business has no analysis yet — run a scan or re-analyze first" },
        { status: 409 }
      );
    }

    // Cache hit: already generated for these exact website facts.
    if (meta.ai) {
      return NextResponse.json({ ai: meta.ai, cached: true });
    }

    // Spec §11 gate: only top-scored prospects get AI (cost control).
    const topIds = await getTopProspectBusinessIds(TOP_PROSPECTS_LIMIT);
    if (!topIds.includes(business.id)) {
      return NextResponse.json(
        {
          error: "Not a top prospect",
          detail: `AI analysis is limited to the top ${TOP_PROSPECTS_LIMIT} scored prospects (spec §11 cost control). This business is not currently in that set.`,
        },
        { status: 403 }
      );
    }

    const location = await getLatestScanLocationForBusiness(business.id);
    const provider = getAIProvider();
    const ai = await provider.analyzeBusiness({
      businessName: business.name,
      category: business.category ?? null,
      location: location ?? undefined,
      opportunityScore: meta.score,
      tier: meta.tier,
      issues: meta.issues,
      website: business.website ?? null,
      phone: business.phone ?? null,
    });

    await saveAiAnalysis(meta.analysisRowId, ai);
    return NextResponse.json({ ai, cached: false }, { status: 201 });
  } catch (err) {
    if (err instanceof AIProviderError) {
      return NextResponse.json(
        { error: "AI analysis failed", detail: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        error: "AI analysis failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
