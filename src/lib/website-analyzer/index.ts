/**
 * Website analyzer entry point — combines the HTTP check + HTML feature
 * extraction into a `WebsiteAnalysis` (docs/ARCHITECTURE.md §6), including
 * the per-check list the detail UI renders (spec §8 "Website Analysis").
 */

import type { AnalysisCheck, WebsiteAnalysis } from "@/types/analysis";
import { checkWebsite, type WebsiteCheckOptions } from "./analyzer";
import {
  detectAddress,
  detectBooking,
  detectContactForm,
  detectEmail,
  detectMobileViewport,
  detectOrdering,
  detectPhone,
  extractMetaDescription,
  extractTitle,
} from "./features";

export type AnalyzeWebsiteOptions = WebsiteCheckOptions;

/**
 * Analyze one website URL end-to-end. Never throws: unreachable sites
 * produce `websiteExists: true, unavailable: true` (weak website).
 */
export async function analyzeWebsite(
  url: string,
  options: AnalyzeWebsiteOptions = {}
): Promise<WebsiteAnalysis> {
  const check = await checkWebsite(url, options);

  // No analyzable homepage (connection failure, HTTP error page, or a 200
  // that isn't HTML) — still a (weak) online presence, but nothing to scan.
  if (!check.html) {
    return {
      websiteExists: true,
      statusCode: check.statusCode,
      https: check.https,
      responseTimeMs: check.responseTimeMs,
      unavailable: true,
      checks: [
        {
          id: "reachability",
          label: check.error ?? "Site unreachable",
          status: "fail",
          detail: check.url,
        },
      ],
    };
  }

  const html = check.html ?? "";
  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const mobileViewport = detectMobileViewport(html);
  const hasPhone = detectPhone(html);
  const hasEmail = detectEmail(html);
  const hasAddress = detectAddress(html);
  const bookingAvailable = detectBooking(html);
  const orderingAvailable = detectOrdering(html);
  const hasContactForm = detectContactForm(html);

  const checks: AnalysisCheck[] = [
    {
      id: "https",
      label: "HTTPS",
      status: check.https ? "pass" : "fail",
    },
    {
      id: "mobile_viewport",
      label: "Mobile viewport",
      status: mobileViewport ? "pass" : "fail",
    },
    {
      id: "metadata",
      label: "Title & meta description",
      status:
        title && metaDescription ? "pass" : title || metaDescription ? "warn" : "fail",
    },
    {
      id: "contact_info",
      label: "Contact information",
      status:
        hasPhone || hasEmail || hasAddress
          ? "pass"
          : "fail",
      detail: [
        hasPhone ? "phone" : null,
        hasEmail ? "email" : null,
        hasAddress ? "address" : null,
      ]
        .filter(Boolean)
        .join(", "),
    },
    {
      id: "booking",
      label: "Online booking / reservations",
      status: bookingAvailable ? "pass" : "fail",
    },
    {
      id: "ordering",
      label: "Online ordering",
      status: orderingAvailable ? "pass" : "fail",
    },
    {
      id: "contact_form",
      label: "Contact form",
      status: hasContactForm ? "pass" : "warn",
    },
  ];

  if (check.responseTimeMs != null) {
    checks.push({
      id: "response_time",
      label: "Response time",
      status: check.responseTimeMs > 5_000 ? "warn" : "pass",
      detail: `${check.responseTimeMs}ms`,
    });
  }

  return {
    websiteExists: true,
    statusCode: check.statusCode,
    https: check.https,
    responseTimeMs: check.responseTimeMs,
    mobileViewport,
    metaTitle: title,
    metaDescription,
    hasPhone,
    hasEmail,
    hasAddress,
    bookingAvailable,
    orderingAvailable,
    hasContactForm,
    unavailable: false,
    checks,
  };
}

export { checkWebsite } from "./analyzer";
export type { WebsiteCheckResult, WebsiteCheckOptions } from "./analyzer";
export {
  detectAddress,
  detectBooking,
  detectContactForm,
  detectEmail,
  detectMobileViewport,
  detectOrdering,
  detectPhone,
  extractMetaDescription,
  extractTitle,
} from "./features";
