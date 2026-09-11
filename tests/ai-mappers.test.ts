import { describe, expect, it } from "vitest";

import { aiAnalysisFromJson } from "@/lib/supabase/mappers";

describe("aiAnalysisFromJson", () => {
  it("validates a well-formed AI payload", () => {
    const ai = aiAnalysisFromJson({
      whyGoodProspect: "Strong local presence, no website.",
      recommendedServices: [
        { name: "Business website", priority: "high" },
        { name: "Booking", priority: "bogus" },
      ],
      salesAngle: "Lead with bookings.",
    });
    expect(ai).not.toBeNull();
    expect(ai?.recommendedServices).toEqual([
      { name: "Business website", priority: "high" },
      { name: "Booking", priority: "medium" },
    ]);
  });

  it("returns null for null / non-object / malformed payloads", () => {
    expect(aiAnalysisFromJson(null)).toBeNull();
    expect(aiAnalysisFromJson("text")).toBeNull();
    expect(aiAnalysisFromJson({ salesAngle: "only angle" })).toBeNull();
    expect(aiAnalysisFromJson({ whyGoodProspect: " ", salesAngle: "s" })).toBeNull();
  });

  it("drops malformed service entries and tolerates a missing array", () => {
    const ai = aiAnalysisFromJson({
      whyGoodProspect: "w",
      recommendedServices: ["junk", null, { priority: "high" }],
      salesAngle: "s",
    });
    expect(ai?.recommendedServices).toEqual([]);

    const noServices = aiAnalysisFromJson({
      whyGoodProspect: "w",
      salesAngle: "s",
    });
    expect(noServices?.recommendedServices).toEqual([]);
  });
});
