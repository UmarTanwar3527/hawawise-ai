import { connection } from "next/server";
import { z } from "zod";

import { loadCityInsights } from "@/features/city-insights/services/data";
import { buildInsightsFacts, explainInsights } from "@/features/city-insights/services/explain";
import type { GroundedExplanation } from "@/features/ai-guardian/agents/grounded-explanation";
import { generateWithGemini, isGeminiConfigured } from "@/lib/gemini/client";
import { GeminiError } from "@/lib/gemini/types";
import { jsonError } from "@/lib/http/api-response";
import { clientAddress, RateLimiter } from "@/lib/security/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const maxDuration = 60;

const bodySchema = z.object({ language: z.enum(["en", "hi"]) });
const perClient = new RateLimiter([
  { limit: 4, windowMs: 60_000 },
  { limit: 30, windowMs: 86_400_000 },
]);
const perInstance = new RateLimiter([{ limit: 400, windowMs: 86_400_000 }]);

/** Explanations for the same statistics are identical; reuse them for 30 minutes. */
const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { expires: number; value: GroundedExplanation }>();

/**
 * AI interpretation of City insights. Statistics are recalculated here from
 * stored data; the browser sends only the language.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1_000) {
    return jsonError("payload_too_large", "The request is too large.", 413);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Send a JSON body.", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError("invalid_request", "Choose English or Hindi.", 400);
  if (!isGeminiConfigured() || !isSupabaseConfigured()) {
    return jsonError("not_configured", "AI interpretation is not configured.", 503);
  }

  await connection();
  const now = new Date();
  let facts;
  try {
    const { insights } = await loadCityInsights(now);
    if (insights.daily.every((d) => d.pm25 === null)) {
      return jsonError("no_data", "There is not enough stored data to interpret yet.", 422);
    }
    facts = buildInsightsFacts(insights);
  } catch (error) {
    console.error("insights data failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }

  const key = JSON.stringify([parsed.data.language, facts]);
  const hit = cache.get(key);
  if (hit && hit.expires > now.getTime()) {
    return Response.json({ ...hit.value, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  for (const [limiter, id] of [
    [perClient, clientAddress(request.headers)],
    [perInstance, "global"],
  ] as const) {
    const result = limiter.check(id);
    if (!result.allowed) {
      const response = jsonError("rate_limited", "Too many requests. Please wait a moment and try again.", 429);
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return response;
    }
  }

  try {
    const explanation = await explainInsights({ facts, language: parsed.data.language, generate: generateWithGemini });
    if (explanation.status === "ok") {
      if (cache.size >= 50) cache.delete(cache.keys().next().value as string);
      cache.set(key, { expires: now.getTime() + CACHE_TTL_MS, value: explanation });
    }
    return Response.json({ ...explanation, cached: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("insights model error", error.kind, error.status ?? "");
      const busy = error.kind === "rate_limited" || error.kind === "unavailable";
      return jsonError(
        "ai_unavailable",
        busy ? "The AI is busy right now. The statistics above are still valid." : "The AI could not interpret this right now.",
        503,
      );
    }
    console.error("insights explain failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "The AI interpretation is temporarily unavailable.", 503);
  }
}
