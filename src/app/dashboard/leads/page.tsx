import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, NotebookPen } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/clients";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  listLeadsWithBusiness,
  type LeadWithBusiness,
} from "@/lib/leads/lead-service";
import { summarizeLeads } from "@/lib/leads/summary";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/types/lead";
import { LeadCard } from "./lead-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Leads — Opportunity Scanner" };

export default async function LeadsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/leads");

  let leads: LeadWithBusiness[] = [];
  let loadError: string | null = null;
  try {
    getSupabaseAdmin();
    leads = await listLeadsWithBusiness(user.id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const summary = summarizeLeads(leads.map((entry) => entry.lead));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Pipeline</p>
          <h1 className="text-2xl font-semibold tracking-tight">My Leads</h1>
          <p className="text-sm text-muted-foreground">
            {summary.total} {summary.total === 1 ? "lead" : "leads"} saved
          </p>
        </div>
        <Link
          href="/api/leads/export"
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          <Download className="size-4" aria-hidden />
          Export CSV
        </Link>
      </div>

      {/* Status totals (spec §16) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-2xl font-semibold tracking-tight">{summary.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        {LEAD_STATUSES.map((status) => (
          <div
            key={status}
            className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <p className="text-2xl font-semibold tracking-tight">
              {summary.byStatus[status]}
            </p>
            <p className="text-xs text-muted-foreground">
              {LEAD_STATUS_LABELS[status]}
            </p>
          </div>
        ))}
      </div>

      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load leads</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
        </div>
      )}

      {!loadError && leads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <NotebookPen className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No leads yet</p>
          <p className="text-sm text-muted-foreground">
            Run a scan and hit{" "}
            <span className="font-medium">Save Lead</span> on a promising
            business.
          </p>
        </div>
      ) : (
        <section className="space-y-3" aria-live="polite">
          {leads.map((entry) => (
            <LeadCard key={entry.lead.id} entry={entry} />
          ))}
        </section>
      )}
    </div>
  );
}
