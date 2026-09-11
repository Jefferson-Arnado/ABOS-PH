"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/types/lead";
import type { LeadStatus } from "@/types/lead";
import { updateLeadStatus } from "./update-lead-action";

/** Status dropdown for a lead (spec §15 pipeline), optimistic-free MVP. */
export function LeadStatusSelect({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const [state, action, pending] = useActionState(updateLeadStatus, {
    status,
  });

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <select
        name="status"
        defaultValue={state.status ?? status}
        disabled={pending}
        aria-label="Lead status"
        className="h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {pending && (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
      )}
    </form>
  );
}
