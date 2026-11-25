import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createSupabasePublicClient } from "@/lib/supabase/public";

import {
  getAreasModelledOverview,
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

/** Selectable areas with names, cached under one key. */
export async function getAreasCached() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  return getAreas(createSupabasePublicClient());
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

/** Stations (measured, calculated CPCB AQI) and areas (modelled PM2.5) for the map. */
export async function getMapData() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  const db = createSupabasePublicClient();
  const now = new Date();
  const [stations, areas] = await Promise.all([getStationsOverview(db, now), getAreasModelledOverview(db, now)]);
  return { stations, areas };
}

export type MapData = Awaited<ReturnType<typeof getMapData>>;

export type DailyBrief = {
  generatedAt: string;
  dataAsOf: string;
  model: string;
  promptVersion: string;
  content: { headline: string; summary: string; highlights: string[]; guidance: string[]; warnings: string[] };
  evidence: { source: string; station: string | null; observedAt: string | null; dataKind: string; url: string | null }[];
};

/** Latest stored AI Daily Air Brief (generated on a schedule, never on page load). */
export async function getLatestDailyBrief(scope = "jaipur"): Promise<DailyBrief | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  const { data, error } = await createSupabasePublicClient()
    .from("ai_daily_briefs")
    .select("generated_at, data_as_of, model, prompt_version, content, evidence")
    .eq("scope", scope)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const content = data.content as Partial<DailyBrief["content"]> | null;
  if (!content?.headline || !content.summary) return null;
  return {
    generatedAt: data.generated_at,
    dataAsOf: data.data_as_of,
    model: data.model,
    promptVersion: data.prompt_version,
    content: {
      headline: content.headline,
      summary: content.summary,
      highlights: content.highlights ?? [],
      guidance: content.guidance ?? [],
      warnings: content.warnings ?? [],
    },
    evidence: (Array.isArray(data.evidence) ? data.evidence : []) as DailyBrief["evidence"],
  };
}
