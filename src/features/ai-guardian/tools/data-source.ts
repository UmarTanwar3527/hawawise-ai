import "server-only";

import {
  getAreaAirQuality,
  getAreaForecast,
  getAreas,
  getStationHistory,
  getStationsLatestPollutant,
  getStationsOverview,
  withCurrentForecastFreshness,
  withCurrentFreshness,
  type AreaAirQuality,
  type AreaForecast,
  type AreaSummary,
  type StationHistoryPoint,
  type StationOverview,
  type StationPollutantReading,
} from "@/features/air-quality/services/area-air-quality";
import {
  getAreaAirQualityCached,
  getAreaForecastCached,
} from "@/features/air-quality/services/dashboard-data";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Everything Air Guardian's tools may read. The production implementation
 * reuses the dashboard's service layer (same AQI calculation, station choice
 * and provenance); tests supply in-memory fakes.
 */
export interface GuardianDataSource {
  now(): Date;
  listAreas(): Promise<AreaSummary[]>;
  getCurrent(slug: string): Promise<AreaAirQuality>;
  getForecast(slug: string, hours: number): Promise<AreaForecast>;
  getStations(): Promise<StationOverview[]>;
  getStationsPollutant(pollutant: "pm25" | "pm10"): Promise<StationPollutantReading[]>;
  getStationHistory(stationId: string, hours: number): Promise<StationHistoryPoint[]>;
}

/**
 * @param fresh Bypass the read cache (used right after ingestion, e.g. for the
 *              Daily Air Brief); visitor requests use the cached reads.
 */
export function createGuardianDataSource({ fresh = false }: { fresh?: boolean } = {}): GuardianDataSource {
  const db = createSupabasePublicClient();
  return {
    now: () => new Date(),
    listAreas: () => getAreas(db),
    getCurrent: async (slug) =>
      withCurrentFreshness(fresh ? await getAreaAirQuality(db, slug) : await getAreaAirQualityCached(slug), new Date()),
    getForecast: async (slug, hours) =>
      withCurrentForecastFreshness(
        fresh ? await getAreaForecast(db, slug, hours) : await getAreaForecastCached(slug, hours),
        new Date(),
      ),
    getStations: () => getStationsOverview(db),
    getStationsPollutant: (pollutant) => getStationsLatestPollutant(db, pollutant),
    getStationHistory: (stationId, hours) => getStationHistory(db, stationId, hours),
  };
}
