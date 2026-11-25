import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  MEASURED_STALE_AFTER_HOURS,
  MODELLED_STALE_AFTER_HOURS,
  NEAREST_STATION_MAX_KM,
} from "../constants";

import type {
  AqiScaleCode,
  AqiValueOrigin,
  CpcbAqiCategoryId,
  PollutantCode,
  PollutantUnit,
  PollutantValue,
} from "../types/aqi";

type Db = SupabaseClient<Database>;

const HOUR = 3_600_000;

/** A pollutant value as stored (same shape as the provider-normalised value). */
export type PollutantReading = PollutantValue;

export type AqiReading = {
  scale: AqiScaleCode;
  value: number;
  isLowerBound: boolean;
  category: CpcbAqiCategoryId | null;
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
          id: string;
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
  /** Start of the 6-hour block this run is grouped under (not the model run time). */
  issuedAt: string | null;
  /** When Hawa AI fetched this forecast run. */
  fetchedAt: string | null;
  isStale: boolean;
  hours: { forecastFor: string; pollutants: PollutantReading[] }[];
  unavailable: string[];
};

/** A forecast older than this (since fetch) is flagged stale. */
export const FORECAST_STALE_AFTER_HOURS = 12;

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

/**
 * Recomputes age and staleness at response time. Cached results carry the
 * age from when they were cached, which understates it.
 */
export function withCurrentFreshness(current: AreaAirQuality, now: Date): AreaAirQuality {
  return {
    ...current,
    measured: current.measured
      ? {
          ...current.measured,
          ...freshness(current.measured.observedAt, current.measured.fetchedAt, MEASURED_STALE_AFTER_HOURS, now),
        }
      : null,
    modelled: current.modelled
      ? {
          ...current.modelled,
          ...freshness(current.modelled.observedAt, current.modelled.fetchedAt, MODELLED_STALE_AFTER_HOURS, now),
        }
      : null,
  };
}

export function withCurrentForecastFreshness(forecast: AreaForecast, now: Date): AreaForecast {
  return {
    ...forecast,
    isStale:
      forecast.fetchedAt !== null &&
      now.getTime() - Date.parse(forecast.fetchedAt) > FORECAST_STALE_AFTER_HOURS * HOUR,
    hours: forecast.hours.filter((hour) => Date.parse(hour.forecastFor) > now.getTime()),
  };
}

const CPCB_CATEGORY_IDS: readonly string[] = [
  "good",
  "satisfactory",
  "moderate",
  "poor",
  "very_poor",
  "severe",
];

