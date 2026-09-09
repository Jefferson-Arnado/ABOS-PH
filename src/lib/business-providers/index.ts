/**
 * Provider factory — the only place that knows which provider is active.
 * Switching vendors = BUSINESS_PROVIDER env var (docs/ARCHITECTURE.md §4).
 */

import type { BusinessProvider } from "./types";
import { osmProvider } from "./osm";

export function getBusinessProvider(): BusinessProvider {
  const provider = process.env.BUSINESS_PROVIDER ?? "osm";
  switch (provider) {
    case "osm":
      return osmProvider;
    case "google":
      // Intentionally not implemented until the first paying customer
      // (spec §28). Fall through to a loud failure rather than silently
      // returning OSM data.
      throw new Error(
        "BUSINESS_PROVIDER=google is not implemented yet — use 'osm' (Google Places is a post-revenue upgrade, spec §28)"
      );
    default:
      throw new Error(`Unknown BUSINESS_PROVIDER "${provider}" — expected 'osm' or 'google'`);
  }
}

export { ProviderError } from "./types";
export type { BusinessProvider } from "./types";
export { osmProvider, createOsmProvider } from "./osm";
export type { OsmElement, OverpassResponse, OsmProviderOptions } from "./osm";
export { buildOverpassQuery, normalizeOsmElement, parseOsmTag, DEFAULT_OVERPASS_URL } from "./osm";
