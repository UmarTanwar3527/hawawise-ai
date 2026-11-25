import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getAreaForecast } from "@/features/air-quality/services/area-air-quality";
import { AIR_QUALITY_CACHE_TAG } from "@/features/air-quality/services/dashboard-data";
import { getPublicReports } from "@/features/civic-reports/services/reports";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { istDayKey } from "@/lib/utils/format";

import { computeCityInsights, type ForecastDayMean, type ReportSummaryInput, type StationSeries } from "./compute";

const HOUR = 3_600_000;
/** History loaded for a 7-day analysis (plus margin for the partial current day). */
const HISTORY_HOURS = 9 * 24;

/**
 * Hourly measured PM2.5, PM10 and calculated CPCB AQI for every active
 * station, read as the public role. One query per station keeps each
 * response under the Data API row limit.
 */
export async function getStationSeriesCached(): Promise<StationSeries[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  const db = createSupabasePublicClient();
  const since = new Date(Date.now() - HISTORY_HOURS * HOUR).toISOString();

  const [{ data: stations, error: stationError }, { data: source, error: sourceError }] = await Promise.all([
    db.from("locations").select("id, name").eq("location_type", "monitoring_station").order("name"),
    db.from("data_sources").select("id").eq("provider", "openaq").maybeSingle(),
  ]);
  if (stationError) throw stationError;
  if (sourceError) throw sourceError;
  if (!source) return [];

  return Promise.all(
    stations.map(async (station) => {
      const { data, error } = await db
        .from("aqi_readings")
        .select(
          "observed_at, pollutant_values (pollutant, value, unit), aqi_index_values (aqi_scale, aqi_value, aqi_category, is_lower_bound, dominant_pollutant)",
        )
        .eq("location_id", station.id)
        .eq("source_id", source.id)
        .eq("data_kind", "measured")
        .gte("observed_at", since)
        .order("observed_at");
      if (error) throw error;
      return {
        id: station.id,
        name: station.name,
        hours: data.map((row) => {
          const mass = (code: string) =>
            row.pollutant_values.find((p) => p.pollutant === code && p.unit === "ug_m3")?.value ?? null;
          const aqi = row.aqi_index_values.find((v) => v.aqi_scale === "ind_cpcb");
          return {
            observedAt: row.observed_at,
            pm25: mass("pm25"),
            pm10: mass("pm10"),
            aqi: aqi?.aqi_value ?? null,
            aqiIsLowerBound: aqi?.is_lower_bound ?? false,
            category: aqi?.aqi_category ?? null,
            dominantPollutant: aqi?.dominant_pollutant ?? null,
          };
        }),
      };
    }),
  );
}

/** Daily mean modelled PM2.5 for the city centre (Open-Meteo forecast). */
export async function getCityForecastDaysCached(): Promise<ForecastDayMean[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 7200 });
  cacheTag(AIR_QUALITY_CACHE_TAG);
  const forecast = await getAreaForecast(createSupabasePublicClient(), "jaipur-city-centre", 96);
  const days = new Map<string, number[]>();
  for (const hour of forecast.hours) {
    const pm25 = hour.pollutants.find((p) => p.pollutant === "pm25" && p.unit === "ug_m3");
    if (!pm25) continue;
    const key = istDayKey(hour.forecastFor);
    days.set(key, [...(days.get(key) ?? []), pm25.value]);
  }
  return [...days.entries()].map(([day, values]) => ({
    day,
    pm25Mean: values.reduce((s, v) => s + v, 0) / values.length,
    hours: values.length,
  }));
}

export async function getReportSummaryInput(): Promise<ReportSummaryInput[]> {
  const reports = await getPublicReports(500);
  return reports.map(({ category, createdAt, verificationStatus }) => ({ category, createdAt, verificationStatus }));
}

/**
 * Everything the insights page and the explanation API need. Station data is
 * required; the forecast and community reports are optional and degrade to
 * "unavailable" rather than failing the page.
 */
export async function loadCityInsights(now: Date) {
  const [stations, forecastDays, reports] = await Promise.all([
    getStationSeriesCached(),
    getCityForecastDaysCached().catch((error: unknown) => {
      console.error("insights forecast failed", error instanceof Error ? error.name : "unknown");
      return null;
    }),
    getReportSummaryInput().catch((error: unknown) => {
      console.error("insights reports failed", error instanceof Error ? error.name : "unknown");
      return null;
    }),
  ]);
  return {
    insights: computeCityInsights({ stations, forecastDays, reports: reports ?? [], now }),
    forecastUnavailable: forecastDays === null,
    reportsUnavailable: reports === null,
  };
}
