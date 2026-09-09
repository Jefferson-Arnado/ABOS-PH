/**
 * LIVE integration test — analyzes real websites over the network.
 * Skipped unless RUN_LIVE_TESTS=1 (keeps `npm run test` offline).
 *
 * Run: RUN_LIVE_TESTS=1 npx vitest run tests/live-website-analyzer.test.ts
 */

import { describe, expect, it } from "vitest";

import { analyzeWebsite } from "@/lib/website-analyzer";

const RUN_LIVE = process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!RUN_LIVE)("live website analysis", () => {
  it(
    "analyzes a real, healthy website (Phase 3 gate)",
    { timeout: 30_000 },
    async () => {
      const analysis = await analyzeWebsite("https://www.jollibee.com.ph", {
        timeoutMs: 15_000,
      });

      console.log(
        `jollibee.com.ph → status ${analysis.statusCode}, https=${analysis.https}, ${analysis.responseTimeMs}ms`
      );
      expect(analysis.websiteExists).toBe(true);
      expect(analysis.https).toBe(true);
      expect(analysis.checks.length).toBeGreaterThan(3);
    }
  );

  it(
    "handles a dead domain gracefully",
    { timeout: 30_000 },
    async () => {
      const analysis = await analyzeWebsite(
        "https://this-domain-should-not-exist-scanner-test.com",
        { timeoutMs: 10_000 }
      );

      expect(analysis.websiteExists).toBe(true);
      expect(analysis.unavailable).toBe(true);
      expect(analysis.checks[0].status).toBe("fail");
    }
  );
});
