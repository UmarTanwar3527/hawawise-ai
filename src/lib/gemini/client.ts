import "server-only";

import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";

import { getServerEnv } from "@/config/env";

import { GeminiError, type GenerateFn, type GenerateRequest, type GenerateResult, type ModelContent } from "./types";

/** Hard limits per model call. */
export const GEMINI_LIMITS = {
  timeoutMs: 25_000,
  /** Total time for one turn across retries and fallback models, kept under the 60 s route limit. */
  budgetMs: 40_000,
  /** Retries for capacity errors (5xx), which fail fast and often clear within seconds. */
  retriesOnUnavailable: 3,
  /** Retries for timeouts, which are slow; one keeps a turn inside the route's time limit. */
  retriesOnTimeout: 1,
  maxOutputTokens: 1_500,
} as const;

const THINKING_LEVELS = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
} as const;

let client: GoogleGenAI | undefined;

export function isGeminiConfigured(): boolean {
  return Boolean(getServerEnv().GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = getServerEnv().GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("not_configured");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

function classify(error: unknown): GeminiError {
  if (error instanceof GeminiError) return error;
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new GeminiError("timeout");
  }
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  if (status === 429) return new GeminiError("rate_limited", 429);
  if (status === 400 || status === 404) return new GeminiError("invalid_request", status);
  return new GeminiError("unavailable", Number.isFinite(status) ? status : undefined);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Gemini turn with forced function calling, a timeout, bounded retries on
 * transient errors (429/5xx/timeouts) and an output-token cap.
 */
export const generateWithGemini: GenerateFn = async (request: GenerateRequest) => {
  const env = getServerEnv();
  const models = [...new Set([env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS])];
  const deadline = Date.now() + GEMINI_LIMITS.budgetMs;
  let lastError: GeminiError | undefined;
  for (const model of models) {
    if (Date.now() > deadline - MIN_ATTEMPT_MS) break;
    try {
      return await generateWithModel(model, request, deadline);
    } catch (error) {
      lastError = error instanceof GeminiError ? error : classify(error);
      // Only quota or capacity problems move on to the next model.
      if (lastError.kind !== "rate_limited" && lastError.kind !== "unavailable") throw lastError;
      console.warn("gemini model unavailable, trying fallback", model, lastError.kind);
    }
  }
  throw lastError ?? new GeminiError("unavailable");
};

/** Do not start an attempt with less time than this left in the budget. */
const MIN_ATTEMPT_MS = 3_000;

async function generateWithModel(model: string, request: GenerateRequest, deadline: number): Promise<GenerateResult> {
  const ai = getClient();
  let lastError: GeminiError | undefined;
  const maxRetries = Math.max(GEMINI_LIMITS.retriesOnUnavailable, GEMINI_LIMITS.retriesOnTimeout);
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0 && Date.now() > deadline - MIN_ATTEMPT_MS) break;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: request.contents as Content[],
        config: {
          systemInstruction: request.systemInstruction,
          temperature: 0.2,
          maxOutputTokens: request.maxOutputTokens ?? GEMINI_LIMITS.maxOutputTokens,
          thinkingConfig: { thinkingLevel: THINKING_LEVELS[getServerEnv().GEMINI_THINKING_LEVEL] },
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.parameters,
              })),
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: request.allowedTools,
            },
          },
          abortSignal: AbortSignal.timeout(Math.max(1_000, Math.min(GEMINI_LIMITS.timeoutMs, deadline - Date.now()))),
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content) throw new GeminiError("blocked");
      return {
        content: { role: "model", parts: (candidate.content.parts ?? []) as ModelContent["parts"] },
        functionCalls: (response.functionCalls ?? []).map((call) => ({
          name: call.name ?? "",
          args: (call.args ?? {}) as Record<string, unknown>,
          id: call.id,
        })),
        text: response.text ?? "",
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
        model,
      };
    } catch (error) {
      lastError = classify(error);
      // Quota errors (429) are per-minute or per-day: retrying immediately only burns more quota.
      const allowed =
        lastError.kind === "unavailable"
          ? GEMINI_LIMITS.retriesOnUnavailable
          : lastError.kind === "timeout"
            ? GEMINI_LIMITS.retriesOnTimeout
            : 0;
      if (attempt >= allowed) break;
      // About 1 s, 2 s, 4 s (+ jitter), only while the budget allows another attempt.
      const pause = 1000 * 2 ** attempt + Math.random() * 400;
      if (Date.now() + pause > deadline - MIN_ATTEMPT_MS) break;
      await sleep(pause);
    }
  }
  throw lastError ?? new GeminiError("unavailable");
}
