import type { NextRequest } from "next/server";

import { forecastQuerySchema } from "@/features/air-quality/schemas/area-query";
import {
  getAreaForecast,
  LocationNotFoundError,
} from "@/features/air-quality/services/area-air-quality";
import { jsonError } from "@/lib/http/api-response";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/** Hourly modelled forecast for a Jaipur area (Open-Meteo), from the latest stored run. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = forecastQuerySchema.safeParse({
    location: params.get("location") ?? undefined,
    hours: params.get("hours") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("invalid_request", "location or hours is invalid.", 400);
  }
  if (!isSupabaseConfigured()) {
    return jsonError("not_configured", "Air-quality storage is not configured.", 503);
  }

  try {
    const data = await getAreaForecast(
      createSupabasePublicClient(),
      parsed.data.location,
      parsed.data.hours,
    );
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    });
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return jsonError("not_found", "Unknown location.", 404);
    }
    console.error("forecast read failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Forecast data is temporarily unavailable.", 503);
  }
}
