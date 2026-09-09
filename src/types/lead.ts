/** Lead types. Statuses per spec §15. See docs/ARCHITECTURE.md §6. */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "proposal",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** UI display labels (DB stores the lowercase enum value). */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

/** A persisted lead row (mirrors the `leads` table). */
export interface Lead {
  id: string;
  userId: string;
  businessId: string;
  status: LeadStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Counts by status for the My Leads dashboard (spec §16). */
export interface LeadSummary {
  total: number;
  byStatus: Record<LeadStatus, number>;
}
