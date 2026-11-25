import { revalidateTag } from "next/cache";

import { getServerEnv } from "@/config/env";
import { AIR_QUALITY_CACHE_TAG } from "@/features/air-quality/services/dashboard-data";
import { jsonError } from "@/lib/http/api-response";
import { isValidBearer } from "@/lib/security/bearer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MAX_STATION_WINDOW_HOURS, runAirQualityIngestion } from "@/services/ingestion/air-quality-ingestion";
import { OpenMeteoProvider } from "@/services/providers/open-meteo/client";
import { OpenAqProvider } from "@/services/providers/openaq/client";

export const maxDuration = 60;

/**
 * Scheduled ingestion of OpenAQ station data and Open-Meteo model data.
 * Requires `Authorization: Bearer <CRON_SECRET>`. Provider calls happen only
 * here, never per visitor request, which keeps provider usage bounded.
 */
export async function GET(request: Request) {
  const env = getServerEnv();
  // Authenticate first so unauthenticated callers learn nothing about configuration.
  if (!env.CRON_SECRET || !isValidBearer(request.headers.get("authorization"), env.CRON_SECRET)) {
    return jsonError("unauthorized", "Missing or invalid credentials.", 401);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !isSupabaseConfigured()) {
    return jsonError("not_configured", "Ingestion is not configured.", 503);
  }

  // Optional one-off backfill of station history: ?backfillHours=31..192.
  const backfillRaw = new URL(request.url).searchParams.get("backfillHours");
  const backfillHours = backfillRaw === null ? undefined : Number(backfillRaw);
  if (backfillHours !== undefined && (!Number.isInteger(backfillHours) || backfillHours < 31 || backfillHours > MAX_STATION_WINDOW_HOURS)) {
    return jsonError("invalid_request", `backfillHours must be an integer from 31 to ${MAX_STATION_WINDOW_HOURS}.`, 400);
  }

  const summary = await runAirQualityIngestion({
    stationWindowHours: backfillHours,
    db: createSupabaseAdminClient(),
    stations: env.OPENAQ_API_KEY ? new OpenAqProvider(env.OPENAQ_API_KEY) : null,
    model: new OpenMeteoProvider(),
  });

  const anySucceeded = summary.providers.some(
    (provider) => provider.status === "success" || provider.status === "partial",
  );
  // Serve the previous data until the next visit regenerates it.
  if (anySucceeded) revalidateTag(AIR_QUALITY_CACHE_TAG, "max");
  return Response.json(summary, {
    status: anySucceeded ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
