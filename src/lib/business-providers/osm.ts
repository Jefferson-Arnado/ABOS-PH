/**
 * OpenStreetMapProvider — business data via the Overpass API ($0 stack).
 *
 * Design notes:
 * - Queries are built from CATEGORY_OSM_TAGS config (never hardcoded logic,
 *   per docs/AGENTS.md §8).
 * - Empty results are a valid outcome ([]); network/HTTP failures throw
 *   ProviderError so the scan pipeline can decide how to degrade.
 * - Requests are retried once on 429/504 to stay Overpass-friendly.
 * - fetchImpl/endpoint/timings are injectable for fixtures-based tests.
 */

import type { Business, SearchParams } from "@/types/business";
import { CATEGORY_OSM_TAGS } from "@/types/business";
import { ProviderError, type BusinessProvider } from "./types";

/** Default public Overpass endpoint (override with OVERPASS_URL). */
export const DEFAULT_OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

/**
 * Overpass rejects requests without a User-Agent (HTTP 406). Set
 * OVERPASS_USER_AGENT to include real contact info per Overpass etiquette.
 */
export const DEFAULT_USER_AGENT = "ai-business-opportunity-scanner/0.1 (OSM data via Overpass API)";

/** Injectables for testing and tuning — everything optional. */
export interface OsmProviderOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Milliseconds until an individual fetch attempt is abandoned. */
  timeoutMs?: number;
  /** Delay before the single retry on 429/504. */
  retryDelayMs?: number;
}

/** Raw Overpass element (subset of fields we consume). */
export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Minimal Overpass JSON response shape. */
export interface OverpassResponse {
  elements?: OsmElement[];
}

/** Extract `key=value` pairs from CATEGORY_OSM_TAGS entries. */
export function parseOsmTag(tag: string): { key: string; value: string } {
  const idx = tag.indexOf("=");
  if (idx <= 0) throw new Error(`Invalid OSM tag: "${tag}"`);
  return { key: tag.slice(0, idx), value: tag.slice(idx + 1) };
}

/** Build an Overpass QL query for one category around a point. */
export function buildOverpassQuery(params: SearchParams): string {
  const tags = CATEGORY_OSM_TAGS[params.category as keyof typeof CATEGORY_OSM_TAGS];
  if (!tags || tags.length === 0) {
    throw new Error(`No OSM tags configured for category "${params.category}"`);
  }

  // One union branch per tag; each searches nodes, ways, and relations
  // ("nwr") around the point. Around-radius is in meters.
  const branches = tags
    .map((tag) => {
      const { key, value } = parseOsmTag(tag);
      return `  nwr["${key}"="${value}"](around:${params.radius},${params.latitude},${params.longitude});`;
    })
    .join("\n");

  return `[out:json][timeout:60];
(
${branches}
);
out center tags;`;
}

/** Normalize a raw Overpass element into our Business shape. */
export function normalizeOsmElement(
  element: OsmElement,
  category: string
): Business | null {
  const tags = element.tags ?? {};

  // Without a name we can't show or contact the business — skip.
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  const phone = tags.phone ?? tags["contact:phone"] ?? undefined;
  const website =
    tags.website ?? tags["contact:website"] ?? tags.url ?? undefined;

  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const city = tags["addr:city"] ?? undefined;
  const addressParts = [street || undefined, city].filter(Boolean);

  return {
    id: `osm:${element.type}/${element.id}`,
    name,
    category,
    address: addressParts.length > 0 ? addressParts.join(", ") : undefined,
    latitude: lat,
    longitude: lon,
    phone,
    website,
    source: "osm",
    sourceId: `${element.type}/${element.id}`,
  };
}

/** Dedupe elements that carry the same OSM id more than once. */
function dedupeById(businesses: Business[]): Business[] {
  const seen = new Set<string>();
  return businesses.filter((b) => {
    if (seen.has(b.sourceId)) return false;
    seen.add(b.sourceId);
    return true;
  });
}

export function createOsmProvider(
  options: OsmProviderOptions = {}
): BusinessProvider {
  const endpoint = options.endpoint ?? process.env.OVERPASS_URL ?? DEFAULT_OVERPASS_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent =
    options.userAgent ?? process.env.OVERPASS_USER_AGENT ?? DEFAULT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 2_000;

  async function queryOverpass(query: string): Promise<OverpassResponse> {
    let lastError: unknown;

    // Two attempts total: network blips and 429/504 backoffs are common with
    // the free Overpass instance, so retry once before giving up.
    for (let attemptNo = 1; attemptNo <= 2; attemptNo++) {
      if (attemptNo > 1) await new Promise((r) => setTimeout(r, retryDelayMs));
      try {
        const res = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": userAgent,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          try {
            return (await res.json()) as OverpassResponse;
          } catch (err) {
            throw new ProviderError("Overpass returned invalid JSON", "osm", err);
          }
        }

        if (res.status === 429 || res.status === 504) {
          lastError = new ProviderError(`Overpass returned HTTP ${res.status}`, "osm");
          continue; // worth a retry
        }

        throw new ProviderError(`Overpass returned HTTP ${res.status}`, "osm");
      } catch (err) {
        // Non-retryable failures (4xx/5xx other than 429/504, bad JSON) rethrow.
        if (err instanceof ProviderError && !err.message.includes("HTTP 429") && !err.message.includes("HTTP 504")) {
          throw err;
        }
        lastError = err;
      }
    }

    throw new ProviderError(
      lastError instanceof Error && lastError.name === "TimeoutError"
        ? `Overpass request timed out after ${timeoutMs}ms (retried once)`
        : "Overpass request failed (retried once)",
      "osm",
      lastError
    );
  }

  return {
    name: "osm",

    async search(params: SearchParams): Promise<Business[]> {
      const query = buildOverpassQuery(params);
      const data = await queryOverpass(query);
      const elements = data.elements ?? [];
      return dedupeById(
        elements
          .map((el) => normalizeOsmElement(el, params.category))
          .filter((b): b is Business => b !== null)
      );
    },

    async getDetails(id: string): Promise<Business> {
      // id format: "<type>/<numericId>", e.g. "node/123456"
      const slash = id.indexOf("/");
      const type = id.slice(0, slash);
      const numericId = id.slice(slash + 1);
      if (!type || !numericId || Number.isNaN(Number(numericId))) {
        throw new ProviderError(`Invalid OSM id "${id}"`, "osm");
      }

      const query = `[out:json][timeout:60];
${type}(${numericId});
out center tags;`;
      const data = await queryOverpass(query);
      const element = data.elements?.[0];
      if (!element) {
        throw new ProviderError(`OSM element "${id}" not found`, "osm");
      }
      const business = normalizeOsmElement(element, "");
      if (!business) {
        throw new ProviderError(`OSM element "${id}" has no name`, "osm");
      }
      return business;
    },
  };
}

/** Default singleton used by the app. */
export const osmProvider = createOsmProvider();