export function isCpcbCategory(value: string | null): value is CpcbAqiCategoryId {
  return value !== null && CPCB_CATEGORY_IDS.includes(value);
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

/** Data source id, or null if the source is missing or inactive. Query failures throw. */
async function getSourceId(db: Db, provider: string): Promise<string | null> {
  const { data, error } = await db.from("data_sources").select("id").eq("provider", provider).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export type StationCandidate = { stationId: string; distanceKm: number; observedAt: string | null };

/**
 * Picks the station to represent an area: the nearest one with a fresh
 * reading; if none is fresh, the nearest one with any reading (shown as stale).
 */
export function chooseStation(
  candidates: StationCandidate[],
  now: Date,
  staleAfterHours = MEASURED_STALE_AFTER_HOURS,
): StationCandidate | null {
  const withData = candidates
    .filter((candidate) => candidate.observedAt !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const fresh = withData.find(
    (candidate) => now.getTime() - Date.parse(candidate.observedAt as string) <= staleAfterHours * HOUR,
  );
  return fresh ?? withData[0] ?? null;
}

export async function getAreaAirQuality(
  db: Db,
  slug: string,
  now: Date = new Date(),
): Promise<AreaAirQuality> {
  const [location, openaqId, openMeteoId, stationsResult] = await Promise.all([
    getLocation(db, slug),
    getSourceId(db, "openaq"),
    getSourceId(db, "open_meteo"),
    db.from("locations").select("id, name, latitude, longitude, metadata").eq("location_type", "monitoring_station"),
  ]);
  if (stationsResult.error) throw stationsResult.error;
  const unavailable: string[] = [];

  const nearby = stationsResult.data
    .map((station) => ({ station, distanceKm: haversineKm(location, station) }))
    .filter(({ distanceKm }) => distanceKm <= NEAREST_STATION_MAX_KM);

  const readingColumns = `id, location_id, observed_at, fetched_at,
    pollutant_values!inner (${POLLUTANT_COLUMNS}),
    aqi_index_values (aqi_scale, aqi_value, is_lower_bound, aqi_category, dominant_pollutant, value_origin, calculation_method, calculation_details)`;

  // Latest readings for all nearby stations in one query (last 48 h). The
  // inner join skips any reading stored without pollutant values.
  const [stationReadings, modelledReading] = await Promise.all([
    openaqId && nearby.length
      ? db
          .from("aqi_readings")
          .select(readingColumns)
          .eq("source_id", openaqId)
          .eq("data_kind", "measured")
          .in("location_id", nearby.map(({ station }) => station.id))
          .gte("observed_at", new Date(now.getTime() - 48 * HOUR).toISOString())
          .order("observed_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    openMeteoId
      ? db
          .from("aqi_readings")
          .select(`observed_at, fetched_at, pollutant_values!inner (${POLLUTANT_COLUMNS})`)
          .eq("location_id", location.id)
          .eq("source_id", openMeteoId)
          .eq("data_kind", "modelled")
          .lte("observed_at", now.toISOString())
          .order("observed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (stationReadings.error) throw stationReadings.error;
  if (modelledReading.error) throw modelledReading.error;

  const latestByStation = new Map<string, NonNullable<typeof stationReadings.data>[number]>();
  for (const reading of stationReadings.data ?? []) {
    if (!latestByStation.has(reading.location_id)) latestByStation.set(reading.location_id, reading);
  }

  let measured: AreaAirQuality["measured"] = null;
  if (!openaqId) {
    unavailable.push("The station data source is not available.");
  } else if (nearby.length === 0) {
    unavailable.push(`No monitoring station within ${NEAREST_STATION_MAX_KM} km of this area.`);
  } else {
    const chosen = chooseStation(
      nearby.map(({ station, distanceKm }) => ({
        stationId: station.id,
        distanceKm,
        observedAt: latestByStation.get(station.id)?.observed_at ?? null,
      })),
      now,
    );
    const reading = chosen ? latestByStation.get(chosen.stationId) : undefined;
    const station = nearby.find(({ station: s }) => s.id === chosen?.stationId)?.station;

    if (!chosen || !reading || !station) {
      unavailable.push("Nearby stations have no measurements from the last 48 hours.");
    } else {
      const metadata = (station.metadata ?? {}) as { network?: string; operator?: string };
      const aqiRow = reading.aqi_index_values.find((row) => row.aqi_scale === "ind_cpcb");
      measured = {
        provenance: "measured",
        provider: "OpenAQ",
        station: {
          id: station.id,
          name: station.name,
          distanceKm: Math.round(chosen.distanceKm * 10) / 10,
          network: metadata.network ?? null,
          operator: metadata.operator ?? null,
        },
        aqi: aqiRow
          ? {
              scale: aqiRow.aqi_scale as AqiScaleCode,
              value: aqiRow.aqi_value,
              isLowerBound: aqiRow.is_lower_bound,
              category: isCpcbCategory(aqiRow.aqi_category) ? aqiRow.aqi_category : null,
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
    }
  }

  let modelled: AreaAirQuality["modelled"] = null;
  if (modelledReading.data) {
    modelled = {
      provenance: "modelled",
      provider: "Open-Meteo",
      pollutants: mapPollutants(modelledReading.data.pollutant_values),
      ...freshness(modelledReading.data.observed_at, modelledReading.data.fetched_at, MODELLED_STALE_AFTER_HOURS, now),
    };
  } else {
    unavailable.push("No modelled estimate is stored for this area yet.");
  }

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
  const [location, sourceId] = await Promise.all([getLocation(db, slug), getSourceId(db, "open_meteo")]);
  const empty: AreaForecast = {
    location: { slug: location.slug, name: location.name },
    provenance: "forecast",
    provider: "Open-Meteo",
    issuedAt: null,
    fetchedAt: null,
    isStale: false,
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
    .select(`forecast_for, fetched_at, pollutant_values!inner (${POLLUTANT_COLUMNS})`)
    .eq("location_id", location.id)
    .eq("source_id", sourceId)
    .eq("issued_at", latestRun.issued_at)
    .gt("forecast_for", now.toISOString())
    .lte("forecast_for", new Date(now.getTime() + hoursAhead * HOUR).toISOString())
    .order("forecast_for");
  if (error) throw error;

  const fetchedAt = data.reduce<string | null>(
    (latest, row) => (latest === null || Date.parse(row.fetched_at) > Date.parse(latest) ? row.fetched_at : latest),
    null,
  );

  return withCurrentForecastFreshness(
    {
      ...empty,
      issuedAt: latestRun.issued_at,
      fetchedAt,
      hours: data.map((row) => ({
        forecastFor: row.forecast_for,
        pollutants: mapPollutants(row.pollutant_values),
      })),
      unavailable: data.length === 0 ? ["The stored forecast has no future hours."] : [],
    },
    now,
  );
}

export type AreaSummary = {
  slug: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
};

/** Areas a visitor can choose (city centre and neighbourhoods). */
export async function getAreas(db: Db): Promise<AreaSummary[]> {
  const { data, error } = await db
    .from("locations")
    .select("slug, name, location_type, latitude, longitude")
    .in("location_type", ["city_centre", "neighbourhood"])
    .order("location_type")
    .order("name");
  if (error) throw error;
  return data.map((row) => ({
    slug: row.slug,
    name: row.name,
    type: row.location_type,
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

export type StationOverview = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  network: string | null;
  operator: string | null;
  observedAt: string | null;
  aqi: { value: number; isLowerBound: boolean; category: string | null } | null;
};

/** Every active station with its latest calculated CPCB AQI (last 12 hours). */
export async function getStationsOverview(db: Db, now: Date = new Date()): Promise<StationOverview[]> {
  const [{ data: stations, error: stationError }, sourceId] = await Promise.all([
    db
      .from("locations")
      .select("id, name, latitude, longitude, metadata")
      .eq("location_type", "monitoring_station")
      .order("name"),
    getSourceId(db, "openaq"),
  ]);
  if (stationError) throw stationError;
  if (!sourceId || stations.length === 0) return [];

  const { data: readings, error } = await db
    .from("aqi_readings")
    .select("location_id, observed_at, aqi_index_values (aqi_scale, aqi_value, is_lower_bound, aqi_category)")
    .eq("source_id", sourceId)
    .eq("data_kind", "measured")
    .in("location_id", stations.map((station) => station.id))
    .gte("observed_at", new Date(now.getTime() - 12 * HOUR).toISOString())
    .order("observed_at", { ascending: false });
  if (error) throw error;

  // Latest reading per station that has a CPCB value.
  const latest = new Map<string, (typeof readings)[number]>();
  for (const reading of readings) {
    if (latest.has(reading.location_id)) continue;
    if (reading.aqi_index_values.some((row) => row.aqi_scale === "ind_cpcb")) {
      latest.set(reading.location_id, reading);
    }
  }

  return stations.map((station) => {
    const reading = latest.get(station.id);
    const aqi = reading?.aqi_index_values.find((row) => row.aqi_scale === "ind_cpcb");
    const metadata = (station.metadata ?? {}) as { network?: string; operator?: string };
    return {
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      network: metadata.network ?? null,
      operator: metadata.operator ?? null,
      observedAt: reading?.observed_at ?? null,
      aqi: aqi
        ? { value: aqi.aqi_value, isLowerBound: aqi.is_lower_bound, category: aqi.aqi_category }
        : null,
    };
  });
}

export type StationHistoryPoint = {
  observedAt: string;
  values: Partial<Record<PollutantCode, { value: number; unit: PollutantUnit }>>;
};

/** Hourly station measurements for the last `hours` hours, oldest first. */
export async function getStationHistory(
  db: Db,
  stationId: string,
  hours = 24,
  now: Date = new Date(),
): Promise<StationHistoryPoint[]> {
  const sourceId = await getSourceId(db, "openaq");
  if (!sourceId) return [];
  const { data, error } = await db
    .from("aqi_readings")
    .select("observed_at, pollutant_values (pollutant, value, unit)")
    .eq("location_id", stationId)
    .eq("source_id", sourceId)
    .eq("data_kind", "measured")
    .gte("observed_at", new Date(now.getTime() - hours * HOUR).toISOString())
    .order("observed_at");
  if (error) throw error;
  return data.map((row) => ({
    observedAt: row.observed_at,
    values: Object.fromEntries(
      row.pollutant_values.map((value) => [
        value.pollutant,
        { value: value.value, unit: value.unit as PollutantUnit },
      ]),
    ),
  }));
}

export type AreaModelledOverview = {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Latest modelled PM2.5 for the area's model grid cell, if stored in the last 6 hours. */
  pm25: { value: number; unit: PollutantUnit; observedAt: string } | null;
};

/** Areas with their latest modelled PM2.5 (Open-Meteo). Never a station measurement. */
export async function getAreasModelledOverview(db: Db, now: Date = new Date()): Promise<AreaModelledOverview[]> {
  const [areas, sourceId] = await Promise.all([getAreas(db), getSourceId(db, "open_meteo")]);
  if (!sourceId || areas.length === 0) return areas.map((area) => ({ ...area, pm25: null }));

  const { data: locations, error: locationError } = await db
    .from("locations")
    .select("id, slug")
    .in("slug", areas.map((area) => area.slug));
  if (locationError) throw locationError;
  const slugById = new Map(locations.map((row) => [row.id, row.slug]));

  const { data, error } = await db
    .from("aqi_readings")
    .select("location_id, observed_at, pollutant_values!inner (pollutant, value, unit)")
    .eq("source_id", sourceId)
    .eq("data_kind", "modelled")
    .eq("pollutant_values.pollutant", "pm25")
    .in("location_id", locations.map((row) => row.id))
    .lte("observed_at", now.toISOString())
    .gte("observed_at", new Date(now.getTime() - 6 * HOUR).toISOString())
    .order("observed_at", { ascending: false });
  if (error) throw error;

  const latest = new Map<string, AreaModelledOverview["pm25"]>();
  for (const row of data) {
    const slug = slugById.get(row.location_id);
    const value = row.pollutant_values[0];
    if (!slug || !value || latest.has(slug)) continue;
    latest.set(slug, { value: value.value, unit: value.unit as PollutantUnit, observedAt: row.observed_at });
  }
  return areas.map((area) => ({
    slug: area.slug,
    name: area.name,
    latitude: area.latitude,
    longitude: area.longitude,
    pm25: latest.get(area.slug) ?? null,
  }));
}

export type StationPollutantReading = {
  stationId: string;
  value: number;
  unit: PollutantUnit;
  observedAt: string;
};

/** Latest measured value of one pollutant per station (mass units only), from the last 48 hours. */
export async function getStationsLatestPollutant(
  db: Db,
  pollutant: "pm25" | "pm10",
  now: Date = new Date(),
): Promise<StationPollutantReading[]> {
  const sourceId = await getSourceId(db, "openaq");
  if (!sourceId) return [];
  const { data, error } = await db
    .from("aqi_readings")
    .select("location_id, observed_at, pollutant_values!inner (pollutant, value, unit)")
    .eq("source_id", sourceId)
    .eq("data_kind", "measured")
    .eq("pollutant_values.pollutant", pollutant)
    .eq("pollutant_values.unit", "ug_m3")
    .gte("observed_at", new Date(now.getTime() - 48 * HOUR).toISOString())
    .order("observed_at", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, StationPollutantReading>();
  for (const row of data) {
    const value = row.pollutant_values[0];
    if (!value || latest.has(row.location_id)) continue;
    latest.set(row.location_id, {
      stationId: row.location_id,
      value: value.value,
      unit: value.unit as PollutantUnit,
      observedAt: row.observed_at,
    });
  }
  return [...latest.values()];
}
