import type { NextRequest } from "next/server";

import { areaQuerySchema } from "@/features/air-quality/schemas/area-query";
import { withCurrentFreshness } from "@/features/air-quality/services/area-air-quality";
import {
  getAreaAirQualityCached,
  getKnownAreaSlugs,
} from "@/features/air-quality/services/dashboard-data";
import { jsonError } from "@/lib/http/api-response";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Latest air quality for a Jaipur area: the nearest station measurement
 * (with Hawa AI-calculated CPCB AQI) and the area's modelled estimate.
 * Reads go through a server cache keyed on known areas only, so extra query
 * parameters or unknown slugs cannot bypass it to reach the database.
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
    const known = await getKnownAreaSlugs();
    if (!known.includes(parsed.data.location)) {
      return jsonError("not_found", "Unknown location.", 404);
    }
    const data = withCurrentFreshness(await getAreaAirQualityCached(parsed.data.location), new Date());
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("air-quality read failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Air-quality data is temporarily unavailable.", 503);
  }
}
