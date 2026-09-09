import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzeWebsite,
  checkWebsite,
  detectAddress,
  detectBooking,
  detectContactForm,
  detectEmail,
  detectMobileViewport,
  detectOrdering,
  detectPhone,
  extractMetaDescription,
  extractTitle,
} from "@/lib/website-analyzer";
import type { WebsiteCheckResult } from "@/lib/website-analyzer";

const loadFixture = (name: string) =>
  readFileSync(join("tests/fixtures/html", name), "utf8");

const modernHtml = loadFixture("modern-site.html");
const weakHtml = loadFixture("weak-site.html");

/** Mock fetch returning an HTML page. */
function fetchReturning(html: string, init: { status?: number; contentType?: string; finalUrl?: string } = {}) {
  const { status = 200, contentType = "text/html; charset=utf-8", finalUrl = "https://example.com/" } = init;
  return vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 400,
        status,
        url: finalUrl,
        headers: new Headers({ "content-type": contentType }),
        text: async () => html,
      }) as unknown as Response
  );
}

/** Mock fetch that never connects. */
const fetchFailing = (error: Error) =>
  vi.fn(async () => {
    throw error;
  }) as unknown as typeof fetch;

describe("feature extraction", () => {
  it("modern site: all content checks pass", () => {
    expect(detectMobileViewport(modernHtml)).toBe(true);
    expect(extractTitle(modernHtml)).toBe("ABC Dental Clinic — Davao City");
    expect(extractMetaDescription(modernHtml)).toBe(
      "Modern dental care in Davao City. Book your appointment online today."
    );
    expect(detectPhone(modernHtml)).toBe(true);
    expect(detectEmail(modernHtml)).toBe(true);
    expect(detectAddress(modernHtml)).toBe(true);
  });

  it("modern site: booking, ordering-independent form detected", () => {
    expect(detectBooking(modernHtml)).toBe(true); // "Book an appointment"
    expect(detectContactForm(modernHtml)).toBe(true); // <form + "send us a message"
    expect(detectOrdering(modernHtml)).toBe(false); // no food-ordering signals
  });

  it("weak site: no viewport, no meta, minimal contacts", () => {
    expect(detectMobileViewport(weakHtml)).toBe(false);
    expect(extractMetaDescription(weakHtml)).toBeUndefined();
    expect(extractTitle(weakHtml)).toBe("Welcome");
    expect(detectPhone(weakHtml)).toBe(true); // (082) 123-4567
    expect(detectEmail(weakHtml)).toBe(false);
    expect(detectBooking(weakHtml)).toBe(false);
    expect(detectOrdering(weakHtml)).toBe(false);
    expect(detectContactForm(weakHtml)).toBe(false);
  });

  it("phone patterns cover PH formats", () => {
    expect(detectPhone('<a href="tel:+639171234567">call</a>')).toBe(true);
    expect(detectPhone("<p>Globe: 0917 123 4567</p>")).toBe(true);
    expect(detectPhone("<p>+63 82 123 4567</p>")).toBe(true);
    expect(detectPhone("<p>no number here</p>")).toBe(false);
  });

  it("email detection avoids random @ symbols", () => {
    expect(detectEmail('<a href="mailto:info@biz.ph">mail</a>')).toBe(true);
    expect(detectEmail("<p>email us at info@biz.ph today</p>")).toBe(true);
    expect(detectEmail("<p>follow @handle on twitter</p>")).toBe(false);
  });
});

