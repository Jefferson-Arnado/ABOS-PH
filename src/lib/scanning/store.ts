/**
 * In-memory scan store — Phase 5 MVP without DB persistence (per user
 * decision, 2026-09-10): routes read/write process memory instead of
 * Supabase. ⚠️ Data is lost on server restart and per-serverless-instance;
 * `saveScan`/`saveAnalysis` are the single seam to swap in lib/supabase/
 * persistence later (PLAN.md Phase 5 checklist item, deferred).
 */

import type { ScoredBusiness } from "@/types/analysis";
import type { ScanRecord, ScanSummary } from "@/types/scan";

export interface StoredScan {
  record: ScanRecord;
  businesses: ScoredBusiness[];
  summary: ScanSummary;
}

const scans = new Map<string, StoredScan>();

/** Simple escalating id — unique within a process, fine for in-memory MVP. */
export function makeScanId(): string {
  scanIdSeq += 1;
  return `scan_${scanIdSeq}`;
}

let scanIdSeq = 0;

export function saveScan(stored: StoredScan): void {
  scans.set(stored.record.id, stored);
}

export function getScan(id: string): StoredScan | undefined {
  return scans.get(id);
}

export function listScans(): StoredScan[] {
  return [...scans.values()];
}

export function scanCount(): number {
  return scans.size;
}

/** Test-only: wipe the store between tests. */
export function clearScans(): void {
  scans.clear();
  scanIdSeq = 0;
}
