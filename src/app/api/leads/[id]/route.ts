/**
 * PATCH /api/leads/:id — update status/notes (spec §20). Owner-only via
 * the session user (404 for other users' leads — no existence leak).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { updateLead } from "@/lib/leads/lead-service";
import { LEAD_STATUSES } from "@/types/lead";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(2_000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  if (!parsed.data.status && parsed.data.notes === undefined) {
    return NextResponse.json(
      { error: "Nothing to update — provide status and/or notes" },
      { status: 400 }
    );
  }

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
    const lead = await updateLead(user.id, id, parsed.data);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead });
  } catch (err) {
    return NextResponse.json(
      { error: "Lead update failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
