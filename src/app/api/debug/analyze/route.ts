/**
 * ⚠️ TEMPORARY debug route — analyze a single website and show its checks.
 * Delete before production (tracked in docs/PLAN.md cleanup notes).
 *
 * GET /api/debug/analyze?url=example.com
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeWebsite } from "@/lib/website-analyzer";

const querySchema = z.object({
  url: z.string().min(3).max(2000),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    url: request.nextUrl.searchParams.get("url") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide ?url= (e.g. ?url=example.com)" },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzeWebsite(parsed.data.url, { timeoutMs: 15_000 });
    const passed = analysis.checks.filter((c) => c.status === "pass").length;
    return NextResponse.json({
      url: parsed.data.url,
      summary: `${passed}/${analysis.checks.length} checks passed`,
      analysis,
    });
  } catch (err) {
    // analyzeWebsite is designed not to throw; this is a safety net.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
