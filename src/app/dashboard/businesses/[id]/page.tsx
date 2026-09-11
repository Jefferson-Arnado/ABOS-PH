import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Sparkles,
  Store,
} from "lucide-react";
import { getSessionUser } from "@/lib/supabase/clients";
import { getBusinessWithLatestAnalysis } from "@/lib/supabase/persist";
import { recommendServices } from "@/lib/scoring/recommendations";
import { TierIcon } from "@/components/tier-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueList } from "@/components/business/issue-list";
import { ReanalyzeButton } from "./reanalyze-button";
import { SaveLeadButton } from "./save-lead-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business analysis — Opportunity Scanner" };

const CHECK_LABELS: Record<string, string> = {
  https: "HTTPS",
  mobile_viewport: "Mobile viewport",
  metadata: "Title & meta description",
  contact_info: "Contact information",
  booking: "Online booking / reservations",
  ordering: "Online ordering",
  contact_form: "Contact form",
  response_time: "Response time",
  reachability: "Reachability",
};

const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Business website": Globe,
  "Online ordering": Store,
  "Reservation / booking system": Store,
  "Mobile-friendly redesign": Globe,
  "Website repair": Globe,
  "Contact form setup": Mail,
  "SEO / metadata setup": Sparkles,
  "Performance optimization": RefreshCw,
};

export default async function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/dashboard/businesses/${id}`);

  const scored = await getBusinessWithLatestAnalysis(id);
  if (!scored) notFound();

  const { business, analysis, opportunity } = scored;
  const services = recommendServices(opportunity.issues, opportunity.tier);
  // Back to the originating scan results (cards pass ?from=<scanId>).
  const backHref = from ? `/dashboard/scans/${encodeURIComponent(from)}` : "/dashboard";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to results
      </Link>

      {/* Score banner (spec §14) */}
      <div className="flex items-center gap-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex flex-col items-center">
          <span className="text-4xl font-semibold tracking-tight">
            {opportunity.score}
            <span className="text-lg text-muted-foreground">/100</span>
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            Opportunity score
          </span>
        </div>
        <div className="h-12 w-px bg-border" aria-hidden />
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-medium">
            <TierIcon tier={opportunity.tier} className="size-5" />
            {opportunity.tier.toUpperCase()} OPPORTUNITY
          </p>
          <p className="text-sm text-muted-foreground">{business.name}</p>
        </div>
        <ReanalyzeButton businessId={business.id} className="ml-auto" />
        <SaveLeadButton businessId={business.id} className="ml-2" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Business information (spec §14) */}
        <Card>
          <CardHeader>
            <CardTitle>Business information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <p className="flex items-center gap-2">
              <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {business.category ?? "Uncategorized"}
            </p>
            {business.address && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {business.address}
              </p>
            )}
            {business.phone && (
              <p className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={`tel:${business.phone}`} className="hover:underline">
                  {business.phone}
                </a>
              </p>
            )}
            {business.website ? (
              <p className="flex items-center gap-2">
                <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  Website
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </p>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Globe className="size-4 shrink-0" aria-hidden />
                No website found
              </p>
            )}
            <p className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Source: {business.source === "osm" ? "OpenStreetMap" : business.source}
            </p>
          </CardContent>
        </Card>

        {/* Problems (spec §14) */}
        <Card>
          <CardHeader>
            <CardTitle>Problems</CardTitle>
          </CardHeader>
          <CardContent>
            {opportunity.issues.length > 0 ? (
              <IssueList issues={opportunity.issues} max={0} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No major issues found — strong online presence.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Website analysis checks (spec §8 panel) */}
      {analysis && analysis.checks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Website analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {analysis.checks.map((check) => (
                <li key={check.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {CHECK_LABELS[check.id] ?? check.label}
                  </span>
                  <Badge
                    variant={
                      check.status === "pass"
                        ? "secondary"
                        : check.status === "warn"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {check.status === "pass" ? "pass" : check.status === "warn" ? "warn" : "fail"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommended services (spec §14) */}
      {services.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended services</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {services.map((service) => {
                const Icon = SERVICE_ICONS[service.name] ?? Sparkles;
                return (
                  <li key={service.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {service.name}
                    </span>
                    <Badge
                      variant={service.priority === "high" ? "destructive" : "outline"}
                      className="capitalize"
                    >
                      {service.priority}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AI analysis (spec §12) — arrives in Phase 9, top prospects only */}
      <Card>
        <CardHeader>
          <CardTitle>AI analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            AI-generated “why this business” analysis arrives in Phase 9 —
            reserved for the top-scored prospects to keep costs at zero.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
