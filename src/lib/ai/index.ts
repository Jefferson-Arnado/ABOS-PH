/**
 * AI provider factory (spec §23, ARCHITECTURE §4) — the single swap point:
 * AI_PROVIDER=ollama (default, dev) | openai (post-revenue). No vendor
 * SDK calls outside lib/ai/ (AGENTS §2 rule 4).
 */

import type { AIProvider } from "./types";
import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";

export type AIProviderName = "ollama" | "openai";

export function getAIProviderName(): AIProviderName {
  return process.env.AI_PROVIDER === "openai" ? "openai" : "ollama";
}

export function getAIProvider(): AIProvider {
  return getAIProviderName() === "openai"
    ? createOpenAIProvider()
    : createOllamaProvider();
}
