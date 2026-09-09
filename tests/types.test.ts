import { describe, expect, it } from "vitest";

import {
  BUSINESS_SOURCES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_OSM_TAGS,
} from "@/types/business";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS } from "@/types/scan";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/types/lead";

describe("CATEGORIES", () => {
  it("contains exactly the 10 V1 categories (spec §3)", () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(10);
    expect(Object.keys(CATEGORY_OSM_TAGS)).toHaveLength(10);
  });

  it("maps every category to at least one OSM tag with key=value shape", () => {
    for (const category of CATEGORIES) {
      const tags = CATEGORY_OSM_TAGS[category];
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).toMatch(/^[a-z_]+=[a-z_]+$/);
      }
    }
  });

  it("has a human label for every category", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});

describe("OPPORTUNITY_TYPES", () => {
  it("contains the 4 search-screen checkboxes (spec §3)", () => {
    expect(OPPORTUNITY_TYPES).toEqual([
      "no_website",
      "weak_website",
      "no_online_booking",
      "poor_online_presence",
    ]);
    for (const type of OPPORTUNITY_TYPES) {
      expect(OPPORTUNITY_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe("LEAD_STATUSES", () => {
  it("contains the 6 statuses in pipeline order (spec §15)", () => {
    expect(LEAD_STATUSES).toEqual([
      "new",
      "contacted",
      "interested",
      "proposal",
      "won",
      "lost",
    ]);
    for (const status of LEAD_STATUSES) {
      expect(LEAD_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("BUSINESS_SOURCES", () => {
  it("supports OSM now and Google later", () => {
    expect(BUSINESS_SOURCES).toEqual(["osm", "google"]);
  });
});
