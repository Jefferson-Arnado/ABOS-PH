/**
 * POST /api/leads — Save Lead (spec §15, PLAN.md Phase 8). The session
 * user owns the lead; dedup comes from the DB's unique
 * (user_id, business_id) constraint — a duplicate save returns the
 * existing lead with 200 (idempotent) instead of creating a second row.
 *
 * Zod-validated; 401 without a session (same pattern as POST /api/scans).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createLead, listLeadsWithBusiness } from "@/lib/leads/lead-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  businessId: z.string().uuid(),
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

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fail fast when persistence isn't configured (same as POST /api/scans).
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
    const lead = await createLead(user.id, parsed.data.businessId);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Save lead failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** GET /api/leads — list the user's leads (used by the My Leads page via lib helper too). */
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
    return NextResponse.json({ leads });
  } catch (err) {
    return NextResponse.json(
      { error: "Leads query failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
