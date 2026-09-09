import { CircleAlert, X } from "lucide-react";
import { ISSUE_LABELS } from "@/lib/scoring/opportunity-score";

/**
 * Issue rows for cards + the detail page (spec §13/§14): major gaps get an
 * ✕ (lucide X), soft gaps a warning triangle — the spec's ❌/⚠️ visual
 * language with lucide icons instead of emoji.
 */
const MAJOR_ISSUES: ReadonlySet<string> = new Set([
  ISSUE_LABELS.noWebsite,
  ISSUE_LABELS.websiteUnavailable,
  ISSUE_LABELS.noBooking,
  ISSUE_LABELS.noOrdering,
  ISSUE_LABELS.noMobileViewport,
]);

export function IssueList({
  issues,
  max = 3,
}: {
  issues: readonly string[];
  /** Show a cap (for cards); omit/0 to show all (detail page). */
  max?: number;
}) {
  const shown = max > 0 ? issues.slice(0, max) : issues;
  if (shown.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {shown.map((issue) => {
        const major = MAJOR_ISSUES.has(issue);
        const Icon = major ? X : CircleAlert;
        return (
          <li key={issue} className="flex items-center gap-2">
            <Icon
              className={
                major ? "size-3.5 shrink-0 text-destructive" : "size-3.5 shrink-0 text-yellow-600"
              }
              aria-hidden
            />
            {issue}
          </li>
        );
      })}
    </ul>
  );
}
