import { describe, expect, it, vi } from "vitest";

import fixture from "./fixtures/overpass/restaurants-davao.json";
import {
  DEFAULT_OVERPASS_URL,
  buildOverpassQuery,
  createOsmProvider,
  normalizeOsmElement,
  parseOsmTag,
  type OsmElement,
  type OsmProviderOptions,
} from "@/lib/business-providers/osm";
import { ProviderError } from "@/lib/business-providers/types";
import type { SearchParams } from "@/types/business";

/** JSON imports widen `type` to string — restore the discriminated union. */
const ELEMENTS = fixture.elements as unknown as OsmElement[];

const PARAMS: SearchParams = {
  latitude: 7.0731,
  longitude: 125.6128,
  radius: 10_000,
  category: "restaurants",
};

/** Build a provider whose fetch returns the given responses in order. */
function providerWithResponses(
  responses: Array<{ ok: boolean; status: number; body?: unknown }>,
  options: Partial<OsmProviderOptions> = {}
) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: responses[0].ok,
        status: responses[0].status,
        json: async () => responses[0].body,
      }) as Response
  );
  const provider = createOsmProvider({
    fetchImpl: fetchMock as unknown as typeof fetch,
    retryDelayMs: 1,
    ...options,
  });
  return { provider, fetchMock };
}

const okJson = (body: unknown) => ({ ok: true, status: 200, body });

describe("parseOsmTag", () => {
  it("splits key=value", () => {
    expect(parseOsmTag("amenity=restaurant")).toEqual({
      key: "amenity",
      value: "restaurant",
    });
  });

  it("throws on malformed tags", () => {
    expect(() => parseOsmTag("no_equals_sign")).toThrow();
    expect(() => parseOsmTag("=novalue")).toThrow();
  });
});

describe("buildOverpassQuery", () => {
  it("includes every configured tag for the category", () => {
    const query = buildOverpassQuery(PARAMS);
    expect(query).toContain('nwr["amenity"="restaurant"]');
    expect(query).toContain('nwr["amenity"="fast_food"]');
    expect(query).toContain('nwr["amenity"="cafe"]');
  });

  it("embeds radius and coordinates", () => {
    const query = buildOverpassQuery(PARAMS);
    expect(query).toContain("(around:10000,7.0731,125.6128)");
    expect(query).toContain("[out:json][timeout:60]");
    expect(query).toContain("out center tags;");
  });

  it("throws for a category without OSM tags", () => {
    expect(() =>
      buildOverpassQuery({ ...PARAMS, category: "nonexistent" as never })
    ).toThrow(/No OSM tags configured/);
  });
});

describe("normalizeOsmElement", () => {
  it("maps a fully-tagged node", () => {
    const el = ELEMENTS[0];
    const b = normalizeOsmElement(el, "restaurants")!;
    expect(b).toMatchObject({
      id: "osm:node/1001",
      sourceId: "node/1001",
      name: "ABC Restaurant",
      category: "restaurants",
      phone: "+63 82 123 4567",
      website: "https://abc-restaurant.example.com",
      address: "12 Rizal Street, Davao City",
      latitude: 7.0731,
      longitude: 125.6128,
      source: "osm",
    });
  });

  it("prefers contact:* variants when plain tags are missing", () => {
    const el = ELEMENTS[1];
    const b = normalizeOsmElement(el, "restaurants")!;
    expect(b.phone).toBe("+63 82 987 6543");
    expect(b.website).toBe("https://contacttags.example.com");
  });

  it("uses way/relation center coordinates", () => {
    const way = normalizeOsmElement(ELEMENTS[2], "restaurants")!;
    expect(way.latitude).toBe(7.0655);
    expect(way.longitude).toBe(125.619);
    expect(way.website).toBe("https://centerpoint.example.com");

    const rel = normalizeOsmElement(ELEMENTS[3], "restaurants")!;
    expect(rel.sourceId).toBe("relation/3001");
  });

  it("returns null for unnamed elements", () => {
    expect(normalizeOsmElement(ELEMENTS[4], "restaurants")).toBeNull();
  });

  it("trims whitespace-only names to null and trims real names", () => {
    expect(normalizeOsmElement({ type: "node", id: 9, tags: { name: "   " } }, "restaurants")).toBeNull();
    const trimmed = normalizeOsmElement(ELEMENTS[6], "restaurants")!;
    expect(trimmed.name).toBe("Whitespace Name");
  });
});

describe("osmProvider.search", () => {
  it("normalizes and dedupes fixture elements (6 named, 1 duplicate)", async () => {
    const { provider } = providerWithResponses([okJson(fixture)]);
    const results = await provider.search(PARAMS);

    // 7 elements in fixture; one unnamed skipped, one duplicate removed → 5
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.sourceId)).toEqual([
      "node/1001",
      "node/1002",
      "way/2001",
      "relation/3001",
      "node/1004",
    ]);
  });

  it("posts to the Overpass endpoint with an encoded query", async () => {
    const { provider, fetchMock } = providerWithResponses([okJson(fixture)]);
    await provider.search(PARAMS);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DEFAULT_OVERPASS_URL);
    expect(init.method).toBe("POST");
    expect(String(init.body)).toMatch(/^data=/);
    expect(decodeURIComponent(String(init.body))).toContain('nwr["amenity"="restaurant"]');
  });

  it("returns [] when Overpass finds nothing", async () => {
    const { provider } = providerWithResponses([okJson({ elements: [] })]);
    expect(await provider.search(PARAMS)).toEqual([]);
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => undefined } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture } as Response);
    const provider = createOsmProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
      retryDelayMs: 1,
    });

    const results = await provider.search(PARAMS);
    expect(results).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ProviderError on persistent HTTP failure", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 500, json: async () => undefined }) as Response
    );
    const provider = createOsmProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
      retryDelayMs: 1,
    });
    await expect(provider.search(PARAMS)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "osm",
    });
  });

  it("throws ProviderError on network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const provider = createOsmProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
      retryDelayMs: 1,
    });
    await expect(provider.search(PARAMS)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // network blips get one retry
  });

  it("throws ProviderError on invalid JSON", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("Unexpected token <");
          },
        }) as unknown as Response
    );
    const provider = createOsmProvider({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(provider.search(PARAMS)).rejects.toMatchObject({
      name: "ProviderError",
      provider: "osm",
    });
  });
});

describe("osmProvider.getDetails", () => {
  it("fetches one element by id", async () => {
    const { provider, fetchMock } = providerWithResponses([
      okJson({ elements: [ELEMENTS[0]] }),
    ]);
    const b = await provider.getDetails("node/1001");

    expect(b.name).toBe("ABC Restaurant");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(decodeURIComponent(String(init.body))).toContain("node(1001);");
  });

  it("throws on invalid id format", async () => {
    const { provider } = providerWithResponses([okJson({ elements: [] })]);
    await expect(provider.getDetails("garbage")).rejects.toMatchObject({
      name: "ProviderError",
      provider: "osm",
    });
  });

  it("throws when the element does not exist", async () => {
    const { provider } = providerWithResponses([okJson({ elements: [] })]);
    await expect(provider.getDetails("node/999999")).rejects.toMatchObject({
      name: "ProviderError",
      provider: "osm",
    });
  });
});
