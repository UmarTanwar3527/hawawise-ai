import type { NextRequest } from "next/server";

import { areaQuerySchema } from "@/features/air-quality/schemas/area-query";
import {
  getAreaAirQuality,
  LocationNotFoundError,
} from "@/features/air-quality/services/area-air-quality";
import { jsonError } from "@/lib/http/api-response";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Latest air quality for a Jaipur area: the nearest station measurement
 * (with Hawa AI-calculated CPCB AQI) and the area's modelled estimate.
 * Data is ingested on a schedule, so responses are cached briefly at the CDN.
 */
export async function GET(request: NextRequest) {
  const parsed = areaQuerySchema.safeParse({
    location: request.nextUrl.searchParams.get("location") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("invalid_request", "location must be a valid area identifier.", 400);
  }
  if (!isSupabaseConfigured()) {
    return jsonError("not_configured", "Air-quality storage is not configured.", 503);
  }

  try {
    const data = await getAreaAirQuality(createSupabasePublicClient(), parsed.data.location);
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return jsonError("not_found", "Unknown location.", 404);
    }
    console.error("air-quality read failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }
}
