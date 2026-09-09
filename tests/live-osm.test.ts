/**
 * LIVE integration test — hits the real Overpass API.
 * Skipped unless RUN_LIVE_TESTS=1 (keeps `npm run test` offline/deterministic).
 *
 * Run: RUN_LIVE_TESTS=1 npx vitest run tests/live-osm.test.ts
 */

import { describe, expect, it } from "vitest";

import { createOsmProvider } from "@/lib/business-providers/osm";
import type { SearchParams } from "@/types/business";

const RUN_LIVE = process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!RUN_LIVE)("live Overpass API", () => {
  it(
    "returns normalized restaurants within 10km of Davao City (Phase 2 gate)",
    { timeout: 90_000 },
    async () => {
      const provider = createOsmProvider({ timeoutMs: 60_000 });
      const params: SearchParams = {
        latitude: 7.0731,
        longitude: 125.6128,
        radius: 10_000,
        category: "restaurants",
      };

      const results = await provider.search(params);

      console.log(`live Overpass returned ${results.length} businesses`);
      expect(results.length).toBeGreaterThan(0);

      const withWebsite = results.filter((b) => b.website);
      const withPhone = results.filter((b) => b.phone);
      console.log(
        `  with website: ${withWebsite.length}, with phone: ${withPhone.length}`
      );

      for (const b of results.slice(0, 5)) {
        expect(b.name).toBeTruthy();
        expect(b.source).toBe("osm");
        expect(b.sourceId).toMatch(/^(node|way|relation)\/\d+$/);
      }
    }
  );
});
