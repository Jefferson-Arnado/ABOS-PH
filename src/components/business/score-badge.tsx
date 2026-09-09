import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OpportunityResult } from "@/types/analysis";

const TIER_BADGE_CLASSES = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-yellow-600/10 text-yellow-700 dark:text-yellow-500",
  low: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-500",
} as const;

const TIER_LABELS = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
} as const;

/**
 * Score badge for business cards (spec §13): score + tier label.
 * Colors mirror TierIcon so the two read as one system.
 */
export function ScoreBadge({
  opportunity,
  className,
}: {
  opportunity: OpportunityResult;
  className?: string;
}) {
  return (
    <Badge
      className={cn(
        "h-auto gap-1 px-2 py-1 font-mono text-sm",
        TIER_BADGE_CLASSES[opportunity.tier],
        className
      )}
    >
      {opportunity.score}
      <span className="text-[10px] font-sans opacity-80">
        {TIER_LABELS[opportunity.tier]}
      </span>
    </Badge>
  );
}
