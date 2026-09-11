/**
 * CSV export formatting (docs/PLAN.md Phase 8, spec §17) — pure string
 * functions, dependency-free so they unit-test trivially. Columns per spec:
 * Business, Category, Phone, Website, Score, Opportunity.
 */

export const CSV_HEADER = "Business,Category,Phone,Website,Score,Opportunity";

/** RFC 4180: quote fields containing commas/quotes/newlines; double inner quotes. */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** One flattened CSV row (nulls export as empty cells). */
export interface LeadCsvRow {
  businessName: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  score: number | null;
  opportunity: string;
}

export function leadCsvRowToString(row: LeadCsvRow): string {
  return [
    row.businessName,
    row.category ?? "",
    row.phone ?? "",
    row.website ?? "",
    row.score === null ? "" : String(row.score),
    row.opportunity,
  ]
    .map(csvEscape)
    .join(",");
}

export function leadRowsToCsv(rows: readonly LeadCsvRow[]): string {
  const lines = [CSV_HEADER, ...rows.map(leadCsvRowToString)];
  // CRLF per RFC 4180; trailing newline keeps spreadsheet imports happy.
  return lines.join("\r\n") + "\r\n";
}
