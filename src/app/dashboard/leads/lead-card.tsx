import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { TierIcon } from "@/components/tier-icon";
import { Badge } from "@/components/ui/badge";
import { opportunityLabel } from "@/lib/leads/summary";
import type { LeadWithBusiness } from "@/lib/leads/lead-service";
import { LeadStatusSelect } from "./status-select";

/** One row of the My Leads dashboard: business, score, status control. */
export function LeadCard({ entry }: { entry: LeadWithBusiness }) {
  const { lead, business, score, tier } = entry;
  const detailHref = `/dashboard/businesses/${encodeURIComponent(
    business.id
  )}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2">
          <Link
            href={detailHref}
            className="truncate font-medium hover:underline"
          >
            {business.name}
          </Link>
          {score !== null && (
            <Badge variant="secondary" className="shrink-0">
              {tier && <TierIcon tier={tier} className="size-3" />}
              {score}/100
            </Badge>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {business.category && <span>{business.category}</span>}
          {business.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden />
              {business.phone}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {opportunityLabel({
              website: business.website,
              analysis: {
                unavailable: entry.analysisFlags.unavailable,
                https: entry.analysisFlags.https,
                mobileViewport: entry.analysisFlags.mobileFriendly,
              },
              tier,
            })}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LeadStatusSelect leadId={lead.id} status={lead.status} />
      </div>
    </div>
  );
}
