import { describe, expect, it } from "vitest";

import {
  CSV_HEADER,
  csvEscape,
  leadCsvRowToString,
  leadRowsToCsv,
  type LeadCsvRow,
} from "@/lib/leads/csv";
import { opportunityLabel, summarizeLeads } from "@/lib/leads/summary";
import { LEAD_STATUSES } from "@/types/lead";
import type { Lead } from "@/types/lead";

const ROW: LeadCsvRow = {
  businessName: "ABC Restaurant",
  category: "restaurants",
  phone: "+63 917 123 4567",
  website: "https://abc.example",
  score: 92,
  opportunity: "No Website",
};

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("+63 917 123 4567")).toBe("+63 917 123 4567");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(csvEscape("Jollibee, Davao")).toBe('"Jollibee, Davao"');
    expect(csvEscape('The "Best" Cafe')).toBe('"The ""Best"" Cafe"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("leadCsvRowToString", () => {
  it("formats the spec §17 example row", () => {
    expect(leadCsvRowToString(ROW)).toBe(
      "ABC Restaurant,restaurants,+63 917 123 4567,https://abc.example,92,No Website"
    );
  });

  it("exports nulls as empty cells", () => {
    expect(
      leadCsvRowToString({
        ...ROW,
        category: null,
        phone: null,
        website: null,
        score: null,
      })
    ).toBe("ABC Restaurant,,,,,No Website");
  });

  it("escapes names with commas", () => {
    expect(leadCsvRowToString({ ...ROW, businessName: "Cafe, Inc" })).toBe(
      '"Cafe, Inc",restaurants,+63 917 123 4567,https://abc.example,92,No Website'
    );
  });
});

describe("leadRowsToCsv", () => {
  it("emits the header + CRLF line endings + trailing newline", () => {
    const csv = leadRowsToCsv([ROW]);
    expect(csv.startsWith(CSV_HEADER + "\r\n")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3); // header + 1 row + trailing empty
  });

  it("handles an empty lead list (header only)", () => {
    expect(leadRowsToCsv([])).toBe(CSV_HEADER + "\r\n");
  });

  it("matches the spec §17 two-row example shape", () => {
    const csv = leadRowsToCsv([
      ROW,
      {
        businessName: "XYZ Dental",
        category: "dental",
        phone: "+63 918 000 0000",
        website: "https://xyz.example",
        score: 81,
        opportunity: "Weak Website",
      },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toContain("ABC Restaurant");
    expect(lines[2]).toContain("XYZ Dental");
  });
});

describe("opportunityLabel", () => {
  it("labels missing websites as No Website regardless of tier", () => {
    expect(
      opportunityLabel({ website: null, analysis: null, tier: "high" })
    ).toBe("No Website");
    expect(
      opportunityLabel({ website: "", analysis: null, tier: null })
    ).toBe("No Website");
  });

  it("labels unreachable / non-HTTPS / non-mobile sites as Weak Website", () => {
    const base = { website: "https://x.example", tier: "medium" as const };
    expect(
      opportunityLabel({
        ...base,
        analysis: { unavailable: true, https: true, mobileViewport: true },
      })
    ).toBe("Weak Website");
    expect(
      opportunityLabel({
        ...base,
        analysis: { unavailable: false, https: false, mobileViewport: true },
      })
    ).toBe("Weak Website");
    expect(
      opportunityLabel({
        ...base,
        analysis: { unavailable: false, https: true, mobileViewport: false },
      })
    ).toBe("Weak Website");
  });

  it("labels healthy sites by tier", () => {
    expect(
      opportunityLabel({
        website: "https://x.example",
        analysis: { unavailable: false, https: true, mobileViewport: true },
        tier: "high",
      })
    ).toBe("High Opportunity");
    expect(
      opportunityLabel({
        website: "https://x.example",
        analysis: null,
        tier: "low",
      })
    ).toBe("Low Opportunity");
    expect(
      opportunityLabel({ website: "https://x.example", analysis: null, tier: null })
    ).toBe("Low Opportunity");
  });
});

describe("summarizeLeads", () => {
  function lead(status: (typeof LEAD_STATUSES)[number], i: number): Lead {
    return {
      id: `lead-${i}`,
      userId: "u1",
      businessId: `biz-${i}`,
      status,
      notes: null,
      createdAt: "2026-09-11T00:00:00Z",
      updatedAt: "2026-09-11T00:00:00Z",
    };
  }

  it("counts totals and by-status buckets", () => {
    const summary = summarizeLeads([
      lead("new", 1),
      lead("new", 2),
      lead("contacted", 3),
      lead("won", 4),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.byStatus.new).toBe(2);
    expect(summary.byStatus.contacted).toBe(1);
    expect(summary.byStatus.won).toBe(1);
    expect(summary.byStatus.lost).toBe(0);
  });

  it("returns all zeros for an empty list", () => {
    const summary = summarizeLeads([]);
    expect(summary.total).toBe(0);
    for (const s of LEAD_STATUSES) {
      expect(summary.byStatus[s]).toBe(0);
    }
  });
});
