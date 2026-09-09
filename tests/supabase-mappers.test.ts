import { describe, expect, it } from "vitest";

import type { BusinessRow } from "@/types/db";
import {
  analysisRowToWebsiteAnalysis,
  analysisToInsert,
  businessToInsert,
  rowToBusiness,
} from "@/lib/supabase/mappers";
import type { WebsiteAnalysis } from "@/types/analysis";

const ROW: BusinessRow = {
  id: "3f1d2c4e-0000-4000-8000-000000000001",
  name: "ABC Restaurant",
  category: "restaurants",
  address: "123 Rizal St, Davao",
  latitude: 7.0731,
  longitude: 125.6128,
  phone: "+63 917 123 4567",
  website: "https://abc.example",
  source: "osm",
  sourceId: "node/123",
  createdAt: "2026-09-10T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

describe("business mappers", () => {
  it("maps a Business to a business insert (snake_case)", () => {
    const insert = businessToInsert({
      ...rowToBusiness(ROW),
    });
    expect(insert).toEqual({
      name: "ABC Restaurant",
      category: "restaurants",
      address: "123 Rizal St, Davao",
      latitude: 7.0731,
      longitude: 125.6128,
      phone: "+63 917 123 4567",
      website: "https://abc.example",
      source: "osm",
      source_id: "node/123",
    });
  });

  it("nulls optional fields the business does not have", () => {
    const insert = businessToInsert({
      id: "x",
      name: "Bare",
      source: "osm",
      sourceId: "node/9",
    });
    expect(insert.category).toBeNull();
    expect(insert.website).toBeNull();
    expect(insert.latitude).toBeNull();
  });

  it("round-trips row → business → insert", () => {
    const business = rowToBusiness(ROW);
    expect(business.sourceId).toBe("node/123");
    const insert = businessToInsert(business);
    expect(insert.source_id).toBe(ROW.sourceId);
    expect(insert.name).toBe(ROW.name);
  });
});

describe("analysis mappers", () => {
  const analysis: WebsiteAnalysis = {
    websiteExists: true,
    statusCode: 200,
    https: true,
    responseTimeMs: 842,
    mobileViewport: true,
    bookingAvailable: false,
    orderingAvailable: false,
    hasContactForm: true,
    unavailable: false,
    checks: [],
  };

  it("flattens analysis + score into an insert row", () => {
    const insert = analysisToInsert(
      "biz-uuid",
      analysis,
      55,
      "medium",
      ["No online booking", "No online ordering"]
    );
    expect(insert).toMatchObject({
      business_id: "biz-uuid",
      website_exists: true,
      website_status: 200,
      https: true,
      mobile_friendly: true,
      booking_available: false,
      ordering_available: false,
      contact_form: true,
      opportunity_score: 55,
      opportunity_tier: "medium",
      issues: ["No online booking", "No online ordering"],
      response_time_ms: 842,
      unavailable: false,
    });
  });

  it("stores null analysis for no-website businesses (score-only row)", () => {
    const insert = analysisToInsert("biz-uuid", null, 80, "high", [
      "No website",
      "No online booking",
      "No online ordering",
    ]);
    expect(insert.website_exists).toBe(false);
    expect(insert.website_status).toBeNull();
    expect(insert.response_time_ms).toBeNull();
    expect(insert.unavailable).toBeNull();
  });

  it("reconstructs an unavailable analysis with a reachability check", () => {
    const rebuilt = analysisRowToWebsiteAnalysis({
      website_exists: true,
      website_status: null,
      https: null,
      mobile_friendly: null,
      booking_available: null,
      ordering_available: null,
      contact_form: null,
      issues: ["Website unavailable/broken"],
      response_time_ms: null,
      unavailable: true,
    });
    expect(rebuilt.unavailable).toBe(true);
    expect(rebuilt.checks).toEqual([
      { id: "reachability", label: "Site unreachable", status: "fail" },
    ]);
  });

  it("reconstructs fail checks for https/mobile flags", () => {
    const rebuilt = analysisRowToWebsiteAnalysis({
      website_exists: true,
      website_status: 200,
      https: false,
      mobile_friendly: false,
      booking_available: false,
      ordering_available: false,
      contact_form: null,
      issues: null,
      response_time_ms: 1200,
      unavailable: false,
    });
    expect(rebuilt.checks.map((c) => c.id)).toEqual(["https", "mobile_viewport"]);
    expect(rebuilt.responseTimeMs).toBe(1200);
  });
});
