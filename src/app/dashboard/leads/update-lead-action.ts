"use server";

/**
 * Lead status update server action (spec §15) — PATCH-equivalent direct
 * persistence call from the My Leads page.
 */

import { revalidatePath } from "next/cache";
import { LEAD_STATUSES } from "@/types/lead";
import type { LeadStatus } from "@/types/lead";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { updateLead } from "@/lib/leads/lead-service";

export interface UpdateLeadStatusState {
  error?: string;
  status?: LeadStatus;
}

export async function updateLeadStatus(
  _prev: UpdateLeadStatusState,
  formData: FormData
): Promise<UpdateLeadStatusState> {
  const leadId = formData.get("leadId")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  if (!leadId || !LEAD_STATUSES.includes(status as LeadStatus)) {
    return { error: "Invalid lead update" };
  }

  const user = await getSessionUser();
  if (!user) {
    return { error: "Not authenticated" };
  }
  getSupabaseAdmin();

  try {
    const updated = await updateLead(user.id, leadId, {
      status: status as LeadStatus,
    });
    if (!updated) {
      return { error: "Lead not found" };
    }
    revalidatePath("/dashboard/leads");
    return { status: updated.status };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not update lead",
    };
  }
}
