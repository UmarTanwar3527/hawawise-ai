import { revalidateTag } from "next/cache";

import { getServerEnv } from "@/config/env";
import { generateDailyBriefIfNeeded } from "@/features/ai-guardian/daily-brief/generate";
import { createGuardianDataSource } from "@/features/ai-guardian/tools/data-source";
import { AIR_QUALITY_CACHE_TAG } from "@/features/air-quality/services/dashboard-data";
import { generateWithGemini, isGeminiConfigured } from "@/lib/gemini/client";
import { GeminiError } from "@/lib/gemini/types";
import { jsonError } from "@/lib/http/api-response";
import { isValidBearer } from "@/lib/security/bearer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Generates the AI Daily Air Brief from freshly ingested data when it has
 * meaningfully changed. Called by the scheduler after /api/cron/ingest.
 * Requires `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const env = getServerEnv();
  if (!env.CRON_SECRET || !isValidBearer(request.headers.get("authorization"), env.CRON_SECRET)) {
    return jsonError("unauthorized", "Missing or invalid credentials.", 401);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("not_configured", "Storage is not configured.", 503);
  }
  if (!isGeminiConfigured()) {
    return Response.json({ status: "not_configured" }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const outcome = await generateDailyBriefIfNeeded({
      db: createSupabaseAdminClient(),
      data: createGuardianDataSource({ fresh: true }),
      generate: generateWithGemini,
      model: env.GEMINI_MODEL,
    });
    if (outcome.status === "generated") revalidateTag(AIR_QUALITY_CACHE_TAG, "max");
    return Response.json(outcome, {
      status: outcome.status === "failed" ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const reason = error instanceof GeminiError ? error.message : "internal error";
    console.error("daily brief failed", reason);
    return Response.json({ status: "failed", reason }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
