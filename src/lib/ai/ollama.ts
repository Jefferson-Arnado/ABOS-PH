/**
 * OllamaProvider — local AI analysis for dev (spec §23, $0 stack). Talks
 * to Ollama's `/api/chat` endpoint (non-streaming, JSON-forced) using any
 * instruct model the user has pulled (default `llama3.2`).
 *
 * fetchImpl/model/endpoint are injectable for fixtures-based tests, and
 * never-throw parsing means one malformed response surfaces as
 * AIProviderError, not a crash (AGENTS §2 rule 7).
 */

import type { AiAnalysis, RecommendedService } from "@/types/analysis";
import {
  AIProviderError,
  type AIProvider,
  type BusinessAnalysisInput,
} from "./types";

/** Default local Ollama endpoint (override with OLLAMA_BASE_URL). */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** Default model; any instruct model works (`ollama pull llama3.2`). */
export const DEFAULT_OLLAMA_MODEL = "llama3.2";

/** System prompt: fixed contract, JSON-only output. */
export const ANALYSIS_SYSTEM_PROMPT = `You are a sales research assistant for freelance web developers.
You explain WHY a local business is a good prospect for web services and how to pitch them.
Answer with ONLY a JSON object, no markdown fences, matching exactly:
{
  "whyGoodProspect": "2-3 sentence narrative referencing the specific issues found",
  "recommendedServices": [{ "name": "service name", "priority": "high" | "medium" | "low" }],
  "salesAngle": "1-2 sentence concrete pitch opener"
}
Rules: base everything on the provided facts; never invent contact details,
reviews, or revenue figures; 2-4 recommended services ranked by priority.`;

/** Builds the user message (spec §12 input shape). Pure, unit-tested. */
export function buildAnalysisPrompt(data: BusinessAnalysisInput): string {
  const lines = [
    `Business: ${data.businessName}`,
    data.category ? `Category: ${data.category}` : null,
    data.location ? `Location: ${data.location}` : null,
    `Opportunity score: ${data.opportunityScore}/100 (${data.tier} tier)`,
    data.issues.length > 0
      ? `Issues found: ${data.issues.join("; ")}`
      : "Issues found: none recorded",
    data.website ? `Website: ${data.website}` : "Website: none",
    data.phone ? `Phone on file: ${data.phone}` : null,
    data.notes ? `Owner notes: ${data.notes}` : null,
    "",
    "Explain why this business is a good prospect and how to pitch web services to them.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/**
 * Parse the model output into AiAnalysis. Tolerates markdown fences and
 * leading/trailing prose by extracting the outermost JSON object. Throws
 * AIProviderError on unusable output (the route maps this to 502).
 */
export function parseAnalysisResponse(
  raw: string,
  provider = "ollama"
): AiAnalysis {
  let text = raw.trim();

  // Strip ```json ... ``` fences if the model added them anyway.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // Extract the outermost JSON object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AIProviderError("AI response contained no JSON object", provider);
  }
  text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new AIProviderError("AI response was not valid JSON", provider, err);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AIProviderError("AI response JSON was not an object", provider);
  }

  const obj = parsed as Record<string, unknown>;

  const why = typeof obj.whyGoodProspect === "string" ? obj.whyGoodProspect.trim() : "";
  const angle = typeof obj.salesAngle === "string" ? obj.salesAngle.trim() : "";
  if (!why || !angle) {
    throw new AIProviderError(
      "AI response missing whyGoodProspect or salesAngle",
      provider
    );
  }

  const services: RecommendedService[] = Array.isArray(obj.recommendedServices)
    ? obj.recommendedServices
        .map((s) => {
          if (typeof s !== "object" || s === null) return null;
          const rec = s as Record<string, unknown>;
          if (typeof rec.name !== "string" || !rec.name.trim()) return null;
          const priority =
            rec.priority === "high" || rec.priority === "medium" || rec.priority === "low"
              ? rec.priority
              : "medium";
          return { name: rec.name.trim(), priority };
        })
        .filter((s): s is RecommendedService => s !== null)
    : [];

  return {
    whyGoodProspect: why,
    recommendedServices: services,
    salesAngle: angle,
  };
}

/** Injectables for tests/tuning. */
export interface OllamaProviderOptions {
  endpoint?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Milliseconds until the generation request is abandoned. */
  timeoutMs?: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

export function createOllamaProvider(
  options: OllamaProviderOptions = {}
): AIProvider {
  const endpoint =
    options.endpoint ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL;
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000; // local models are slow

  return {
    name: "ollama",

    async analyzeBusiness(data: BusinessAnalysisInput): Promise<AiAnalysis> {
      let res: Response;
      try {
        res = await fetchImpl(`${endpoint.replace(/\/$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            format: "json", // Ollama-side JSON constraint
            options: { temperature: 0.4 },
            messages: [
              { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
              { role: "user", content: buildAnalysisPrompt(data) },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new AIProviderError(
          `Ollama request failed (is it running at ${endpoint}?)`,
          "ollama",
          err
        );
      }

      if (!res.ok) {
        throw new AIProviderError(
          `Ollama returned HTTP ${res.status}`,
          "ollama"
        );
      }

      let payload: OllamaChatResponse;
      try {
        payload = (await res.json()) as OllamaChatResponse;
      } catch (err) {
        throw new AIProviderError("Ollama returned invalid JSON", "ollama", err);
      }
      if (payload.error) {
        throw new AIProviderError(`Ollama error: ${payload.error}`, "ollama");
      }

      const content = payload.message?.content ?? "";
      return parseAnalysisResponse(content, "ollama");
    },
  };
}

/** Default singleton used by the app. */
export const ollamaProvider = createOllamaProvider();
