import { connection } from "next/server";

import type { GroundedExplanation } from "@/features/ai-guardian/agents/grounded-explanation";
import { getKnownAreaSlugs } from "@/features/air-quality/services/dashboard-data";
import { advisorExplainSchema } from "@/features/health-advisor/schemas/advisor-request";
import { loadAdvisory } from "@/features/health-advisor/services/advisor";
import { buildAdvisorFacts, explainAdvisory } from "@/features/health-advisor/services/explain";
import { generateWithGemini, isGeminiConfigured } from "@/lib/gemini/client";
import { GeminiError } from "@/lib/gemini/types";
import { jsonError } from "@/lib/http/api-response";
import { clientAddress, RateLimiter } from "@/lib/security/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const maxDuration = 60;

const perClient = new RateLimiter([
  { limit: 6, windowMs: 60_000 },
  { limit: 40, windowMs: 86_400_000 },
]);
const perInstance = new RateLimiter([{ limit: 600, windowMs: 86_400_000 }]);
const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { expires: number; value: GroundedExplanation }>();

/**
 * AI explanation of a health advisory. The advisory is rebuilt here by the
 * rules engine from stored data; the browser sends only its choices.
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
  const parsed = advisorExplainSchema.safeParse(body);
  if (!parsed.success) return jsonError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  if (!isGeminiConfigured() || !isSupabaseConfigured()) {
    return jsonError("not_configured", "AI explanations are not configured.", 503);
  }
  const { language, ...choices } = parsed.data;

  let known: string[];
  try {
    known = await getKnownAreaSlugs();
  } catch {
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }
  if (!known.includes(choices.location)) return jsonError("not_found", "Unknown area.", 404);

  await connection();
  const now = new Date();
  let facts;
  try {
    const { advisory, current } = await loadAdvisory(choices, now);
    facts = buildAdvisorFacts(advisory, current.location.name);
  } catch (error) {
    console.error("advisor data failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }

  const key = JSON.stringify([language, facts]);
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
    const explanation = await explainAdvisory({ facts, language, generate: generateWithGemini });
    if (explanation.status === "ok") {
      if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
      cache.set(key, { expires: now.getTime() + CACHE_TTL_MS, value: explanation });
    }
    return Response.json({ ...explanation, cached: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("advisor model error", error.kind, error.status ?? "");
      const busy = error.kind === "rate_limited" || error.kind === "unavailable";
      return jsonError(
        "ai_unavailable",
        busy ? "The AI is busy right now. The advice above is still valid." : "The AI could not explain this right now.",
        503,
      );
    }
    console.error("advisor explain failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "The AI explanation is temporarily unavailable.", 503);
  }
}
