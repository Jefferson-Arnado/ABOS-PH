"use server";

/**
 * Re-run the website analysis for one business (spec §20) from the detail
 * page. Server action → direct persistence call (no HTTP round trip),
 * then refresh so the latest analysis row renders.
 */

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getBusinessWithLatestAnalysis,
  insertAnalysis,
} from "@/lib/supabase/persist";
import { analyzeWebsite } from "@/lib/website-analyzer";
import { scoreOpportunity } from "@/lib/scoring/opportunity-score";
import { unavailableAnalysis } from "@/lib/scanning/pipeline";

export interface ReanalyzeState {
  error?: string;
  ok?: boolean;
}

export async function reanalyze(
  _prev: ReanalyzeState,
  formData: FormData
): Promise<ReanalyzeState> {
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

  const current = await getBusinessWithLatestAnalysis(businessId);
  if (!current) {
    return { error: "Business not found" };
  }

  let analysis = null;
  if (current.business.website) {
    analysis = await analyzeWebsite(current.business.website, {
      timeoutMs: 10_000,
    });
  }

  const opportunity = scoreOpportunity({
    business: current.business,
    analysis,
  });
  await insertAnalysis(businessId, {
    business: current.business,
    analysis: analysis ?? unavailableAnalysis(),
    opportunity,
  });

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { ok: true };
}
