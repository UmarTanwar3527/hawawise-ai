import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type {
  AqiScaleCode,
  AqiValueOrigin,
  CpcbAqiCategoryId,
  PollutantCode,
  PollutantUnit,
} from "../types/aqi";

type Db = SupabaseClient<Database>;

const HOUR = 3_600_000;
/**
 * Jaipur station data reached OpenAQ about 2.5 h after the hour ended
 * (observed 2026-11-25), so measurements older than 4 h are flagged stale.
 */
export const MEASURED_STALE_AFTER_HOURS = 4;
export const MODELLED_STALE_AFTER_HOURS = 3;
/** Only stations this close to an area are offered as its "nearest station". */
export const NEAREST_STATION_MAX_KM = 10;

export type PollutantReading = {
  pollutant: PollutantCode;
  value: number;
  unit: PollutantUnit;
  averagingPeriod: string | null;
  coveragePercent: number | null;
};

export type AqiReading = {
  scale: AqiScaleCode;
  value: number;
  isLowerBound: boolean;
  category: CpcbAqiCategoryId | string | null;
  dominantPollutant: string | null;
  origin: AqiValueOrigin;
  calculationMethod: string | null;
  calculationDetails: unknown;
};

export type Freshness = {
  observedAt: string;
  fetchedAt: string;
  ageMinutes: number;
  isStale: boolean;
};

export type AreaAirQuality = {
  location: {
    slug: string;
    name: string;
    latitude: number;
    longitude: number;
    type: string;
  };
  measured:
    | ({
        provenance: "measured";
        provider: "OpenAQ";
        station: {
          name: string;
          distanceKm: number;
          network: string | null;
          operator: string | null;
        };
        aqi: AqiReading | null;
        pollutants: PollutantReading[];
      } & Freshness)
    | null;
  modelled:
    | ({
        provenance: "modelled";
        provider: "Open-Meteo";
        pollutants: PollutantReading[];
      } & Freshness)
    | null;
  /** Explicit reasons for anything missing, for honest empty states. */
  unavailable: string[];
};

export type AreaForecast = {
  location: { slug: string; name: string };
  provenance: "forecast";
  provider: "Open-Meteo";
  issuedAt: string | null;
  hours: { forecastFor: string; pollutants: PollutantReading[] }[];
  unavailable: string[];
};

