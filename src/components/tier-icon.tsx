import type { LucideIcon } from "lucide-react";
import { Circle, CircleAlert, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpportunityTier } from "@/types/analysis";

/**
 * Icons for the opportunity tiers (spec §10) — replaces the emoji
 * 🔥 / 🟡 / 🟢 with lucide icons so they render consistently on every
 * platform and inherit the theme colors.
 */
const TIER_ICONS: Record<OpportunityTier, LucideIcon> = {
  high: Flame,
  medium: CircleAlert,
  low: Circle,
};

const TIER_CLASSES: Record<OpportunityTier, string> = {
  high: "text-destructive",
  medium: "text-yellow-600",
  low: "text-emerald-600",
};

export function TierIcon({
  tier,
  className,
}: {
  tier: OpportunityTier;
  className?: string;
}) {
  const Icon = TIER_ICONS[tier];
  return <Icon className={cn("size-4 shrink-0", TIER_CLASSES[tier], className)} aria-label={tier} />;
}
