import Link from "next/link";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/business/score-badge";
import { IssueList } from "@/components/business/issue-list";
import { SaveLeadButton } from "@/app/dashboard/businesses/[id]/save-lead-button";
import type { ScoredBusiness } from "@/types/analysis";

/**
 * Business card for the results dashboard (spec §13): score badge, tier
 * icon, location, top issues, and the View Analysis + Save Lead actions.
 */
export function BusinessCard({
  scored,
  scanId,
}: {
  scored: ScoredBusiness;
  /** Originating scan — the detail page's back link returns here. */
  scanId?: string;
}) {
  const { business, opportunity } = scored;
  const detailHref = `/dashboard/businesses/${encodeURIComponent(
    business.id
  )}${scanId ? `?from=${encodeURIComponent(scanId)}` : ""}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <ScoreBadge opportunity={opportunity} />
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{business.name}</p>
          {business.address && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{business.address}</span>
            </p>
          )}
          <IssueList issues={opportunity.issues} max={3} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SaveLeadButton businessId={business.id} />
        <Button asChild variant="outline" size="sm">
          <Link href={detailHref}>View Analysis</Link>
        </Button>
      </div>
    </div>
  );
}
