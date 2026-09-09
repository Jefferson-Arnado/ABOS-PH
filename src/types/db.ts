/**
 * Row types mirroring the Supabase schema (supabase/migrations/0001_init.sql).
 * Snake_case DB columns map to camelCase app fields; converters live in
 * lib/supabase/ (Phase 5). Keep in sync with the migration.
 */

import type { BusinessSource, Category } from "./business";
import type { LeadStatus } from "./lead";
import type { OpportunityTier } from "./analysis";

export type Uuid = string;
export type IsoDateTime = string;

export interface ProfileRow {
  id: Uuid;
  email: string;
  name: string | null;
  createdAt: IsoDateTime;
}

export interface ScanRow {
  id: Uuid;
  userId: Uuid;
  location: string;
  latitude: number;
  longitude: number;
  /** Meters. */
  radius: number;
  category: Category;
  createdAt: IsoDateTime;
}

export interface BusinessRow {
  id: Uuid;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  source: BusinessSource;
  sourceId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** The `analysis` JSONB column stores an AiAnalysis (spec §12). */
export interface BusinessAnalysisRow {
  id: Uuid;
  businessId: Uuid;
  websiteExists: boolean;
  /** HTTP status; null when the site has no website or never responded. */
  websiteStatus: number | null;
  https: boolean | null;
  mobileFriendly: boolean | null;
  bookingAvailable: boolean | null;
  orderingAvailable: boolean | null;
  contactForm: boolean | null;
  opportunityScore: number;
  opportunityTier: OpportunityTier;
  analysis: unknown | null;
  createdAt: IsoDateTime;
}

export interface LeadRow {
  id: Uuid;
  userId: Uuid;
  businessId: Uuid;
  status: LeadStatus;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
