"use server";

/**
 * Save Lead server action (spec §15, PLAN.md Phase 8) — called from the
 * business card (results) and the detail page. Direct persistence call,
 * no HTTP round trip; dedup is idempotent (existing lead returned).
 */

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createLead } from "@/lib/leads/lead-service";

export interface SaveLeadState {
  error?: string;
  /** Set when saved — either fresh or already-existing (idempotent). */
  ok?: boolean;
  alreadySaved?: boolean;
}

export async function saveLead(
  _prev: SaveLeadState,
  formData: FormData
): Promise<SaveLeadState> {
  const businessId = formData.get("businessId")?.toString() ?? "";
  if (!businessId) {
    return { error: "Missing business id" };
  }

  const user = await getSessionUser();
  if (!user) {
    return { error: "Not authenticated" };
  }
  // Service-role client is the persistence path; the session check above
  // is the authorization gate (AGENTS §2 rule 5).
  getSupabaseAdmin();

  try {
    await createLead(user.id, businessId);
    revalidatePath("/dashboard/leads");
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save lead",
    };
  }
}
