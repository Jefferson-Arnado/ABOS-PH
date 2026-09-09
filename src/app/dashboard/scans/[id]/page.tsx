import { redirect } from "next/navigation";
import { Globe, SearchX } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/clients";
import { getScanById } from "@/lib/supabase/persist";
import { TierIcon } from "@/components/tier-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan results — Opportunity Scanner" };

/**
 * Minimal results view so the scan flow is complete end-to-end (Phase 6
 * "redirect to results view"). The full results dashboard with filter tabs
 * and business cards is Phase 7.
 */
export default async function ScanResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/dashboard/scans/${id}`);

  const scan = await getScanById(id);
  // Ownership check: users see only their own scans (RLS mirrors this).
  if (!scan || scan.record.userId !== user.id) {
    redirect("/dashboard");
  }

  const { record, summary, businesses } = scan;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Scan results</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {record.location} · {record.category} · {record.radius / 1000} km
        </h1>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {
          [
            { label: "Businesses found", value: summary.businessesFound },
            { label: "Opportunities", value: summary.opportunities },
            { label: "High", value: summary.high, icon: <TierIcon tier="high" /> },
            { label: "Medium", value: summary.medium, icon: <TierIcon tier="medium" /> },
            { label: "Low", value: summary.low, icon: <TierIcon tier="low" /> },
            {
              label: "No website",
              value: summary.noWebsite,
              icon: <SearchX className="size-4 text-muted-foreground" />,
            },
            {
              label: "Weak website",
              value: summary.weakWebsite,
              icon: <Globe className="size-4 text-muted-foreground" />,
            },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-lg border p-4">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {icon}
                {label}
              </dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))
        }
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Top prospects</h2>
        <ul className="divide-y rounded-lg border">
          {businesses.slice(0, 10).map((scored) => (
            <li
              key={scored.business.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TierIcon tier={scored.opportunity.tier} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{scored.business.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {scored.opportunity.issues.slice(0, 3).join(" · ") ||
                      "Strong online presence"}
                  </p>
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm">
                {scored.opportunity.score}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Full results dashboard arrives in Phase 7.
        </p>
      </section>
    </div>
  );
}
