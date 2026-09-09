import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe, ListFilter, SearchX } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/clients";
import { getScanById } from "@/lib/supabase/persist";
import { hasNoWebsite, hasWeakWebsite } from "@/lib/scanning/pipeline";
import { BusinessCard } from "@/components/business/business-card";
import { TierIcon } from "@/components/tier-icon";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan results — Opportunity Scanner" };

/** Filter tabs (spec §13): All / High / Medium / No Website / Weak Website. */
const FILTERS = ["all", "high", "medium", "no_website", "weak_website"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  high: "High",
  medium: "Medium",
  no_website: "No Website",
  weak_website: "Weak Website",
};

function matchesFilter(scored: Parameters<typeof hasNoWebsite>[0], filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "high":
      return scored.opportunity.tier === "high";
    case "medium":
      return scored.opportunity.tier === "medium";
    case "no_website":
      return hasNoWebsite(scored);
    case "weak_website":
      return hasWeakWebsite(scored);
  }
}

export default async function ScanResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; sort?: string }>;
}) {
  const [{ id }, { filter: filterParam, sort: sortParam }] = await Promise.all([
    params,
    searchParams,
  ]);

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/dashboard/scans/${id}`);

  const scan = await getScanById(id);
  // Ownership check: users see only their own scans (RLS mirrors this).
  if (!scan || scan.record.userId !== user.id) {
    redirect("/dashboard");
  }

  const filter: Filter = FILTERS.includes(filterParam as Filter)
    ? (filterParam as Filter)
    : "all";
  // Sort by opportunity score (spec §13) — direction toggles via ?sort=asc.
  const sortAsc = sortParam === "asc";

  const filtered = scan.businesses
    .filter((scored) => matchesFilter(scored, filter))
    .sort((a, b) =>
      sortAsc
        ? a.opportunity.score - b.opportunity.score
        : b.opportunity.score - a.opportunity.score
    );

  const { record, summary } = scan;
  const tabHref = (f: Filter) => `/dashboard/scans/${id}?filter=${f}${sortAsc ? "&sort=asc" : ""}`;
  const sortHref = `/dashboard/scans/${id}?filter=${filter}&sort=${sortAsc ? "desc" : "asc"}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Scan results</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {record.location} · {record.category} · {record.radius / 1000} km
        </h1>
        <p className="text-sm text-muted-foreground">
          {summary.businessesFound} businesses found ·{" "}
          <span className="font-medium text-foreground">
            {summary.opportunities} opportunities
          </span>
        </p>
      </div>

      {/* Filter tabs + sort (spec §13) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Filter results">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={tabHref(f)}
              aria-current={filter === f ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f === "high" || f === "medium" ? (
                <span className="inline-flex items-center gap-1.5">
                  <TierIcon tier={f} className="size-3.5" />
                  {FILTER_LABELS[f]}
                </span>
              ) : (
                FILTER_LABELS[f]
              )}
            </Link>
          ))}
        </nav>
        <Link
          href={sortHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ListFilter className="size-4" aria-hidden />
          Sort: Opportunity Score {sortAsc ? "↑" : "↓"}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
          {filter === "no_website" ? (
            <SearchX className="size-8 text-muted-foreground" aria-hidden />
          ) : (
            <Globe className="size-8 text-muted-foreground" aria-hidden />
          )}
          <p className="font-medium">Nothing in “{FILTER_LABELS[filter]}”</p>
          <p className="text-sm text-muted-foreground">
            Try another filter — or run a new scan from the{" "}
            <Link href="/dashboard" className="underline">
              search screen
            </Link>
            .
          </p>
        </div>
      ) : (
        <section className="space-y-3" aria-live="polite">
          <p className="text-sm text-muted-foreground">
            Showing {filtered.length}{" "}
            {filtered.length === 1 ? "business" : "businesses"}
          </p>
          <div className="space-y-3">
            {filtered.map((scored) => (
              <BusinessCard key={scored.business.id} scored={scored} scanId={id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
