/**
 * BusinessProvider interface — the single swap point for business data
 * sources (docs/ARCHITECTURE.md §4). V1 ships OpenStreetMapProvider;
 * GooglePlacesProvider arrives after the first paying customer.
 */

import type { Business, SearchParams } from "@/types/business";

export interface BusinessProvider {
  /** Human-readable provider name, e.g. "osm" — for logs and metadata. */
  readonly name: string;
  /**
   * Search businesses around a point. Empty array is a valid result;
   * throw only on provider failure (network/HTTP/parse).
   */
  search(params: SearchParams): Promise<Business[]>;
  /** Fetch a single business by provider-specific id. */
  getDetails(id: string): Promise<Business>;
}

/** Thrown when a provider fails (network, HTTP error, bad payload). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}
