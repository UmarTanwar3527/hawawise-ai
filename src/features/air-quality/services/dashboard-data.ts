import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createSupabasePublicClient } from "@/lib/supabase/public";

import {
  getAreaAirQuality,
  getAreaForecast,
  getAreas,
  getStationHistory,
  getStationsOverview,
} from "./area-air-quality";

/** Cache tag invalidated by the ingestion job after each run. */
export const AIR_QUALITY_CACHE_TAG = "air-quality";

/** Selectable area slugs, cached under one key. */
export async function getKnownAreaSlugs(): Promise<string[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  const areas = await getAreas(createSupabasePublicClient());
  return areas.map((area) => area.slug);
}

/**
 * Everything the dashboard needs for one area, from stored data only.
 * Callers must check the slug against getKnownAreaSlugs() first, so
 * arbitrary slugs never create cache entries.
 * Cached for a few minutes and refreshed when ingestion writes new data.
 * Returns plain JSON-serialisable values.
 */
export async function getDashboardData(slug: string) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(AIR_QUALITY_CACHE_TAG);

  const db = createSupabasePublicClient();
  const now = new Date();

  const [areas, current, forecast, stations] = await Promise.all([
    getAreas(db),
    getAreaAirQuality(db, slug, now),
    getAreaForecast(db, slug, 120, now),
    getStationsOverview(db, now),
  ]);
  const history = current.measured
    ? await getStationHistory(db, current.measured.station.id, 24, now)
    : [];

  return { areas, current, forecast, stations, history, generatedAt: now.toISOString() };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/** Cached area reading for the public API. Callers must validate the slug first. */
export async function getAreaAirQualityCached(slug: string) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  return getAreaAirQuality(createSupabasePublicClient(), slug);
}

/** Cached forecast for the public API. `hours` is bounded (1–120) by the caller. */
export async function getAreaForecastCached(slug: string, hours: number) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 7200 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  return getAreaForecast(createSupabasePublicClient(), slug, hours);
}