export class LocationNotFoundError extends Error {
  constructor(slug: string) {
    super(`Unknown location: ${slug}`);
    this.name = "LocationNotFoundError";
  }
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function freshness(observedAt: string, fetchedAt: string, staleAfterHours: number, now: Date): Freshness {
  const ageMinutes = Math.max(0, Math.round((now.getTime() - Date.parse(observedAt)) / 60_000));
  return { observedAt, fetchedAt, ageMinutes, isStale: ageMinutes > staleAfterHours * 60 };
}

type PollutantRow = {
  pollutant: string;
  value: number;
  unit: string;
  averaging_period: string | null;
  coverage_percent: number | null;
};

function mapPollutants(rows: PollutantRow[]): PollutantReading[] {
  return rows.map((row) => ({
    pollutant: row.pollutant as PollutantCode,
    value: row.value,
    unit: row.unit as PollutantUnit,
    averagingPeriod: row.averaging_period,
    coveragePercent: row.coverage_percent,
  }));
}

const POLLUTANT_COLUMNS = "pollutant, value, unit, averaging_period, coverage_percent";

async function getLocation(db: Db, slug: string) {
  const { data, error } = await db
    .from("locations")
    .select("id, slug, name, latitude, longitude, location_type")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new LocationNotFoundError(slug);
  return data;
}

async function getSourceId(db: Db, provider: string): Promise<string | null> {
  const { data } = await db.from("data_sources").select("id").eq("provider", provider).maybeSingle();
  return data?.id ?? null;
}

export async function getAreaAirQuality(
  db: Db,
  slug: string,
  now: Date = new Date(),
): Promise<AreaAirQuality> {
  const location = await getLocation(db, slug);
  const unavailable: string[] = [];
  const [openaqId, openMeteoId] = await Promise.all([
    getSourceId(db, "openaq"),
    getSourceId(db, "open_meteo"),
  ]);

  // Measured: nearest active station that has data.
  let measured: AreaAirQuality["measured"] = null;
  const { data: stations, error: stationError } = await db
    .from("locations")
    .select("id, name, latitude, longitude, metadata")
    .eq("location_type", "monitoring_station");
  if (stationError) throw stationError;

  const nearby = stations
    .map((station) => ({ station, distanceKm: haversineKm(location, station) }))
    .filter(({ distanceKm }) => distanceKm <= NEAREST_STATION_MAX_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!openaqId || nearby.length === 0) {
    unavailable.push(`No monitoring station within ${NEAREST_STATION_MAX_KM} km of this area.`);
  } else {
    for (const { station, distanceKm } of nearby) {
      const { data: reading, error } = await db
        .from("aqi_readings")
        .select(
          `observed_at, fetched_at,
           pollutant_values (${POLLUTANT_COLUMNS}),
           aqi_index_values (aqi_scale, aqi_value, is_lower_bound, aqi_category, dominant_pollutant, value_origin, calculation_method, calculation_details)`,
        )
        .eq("location_id", station.id)
        .eq("source_id", openaqId)
        .eq("data_kind", "measured")
        .order("observed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!reading) continue;

      const metadata = (station.metadata ?? {}) as { network?: string; operator?: string };
      const aqiRow = reading.aqi_index_values.find((row) => row.aqi_scale === "ind_cpcb");
      measured = {
        provenance: "measured",
        provider: "OpenAQ",
        station: {
          name: station.name,
          distanceKm: Math.round(distanceKm * 10) / 10,
          network: metadata.network ?? null,
          operator: metadata.operator ?? null,
        },
        aqi: aqiRow
          ? {
              scale: aqiRow.aqi_scale as AqiScaleCode,
              value: aqiRow.aqi_value,
              isLowerBound: aqiRow.is_lower_bound,
              category: aqiRow.aqi_category,
              dominantPollutant: aqiRow.dominant_pollutant,
              origin: aqiRow.value_origin as AqiValueOrigin,
              calculationMethod: aqiRow.calculation_method,
              calculationDetails: aqiRow.calculation_details,
            }
          : null,
        pollutants: mapPollutants(reading.pollutant_values),
        ...freshness(reading.observed_at, reading.fetched_at, MEASURED_STALE_AFTER_HOURS, now),
      };
      if (!aqiRow) {
        unavailable.push(
          "CPCB AQI could not be calculated for the latest hour (not enough pollutants or hours of data).",
        );
      }
      break;
    }
    if (!measured) unavailable.push("Nearby stations have no stored measurements yet.");
  }

  // Modelled: the area's own grid estimate.
  let modelled: AreaAirQuality["modelled"] = null;
  if (openMeteoId) {
    const { data: reading, error } = await db
      .from("aqi_readings")
      .select(`observed_at, fetched_at, pollutant_values (${POLLUTANT_COLUMNS})`)
      .eq("location_id", location.id)
      .eq("source_id", openMeteoId)
      .eq("data_kind", "modelled")
      .lte("observed_at", now.toISOString())
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (reading) {
      modelled = {
        provenance: "modelled",
        provider: "Open-Meteo",
        pollutants: mapPollutants(reading.pollutant_values),
        ...freshness(reading.observed_at, reading.fetched_at, MODELLED_STALE_AFTER_HOURS, now),
      };
    }
  }
  if (!modelled) unavailable.push("No modelled estimate is stored for this area yet.");
  if (measured?.isStale) unavailable.push("The latest station measurement is stale.");
  if (modelled?.isStale) unavailable.push("The latest modelled estimate is stale.");

  return {
    location: {
      slug: location.slug,
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      type: location.location_type,
    },
    measured,
    modelled,
    unavailable,
  };
}

export async function getAreaForecast(
  db: Db,
  slug: string,
  hoursAhead = 96,
  now: Date = new Date(),
): Promise<AreaForecast> {
  const location = await getLocation(db, slug);
  const sourceId = await getSourceId(db, "open_meteo");
  const empty: AreaForecast = {
    location: { slug: location.slug, name: location.name },
    provenance: "forecast",
    provider: "Open-Meteo",
    issuedAt: null,
    hours: [],
    unavailable: ["No forecast is stored for this area yet."],
  };
  if (!sourceId) return empty;

  const { data: latestRun, error: runError } = await db
    .from("pollution_forecasts")
    .select("issued_at")
    .eq("location_id", location.id)
    .eq("source_id", sourceId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw runError;
  if (!latestRun) return empty;

  const { data, error } = await db
    .from("pollution_forecasts")
    .select(`forecast_for, pollutant_values (${POLLUTANT_COLUMNS})`)
    .eq("location_id", location.id)
    .eq("source_id", sourceId)
    .eq("issued_at", latestRun.issued_at)
    .gt("forecast_for", now.toISOString())
    .lte("forecast_for", new Date(now.getTime() + hoursAhead * HOUR).toISOString())
    .order("forecast_for");
  if (error) throw error;

  return {
    ...empty,
    issuedAt: latestRun.issued_at,
    hours: data.map((row) => ({
      forecastFor: row.forecast_for,
      pollutants: mapPollutants(row.pollutant_values),
    })),
    unavailable: data.length === 0 ? ["The stored forecast has no future hours."] : [],
  };
}
