/**
 * OpenAIProvider — production stub (spec §23). Left unimplemented on
 * purpose: the MVP runs Ollama locally at ₱0 and this provider exists so
 * the factory has a target and the swap needs zero app-code changes.
 * Wire it up after the first paying customer (PLAN.md §Roadmap).
 */

import { AIProviderError, type AIProvider } from "./types";

export function createOpenAIProvider(): AIProvider {
  return {
    name: "openai",

    async analyzeBusiness(): Promise<never> {
      throw new AIProviderError(
        "OpenAIProvider is not implemented yet — set AI_PROVIDER=ollama (dev default)",
        "openai"
      );
    },
  };
}
