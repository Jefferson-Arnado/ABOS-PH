/** Scan request + record types. See docs/ARCHITECTURE.md §6. */

import type { Category } from "./business";

/** Opportunity types a user can filter on in the search screen (spec §3). */
export const OPPORTUNITY_TYPES = [
  "no_website",
  "weak_website",
  "no_online_booking",
  "poor_online_presence",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  no_website: "No Website",
  weak_website: "Weak Website",
  no_online_booking: "No Online Booking",
  poor_online_presence: "Poor Online Presence",
};

export interface ScanParams {
  /** Degrees north. */
  latitude: number;
  /** Degrees east. */
  longitude: number;
  /** Meters. */
  radius: number;
  category: Category;
  /** Optional post-scan filters (search screen checkboxes). */
  opportunityTypes?: OpportunityType[];
}

/** A persisted scan row (mirrors the `scans` table). */
export interface ScanRecord {
  id: string;
  userId: string;
  location: string;
  latitude: number;
  longitude: number;
  radius: number;
  category: Category;
  createdAt: string;
}

/** Aggregated counts shown on the results dashboard (spec §13). */
export interface ScanSummary {
  businessesFound: number;
  opportunities: number;
  high: number;
  medium: number;
  low: number;
  noWebsite: number;
  weakWebsite: number;
}
