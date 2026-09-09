/**
 * HTTP website check (spec §7) — does the site respond, and how healthy is it?
 * An unreachable site is a *result* (websiteExists + unavailable), never a
 * thrown error: one dead site must not break a 500-business scan
 * (docs/AGENTS.md §2 rule 7).
 */

import type { WebsiteAnalysis } from "@/types/analysis";

export interface WebsiteCheckOptions {
  fetchImpl?: typeof fetch;
  /** Milliseconds until the site is considered unreachable. */
  timeoutMs?: number;
  /** Sites slower than this get a "slow" warning (spec §8). */
  slowThresholdMs?: number;
  userAgent?: string;
}

const DEFAULT_UA =
  "ai-business-opportunity-scanner/0.1 (website quality analysis)";

export interface WebsiteCheckResult {
  url: string;
  finalUrl: string;
  websiteExists: boolean;
  statusCode?: number;
  https: boolean;
  responseTimeMs?: number;
  /** True when the site exists but fetch failed/timeout. */
  unavailable: boolean;
  /** HTML body when the site responded OK; absent otherwise. */
  html?: string;
  error?: string;
}

/**
 * Check a single website. Always resolves; use `unavailable`/`error` to
 * detect failure. Non-OK statuses still count as "exists" (a 500 or 404
 * page is a weak website, not a missing one) but flag unavailable when
 * the connection itself failed.
 */
export async function checkWebsite(
  url: string,
  options: WebsiteCheckOptions = {}
): Promise<WebsiteCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const slowThresholdMs = options.slowThresholdMs ?? 5_000;
  const userAgent = options.userAgent ?? DEFAULT_UA;

  // Ensure a scheme so bare domains work.
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const https = target.toLowerCase().startsWith("https://");

  const started = Date.now();
  try {
    const res = await fetchImpl(target, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": userAgent, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseTimeMs = Date.now() - started;

    let html: string | undefined;
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && contentType.includes("html")) {
      // Cap the body — we only need the homepage head + early content.
      const raw = await res.text();
      html = raw.slice(0, 500_000);
    }

    return {
      url: target,
      finalUrl: res.url || target,
      websiteExists: true,
      statusCode: res.status,
      https: new URL(res.url || target).protocol === "https:",
      responseTimeMs,
      unavailable: !res.ok,
      html,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      ...(responseTimeMs > slowThresholdMs ? { error: `Slow response (${responseTimeMs}ms)` } : {}),
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      url: target,
      finalUrl: target,
      websiteExists: true,
      https,
      responseTimeMs: Date.now() - started,
      unavailable: true,
      error: timedOut ? `Timed out after ${timeoutMs}ms` : "Connection failed",
    };
  }
}

/** Convenience: shape an unreachable-site result into a minimal analysis. */
export function unavailableAnalysis(
  result: WebsiteCheckResult
): Partial<WebsiteAnalysis> {
  return {
    websiteExists: true,
    statusCode: result.statusCode,
    https: result.https,
    responseTimeMs: result.responseTimeMs,
    unavailable: true,
  };
}