describe("checkWebsite (HTTP)", () => {
  it("measures response time and normalizes bare domains", async () => {
    const fetchMock = fetchReturning(modernHtml, {
      finalUrl: "https://example.com/",
    });
    const result = await checkWebsite("example.com", { fetchImpl: fetchMock as unknown as typeof fetch });

    expect(result.websiteExists).toBe(true);
    expect(result.unavailable).toBe(false);
    expect(result.statusCode).toBe(200);
    expect(result.https).toBe(true);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.html).toContain("ABC Dental Clinic");

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.com");
  });

  it("treats HTTP error pages as existing-but-unavailable", async () => {
    const fetchMock = fetchReturning("<h1>Server error</h1>", { status: 500 });
    const result = await checkWebsite("https://broken.example.com", {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result.websiteExists).toBe(true);
    expect(result.unavailable).toBe(true);
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe("HTTP 500");
  });

  it("returns unavailable result on connection failure (no throw)", async () => {
    const fetchMock = fetchFailing(new Error("ECONNREFUSED"));
    const result = await checkWebsite("https://dead.example.com", {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result.websiteExists).toBe(true);
    expect(result.unavailable).toBe(true);
    expect(result.error).toBe("Connection failed");
    expect(result.html).toBeUndefined();
  });

  it("reports timeouts as unavailable", async () => {
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "TimeoutError";
    const result = await checkWebsite("https://slow.example.com", {
      fetchImpl: fetchFailing(timeoutError),
      timeoutMs: 10,
    });
    expect(result.unavailable).toBe(true);
    expect(result.error).toContain("Timed out");
  });
});

describe("analyzeWebsite (combined)", () => {
  it("modern site: checks pass, analysis fields populated", async () => {
    const analysis = await analyzeWebsite("https://abcdental.ph", {
      fetchImpl: fetchReturning(modernHtml) as unknown as typeof fetch,
    });

    expect(analysis.websiteExists).toBe(true);
    expect(analysis.unavailable).toBe(false);
    expect(analysis.mobileViewport).toBe(true);
    expect(analysis.bookingAvailable).toBe(true);
    expect(analysis.hasContactForm).toBe(true);
    expect(analysis.hasPhone).toBe(true);

    const byId = Object.fromEntries(analysis.checks.map((c) => [c.id, c.status]));
    expect(byId.https).toBe("pass");
    expect(byId.mobile_viewport).toBe("pass");
    expect(byId.metadata).toBe("pass");
    expect(byId.contact_info).toBe("pass");
    expect(byId.booking).toBe("pass");
    expect(byId.ordering).toBe("fail"); // modern dental site, no ordering
    expect(byId.contact_form).toBe("pass");
    expect(byId.response_time).toBe("pass");
  });

  it("weak site: checks fail correctly", async () => {
    const analysis = await analyzeWebsite("http://xyzrestaurant.com", {
      fetchImpl: fetchReturning(weakHtml, { finalUrl: "http://xyzrestaurant.com/" }) as unknown as typeof fetch,
    });

    expect(analysis.https).toBe(false);
    expect(analysis.mobileViewport).toBe(false);
    expect(analysis.metaDescription).toBeUndefined();
    expect(analysis.hasPhone).toBe(true);
    expect(analysis.bookingAvailable).toBe(false);

    const byId = Object.fromEntries(analysis.checks.map((c) => [c.id, c.status]));
    expect(byId.https).toBe("fail");
    expect(byId.mobile_viewport).toBe("fail");
    expect(byId.metadata).toBe("warn"); // title but no meta description (spec: ⚠️)
    expect(byId.contact_info).toBe("pass"); // has phone
    expect(byId.booking).toBe("fail");
  });

  it("unreachable site: minimal analysis with fail check", async () => {
    const analysis = await analyzeWebsite("https://dead.example.com", {
      fetchImpl: fetchFailing(new Error("ECONNREFUSED")) as unknown as typeof fetch,
    });

    expect(analysis.websiteExists).toBe(true);
    expect(analysis.unavailable).toBe(true);
    expect(analysis.checks).toHaveLength(1);
    expect(analysis.checks[0].id).toBe("reachability");
    expect(analysis.checks[0].status).toBe("fail");
  });

  it("non-HTML responses skip content checks", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          url: "https://files.example.com/doc.pdf",
          headers: new Headers({ "content-type": "application/pdf" }),
          text: async () => "%PDF-1.4",
        }) as unknown as Response
    );
    const analysis = await analyzeWebsite("https://files.example.com/doc.pdf", {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(analysis.unavailable).toBe(true);
    expect(analysis.checks[0].id).toBe("reachability");
  });
});

// Keep the type import used (WebsiteCheckResult referenced in docs).
export type { WebsiteCheckResult };
