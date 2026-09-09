import { describe, expect, it } from "vitest";

import { recommendServices } from "@/lib/scoring/recommendations";
import { ISSUE_LABELS as I } from "@/lib/scoring/opportunity-score";

describe("recommendServices", () => {
  it("no-website business gets website + booking + ordering pitches", () => {
    const services = recommendServices(
      [I.noWebsite, I.noBooking, I.noOrdering],
      "high"
    );
    expect(services.map((s) => s.name)).toEqual([
      "Business website",
      "Online ordering",
      "Reservation / booking system",
    ]);
    expect(services.every((s) => s.priority === "high")).toBe(true);
  });

  it("a high-tier viewport gap is a high-priority redesign pitch", () => {
    const services = recommendServices([I.noMobileViewport], "high");
    expect(services).toEqual([
      { name: "Mobile-friendly redesign", priority: "high" },
    ]);
  });

  it("the same gap on a medium-tier business is lower priority", () => {
    const services = recommendServices([I.noMobileViewport], "medium");
    expect(services).toEqual([
      { name: "Mobile-friendly redesign", priority: "low" },
    ]);
  });

  it("low-priority-only rules stay low even for high-tier businesses", () => {
    const services = recommendServices(
      [I.noContactForm, I.missingMetadata, I.slowWebsite],
      "high"
    );
    expect(services.every((s) => s.priority === "low")).toBe(true);
    expect(services.map((s) => s.name)).toEqual([
      "Contact form setup",
      "SEO / metadata setup",
      "Performance optimization",
    ]);
  });

  it("sorts high-priority pitches first", () => {
    const services = recommendServices(
      [I.slowWebsite, I.noWebsite, I.noContactForm],
      "high"
    );
    const priorities = services.map((s) => s.priority);
    expect(priorities).toEqual([...priorities].sort());
    expect(services[0]?.name).toBe("Business website");
  });

  it("returns empty for a business with no issues", () => {
    expect(recommendServices([], "low")).toEqual([]);
  });
});
