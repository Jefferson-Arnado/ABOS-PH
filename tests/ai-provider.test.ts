import { describe, expect, it, vi } from "vitest";

import {
  ANALYSIS_SYSTEM_PROMPT,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  buildAnalysisPrompt,
  createOllamaProvider,
  parseAnalysisResponse,
} from "@/lib/ai/ollama";
import { getAIProvider, getAIProviderName } from "@/lib/ai";
import { AIProviderError, type BusinessAnalysisInput } from "@/lib/ai/types";

const INPUT: BusinessAnalysisInput = {
  businessName: "ABC Dental",
  category: "dental",
  location: "Davao City",
  opportunityScore: 92,
  tier: "high",
  issues: ["No website", "No online booking"],
  website: null,
  phone: "+63 917 123 4567",
};

const VALID_JSON = `{
  "whyGoodProspect": "Established clinic with a phone line but no website, so patients cannot book online.",
  "recommendedServices": [
    { "name": "Business website", "priority": "high" },
    { "name": "Online booking", "priority": "high" },
    { "name": "Contact page", "priority": "medium" },
    { "name": "Weird", "priority": "extreme" },
    "junk"
  ],
  "salesAngle": "Lead with easier appointment scheduling for existing patients."
}`;

describe("buildAnalysisPrompt", () => {
  it("includes the business facts and issues (spec §12 input)", () => {
    const prompt = buildAnalysisPrompt(INPUT);
    expect(prompt).toContain("Business: ABC Dental");
    expect(prompt).toContain("Category: dental");
    expect(prompt).toContain("Location: Davao City");
    expect(prompt).toContain("Opportunity score: 92/100 (high tier)");
    expect(prompt).toContain("Issues found: No website; No online booking");
    expect(prompt).toContain("Website: none");
    expect(prompt).toContain("Phone on file: +63 917 123 4567");
  });

  it("omits lines for missing optional fields", () => {
    const prompt = buildAnalysisPrompt({
      ...INPUT,
      category: null,
      location: undefined,
      phone: null,
      issues: [],
    });
    expect(prompt).not.toContain("Category:");
    expect(prompt).not.toContain("Location:");
    expect(prompt).not.toContain("Phone on file:");
    expect(prompt).toContain("Issues found: none recorded");
  });
});

describe("parseAnalysisResponse", () => {
  it("parses a valid response and sanitizes services", () => {
    const ai = parseAnalysisResponse(VALID_JSON);
    expect(ai.whyGoodProspect).toContain("Established clinic");
    expect(ai.salesAngle).toContain("appointment scheduling");
    // Invalid entries dropped; unknown priority → medium; names trimmed.
    expect(ai.recommendedServices).toEqual([
      { name: "Business website", priority: "high" },
      { name: "Online booking", priority: "high" },
      { name: "Contact page", priority: "medium" },
      { name: "Weird", priority: "medium" },
    ]);
  });

  it("strips markdown fences around the JSON", () => {
    const ai = parseAnalysisResponse("```json\n" + VALID_JSON + "\n```");
    expect(ai.whyGoodProspect).toContain("Established clinic");
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const ai = parseAnalysisResponse(`Sure! Here it is:\n${VALID_JSON}\nHope that helps.`);
    expect(ai.salesAngle).toContain("appointment scheduling");
  });

  it("throws on output without a JSON object", () => {
    expect(() => parseAnalysisResponse("no json here")).toThrow(AIProviderError);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAnalysisResponse("{whyGoodProspect: oops}")).toThrow(
      AIProviderError
    );
  });

  it("throws when required fields are missing or empty", () => {
    const missingAngle = `{"whyGoodProspect": "why"}`;
    expect(() => parseAnalysisResponse(missingAngle)).toThrow(AIProviderError);
    const emptyWhy = `{"whyGoodProspect": "  ", "salesAngle": "angle"}`;
    expect(() => parseAnalysisResponse(emptyWhy)).toThrow(AIProviderError);
  });

  it("tolerates a missing services array", () => {
    const ai = parseAnalysisResponse(
      `{"whyGoodProspect": "w", "salesAngle": "s"}`
    );
    expect(ai.recommendedServices).toEqual([]);
  });
});

function okFetch(content: string) {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ message: { role: "assistant", content } }),
      { status: 200 }
    )
  );
}

function errorFetch(status: number) {
  return vi.fn().mockResolvedValue(new Response("nope", { status }));
}

describe("createOllamaProvider", () => {
  it("posts a JSON-forced chat request to the default endpoint and returns the analysis", async () => {
    const fetchImpl = okFetch(VALID_JSON);
    const provider = createOllamaProvider({ fetchImpl });

    const ai = await provider.analyzeBusiness(INPUT);

    expect(provider.name).toBe("ollama");
    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${DEFAULT_OLLAMA_URL}/api/chat`);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(body.stream).toBe(false);
    expect(body.format).toBe("json");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe(ANALYSIS_SYSTEM_PROMPT);
    expect(body.messages[1].content).toContain("ABC Dental");
    expect(ai.whyGoodProspect).toContain("Established clinic");
  });

  it("trims a trailing slash off a custom endpoint", async () => {
    const fetchImpl = okFetch(VALID_JSON);
    const provider = createOllamaProvider({
      fetchImpl,
      endpoint: "http://localhost:11434/",
    });
    await provider.analyzeBusiness(INPUT);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
  });

  it("maps network failures to AIProviderError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = createOllamaProvider({ fetchImpl });
    await expect(provider.analyzeBusiness(INPUT)).rejects.toThrow(AIProviderError);
  });

  it("maps HTTP errors to AIProviderError", async () => {
    const provider = createOllamaProvider({ fetchImpl: errorFetch(500) });
    await expect(provider.analyzeBusiness(INPUT)).rejects.toThrow(
      "Ollama returned HTTP 500"
    );
  });

  it("maps unusable model output to AIProviderError (502 upstream)", async () => {
    const provider = createOllamaProvider({ fetchImpl: okFetch("garbage") });
    await expect(provider.analyzeBusiness(INPUT)).rejects.toThrow(AIProviderError);
  });
});

describe("provider factory", () => {
  it("defaults to ollama", () => {
    delete process.env.AI_PROVIDER;
    expect(getAIProviderName()).toBe("ollama");
    expect(getAIProvider().name).toBe("ollama");
  });

  it("selects openai only via env var", () => {
    process.env.AI_PROVIDER = "openai";
    expect(getAIProviderName()).toBe("openai");
    delete process.env.AI_PROVIDER;
  });
});
