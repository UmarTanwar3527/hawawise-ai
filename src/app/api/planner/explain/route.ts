import { connection } from "next/server";

import {
  getAreaAirQualityCached,
  getAreaForecastCached,
  getKnownAreaSlugs,
} from "@/features/air-quality/services/dashboard-data";
import {
  withCurrentForecastFreshness,
  withCurrentFreshness,
} from "@/features/air-quality/services/area-air-quality";
import { PLANNER_FORECAST_HOURS } from "@/features/exposure-planner/constants";
import { explainRequestSchema } from "@/features/exposure-planner/schemas/plan-request";
import { buildExplanationFacts, explainPlan, type PlanExplanation } from "@/features/exposure-planner/services/explain";
import { planExposure } from "@/features/exposure-planner/services/plan";
import { generateWithGemini, isGeminiConfigured } from "@/lib/gemini/client";
import { GeminiError } from "@/lib/gemini/types";
import { jsonError } from "@/lib/http/api-response";
import { clientAddress, RateLimiter } from "@/lib/security/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const maxDuration = 60;

const MAX_BODY_BYTES = 2_000;
const perClient = new RateLimiter([
  { limit: 6, windowMs: 60_000 },
  { limit: 40, windowMs: 86_400_000 },
]);
const perInstance = new RateLimiter([{ limit: 600, windowMs: 86_400_000 }]);

/**
 * Identical requests over the same data get the same explanation, so keep a
 * small per-instance cache to save model quota. Keyed by the inputs and the
 * data timestamps, so new forecasts or measurements produce a new explanation.
 */
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { expires: number; value: PlanExplanation & { status: "ok" } }>();

/**
 * AI explanation of an exposure plan. The plan is recalculated here from
 * stored data; the browser sends only the visitor's choices, never numbers.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonError("payload_too_large", "The request is too large.", 413);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Send a JSON body.", 400);
  }
  const parsed = explainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  if (!isGeminiConfigured() || !isSupabaseConfigured()) {
    return jsonError("not_configured", "AI explanations are not configured.", 503);
  }
  const { language, ...planRequest } = parsed.data;

  let known: string[];
  try {
    known = await getKnownAreaSlugs();
  } catch {
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }
  if (!known.includes(planRequest.location)) return jsonError("not_found", "Unknown area.", 404);

  await connection();
  const now = new Date();
  let facts;
  try {
    const [forecast, current] = await Promise.all([
      getAreaForecastCached(planRequest.location, PLANNER_FORECAST_HOURS),
      getAreaAirQualityCached(planRequest.location),
    ]);
    const plan = planExposure({ forecast: withCurrentForecastFreshness(forecast, now), request: planRequest, now });
    if (plan.status !== "ok") {
      return jsonError("no_plan", "There is no forecast comparison to explain for these choices.", 422);
    }
    facts = buildExplanationFacts(plan, withCurrentFreshness(current, now));
  } catch (error) {
    console.error("planner data failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }

  const cacheKey = JSON.stringify([language, facts]);
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now.getTime()) {
    return Response.json({ ...hit.value, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  for (const [limiter, key] of [
    [perClient, clientAddress(request.headers)],
    [perInstance, "global"],
  ] as const) {
    const result = limiter.check(key);
    if (!result.allowed) {
      const response = jsonError("rate_limited", "Too many requests. Please wait a moment and try again.", 429);
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return response;
    }
  }

  try {
    const explanation = await explainPlan({ facts, language, generate: generateWithGemini });
    if (explanation.status === "ok") {
      if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, { expires: now.getTime() + CACHE_TTL_MS, value: explanation });
    }
    return Response.json({ ...explanation, cached: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("planner model error", error.kind, error.status ?? "");
      const busy = error.kind === "rate_limited" || error.kind === "unavailable";
      return jsonError(
        "ai_unavailable",
        busy ? "The AI is busy right now. The comparison above is still valid." : "The AI could not explain this right now.",
        503,
      );
    }
    console.error("planner explain failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "The AI explanation is temporarily unavailable.", 503);
  }
}
