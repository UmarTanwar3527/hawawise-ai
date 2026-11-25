import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { siteConfig } from "@/config/site";
import {
  calculateCpcbAqi,
  type HourlyConcentration,
} from "@/features/air-quality/cpcb-aqi-calculator";
import type { Database, Json } from "@/lib/supabase/database.types";
import { mapWithConcurrency, ProviderError } from "@/services/providers/http";
import { OPENAQ_MAX_RADIUS_METRES } from "@/services/providers/openaq/client";
import type {
  HourlyObservation,
  ModelledGridProvider,
  Station,
  StationNetworkProvider,
} from "@/services/providers/provider.interface";

type Db = SupabaseClient<Database>;

const HOUR = 3_600_000;
/**
 * Station history fetched per run. The AQI is only calculated for hours whose
 * full 24 h window lies inside this range (see hoursWithCompleteWindow), so
 * stored values are never recomputed from a truncated window.
 */
const STATION_WINDOW_HOURS = 30;
const AQI_WINDOW_HOURS = 24;
/** A station with no data for this long is stored but marked inactive. */
const STATION_INACTIVE_AFTER_HOURS = 7 * 24;
/** Forecast runs are grouped into 6-hour blocks to bound storage. */
const FORECAST_BLOCK_HOURS = 6;
const FORECAST_RETENTION_DAYS = 3;
const PAYLOAD_RETENTION_DAYS = 7;
const CHUNK = 500;

export type ProviderRunSummary = {
  provider: "openaq" | "open_meteo";
  status: "success" | "partial" | "failed" | "skipped";
  recordsWritten: number;
  notes: string[];
};

export type IngestionSummary = {
  startedAt: string;
  finishedAt: string;
  providers: ProviderRunSummary[];
};

export type IngestionDeps = {
  db: Db;
  stations: StationNetworkProvider | null;
  model: ModelledGridProvider;
  now?: () => Date;
};

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Safe, non-sensitive error description: provider errors or a database error code. */
function describeError(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return `database error ${error.code}`;
  }
  return "internal error";
}

/**
 * Hours whose AQI averaging window (24 h) is fully covered by the fetched
 * range. Recomputing older hours from a shorter slice would overwrite good
 * values with averages built from fewer hours.
 */
export function hoursWithCompleteWindow(observations: HourlyObservation[], windowFrom: Date): HourlyObservation[] {
  const earliestAsOf = windowFrom.getTime() + AQI_WINDOW_HOURS * HOUR;
  return observations.filter((observation) => observation.observedAt.getTime() >= earliestAsOf);
}

async function getSourceIds(db: Db) {
  const { data, error } = await db
    .from("data_sources")
    .select("id, provider")
    .in("provider", ["openaq", "open_meteo"]);
  if (error) throw error;
  const byProvider = new Map(data.map((row) => [row.provider, row.id]));
  const openaq = byProvider.get("openaq");
  const openMeteo = byProvider.get("open_meteo");
  if (!openaq || !openMeteo) throw new Error("Data sources are not seeded");
  return { openaq, openMeteo };
}

async function startLog(db: Db, sourceId: string): Promise<string | null> {
  const { data } = await db
    .from("provider_sync_logs")
    .insert({ source_id: sourceId })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function finishLog(db: Db, logId: string | null, summary: ProviderRunSummary) {
  if (!logId) return;
  await db
    .from("provider_sync_logs")
    .update({
      finished_at: new Date().toISOString(),
      status: summary.status === "skipped" ? "failed" : summary.status,
      records_written: summary.recordsWritten,
      details: { notes: summary.notes.slice(0, 50) },
    })
    .eq("id", logId);
}

async function storePayload(
  db: Db,
  sourceId: string,
  endpoint: string,
  requestParams: { [key: string]: Json },
  payload: unknown,
  fetchedAt: Date,
): Promise<string | null> {
  const { data, error } = await db
    .from("provider_payloads")
    .insert({
      source_id: sourceId,
      endpoint,
      request_params: requestParams,
      payload: (payload ?? {}) as NonNullable<Json>,
      fetched_at: fetchedAt.toISOString(),
      expires_at: new Date(fetchedAt.getTime() + PAYLOAD_RETENTION_DAYS * 24 * HOUR).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Upserts readings and their pollutant values; returns reading ids by time. */
async function writeReadings(
  db: Db,
  params: {
    locationId: string;
    sourceId: string;
    payloadId: string | null;
    dataKind: "measured" | "modelled";
    fetchedAt: Date;
    observations: HourlyObservation[];
  },
): Promise<{ idsByTime: Map<number, string>; written: number }> {
  const idsByTime = new Map<number, string>();
  if (params.observations.length === 0) return { idsByTime, written: 0 };

  const readingRows = params.observations.map((observation) => ({
    location_id: params.locationId,
    source_id: params.sourceId,
    payload_id: params.payloadId,
    data_kind: params.dataKind,
    observed_at: observation.observedAt.toISOString(),
    fetched_at: params.fetchedAt.toISOString(),
  }));

  for (const rows of chunk(readingRows)) {
    const { data, error } = await db
      .from("aqi_readings")
      .upsert(rows, { onConflict: "location_id,source_id,observed_at" })
      .select("id, observed_at");
    if (error) throw error;
    for (const row of data) idsByTime.set(Date.parse(row.observed_at), row.id);
  }

  const valueRows = params.observations.flatMap((observation) => {
    const readingId = idsByTime.get(observation.observedAt.getTime());
    if (!readingId) return [];
    return observation.pollutants.map((value) => ({
      reading_id: readingId,
      forecast_id: null,
      pollutant: value.pollutant,
      value: value.value,
      unit: value.unit,
      averaging_period: value.averagingPeriod,
      coverage_percent: value.coveragePercent,
    }));
  });

  for (const rows of chunk(valueRows)) {
    const { error } = await db
      .from("pollutant_values")
      .upsert(rows, { onConflict: "reading_id,forecast_id,pollutant" });
    if (error) throw error;
  }

  return { idsByTime, written: readingRows.length + valueRows.length };
}

async function upsertStations(db: Db, sourceId: string, stations: Station[], now: Date) {
  const rows = stations.map((station) => ({
    slug: `openaq-${station.externalId}`,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    location_type: "monitoring_station",
    coordinate_source: `OpenAQ location ${station.externalId}`,
    source_id: sourceId,
    external_ref: station.externalId,
    is_active:
      station.lastObservedAt !== null &&
      now.getTime() - station.lastObservedAt.getTime() <= STATION_INACTIVE_AFTER_HOURS * HOUR,
    metadata: {
      network: station.network,
      operator: station.operator,
      openaqLocationId: station.externalId,
      lastObservedAt: station.lastObservedAt?.toISOString() ?? null,
    },
  }));
  if (rows.length === 0) return new Map<string, { id: string; active: boolean }>();

  const { data, error } = await db
    .from("locations")
    .upsert(rows, { onConflict: "source_id,external_ref" })
    .select("id, external_ref, is_active");
  if (error) throw error;
  return new Map(
    data.map((row) => [row.external_ref ?? "", { id: row.id, active: row.is_active }]),
  );
}

async function ingestStations(
  deps: IngestionDeps,
  sourceId: string,
  now: Date,
): Promise<ProviderRunSummary> {
  const summary: ProviderRunSummary = {
    provider: "openaq",
    status: "success",
    recordsWritten: 0,
    notes: [],
  };
  if (!deps.stations) {
    return { ...summary, status: "skipped", notes: ["OPENAQ_API_KEY is not configured"] };
  }
  const provider = deps.stations;
  const { db } = deps;

  const { centre } = siteConfig.pilotCity;
  const discovery = await provider.discoverStations(centre, OPENAQ_MAX_RADIUS_METRES);
  await storePayload(db, sourceId, "locations", { radius: OPENAQ_MAX_RADIUS_METRES }, discovery.rawPayload, now);
  const stationRows = await upsertStations(db, sourceId, discovery.stations, now);
  summary.recordsWritten += stationRows.size;

  const active = discovery.stations.filter((station) => stationRows.get(station.externalId)?.active);
  summary.notes.push(`${active.length} active of ${discovery.stations.length} stations`);

  const window = { from: new Date(now.getTime() - STATION_WINDOW_HOURS * HOUR), to: now };
  let failures = 0;

  // Two at a time keeps a run (about 7 requests per station) under OpenAQ's 60/min.
  await mapWithConcurrency(active, 2, async (station) => {
    const locationId = stationRows.get(station.externalId)?.id;
    if (!locationId) return;
    try {
      const series = await provider.fetchHourlySeries(station, window);
      const payloadId = await storePayload(
        db,
        sourceId,
        "station_hours",
        { station: station.externalId, from: window.from.toISOString(), to: window.to.toISOString() },
        series.rawPayload,
        series.fetchedAt,
      );
      const { idsByTime, written } = await writeReadings(db, {
        locationId,
        sourceId,
        payloadId,
        dataKind: "measured",
        fetchedAt: series.fetchedAt,
        observations: series.observations,
      });
      summary.recordsWritten += written;

      const concentrations: HourlyConcentration[] = series.observations.flatMap((observation) =>
        observation.pollutants.map((value) => ({
          observedAt: observation.observedAt,
          pollutant: value.pollutant,
          value: value.value,
          unit: value.unit,
        })),
      );

      const aqiRows = hoursWithCompleteWindow(series.observations, window.from).flatMap((observation) => {
        const result = calculateCpcbAqi(concentrations, observation.observedAt);
        const readingId = idsByTime.get(observation.observedAt.getTime());
        if (!result.ok || !readingId) return [];
        return [
          {
            reading_id: readingId,
            forecast_id: null,
            aqi_scale: "ind_cpcb",
            aqi_value: result.aqi,
            aqi_category: result.category,
            dominant_pollutant: result.dominantPollutant,
            value_origin: "hawa_calculated",
            calculation_method: result.method,
            is_lower_bound: result.isLowerBound,
            calculation_details: {
              subIndices: result.subIndices,
              excluded: result.excluded,
            } as unknown as Json,
          },
        ];
      });
      if (aqiRows.length > 0) {
        const { error } = await db
          .from("aqi_index_values")
          .upsert(aqiRows, { onConflict: "reading_id,forecast_id,aqi_scale" });
        if (error) throw error;
        summary.recordsWritten += aqiRows.length;
      }

      const skippedKinds = [...new Set(series.skipped.map((s) => `${s.pollutant}:${s.reason}`))];
      summary.notes.push(
        `${station.name}: ${series.observations.length} hours, ${aqiRows.length} AQI values` +
          (skippedKinds.length ? `; skipped ${skippedKinds.join(", ")}` : ""),
      );
    } catch (error) {
      failures += 1;
      summary.notes.push(`${station.name}: ${describeError(error)}`);
    }
  });

  if (failures > 0) summary.status = failures === active.length ? "failed" : "partial";
  return summary;
}

async function ingestModel(deps: IngestionDeps, sourceId: string): Promise<ProviderRunSummary> {
  const summary: ProviderRunSummary = {
    provider: "open_meteo",
    status: "success",
    recordsWritten: 0,
    notes: [],
  };
  const { db } = deps;

  const { data: areas, error } = await db
    .from("locations")
    .select("id, slug, latitude, longitude")
    .in("location_type", ["city_centre", "neighbourhood"])
    .eq("is_active", true)
    .order("slug");
  if (error) throw error;

  const result = await deps.model.fetchHourly(
    areas.map((area) => ({ latitude: area.latitude, longitude: area.longitude })),
    { pastDays: 1, forecastDays: 5 },
  );
  const payloadId = await storePayload(
    db,
    sourceId,
    "air-quality",
    { points: areas.length, past_days: 1, forecast_days: 5 },
    result.rawPayload,
    result.fetchedAt,
  );

  const fetchedMs = result.fetchedAt.getTime();
  const issuedAt = new Date(
    Math.floor(fetchedMs / (FORECAST_BLOCK_HOURS * HOUR)) * FORECAST_BLOCK_HOURS * HOUR,
  );

  for (const [index, area] of areas.entries()) {
    const series = result.series[index];
    if (!series) continue;

    const past = series.hourly.filter(
      (h) => h.observedAt.getTime() <= fetchedMs && h.observedAt.getTime() > fetchedMs - 24 * HOUR,
    );
    const future = series.hourly.filter((h) => h.observedAt.getTime() > fetchedMs);

    const { written } = await writeReadings(db, {
      locationId: area.id,
      sourceId,
      payloadId,
      dataKind: "modelled",
      fetchedAt: result.fetchedAt,
      observations: past,
    });
    summary.recordsWritten += written;

    if (future.length > 0) {
      const { data: forecasts, error: forecastError } = await db
        .from("pollution_forecasts")
        .upsert(
          future.map((h) => ({
            location_id: area.id,
            source_id: sourceId,
            payload_id: payloadId,
            forecast_for: h.observedAt.toISOString(),
            issued_at: issuedAt.toISOString(),
            fetched_at: result.fetchedAt.toISOString(),
          })),
          { onConflict: "location_id,source_id,forecast_for,issued_at" },
        )
        .select("id, forecast_for");
      if (forecastError) throw forecastError;

      const idsByTime = new Map(forecasts.map((row) => [Date.parse(row.forecast_for), row.id]));
      const valueRows = future.flatMap((h) => {
        const forecastId = idsByTime.get(h.observedAt.getTime());
        if (!forecastId) return [];
        return h.pollutants.map((value) => ({
          reading_id: null,
          forecast_id: forecastId,
          pollutant: value.pollutant,
          value: value.value,
          unit: value.unit,
          averaging_period: value.averagingPeriod,
          coverage_percent: value.coveragePercent,
        }));
      });
      for (const rows of chunk(valueRows)) {
        const { error: valueError } = await db
          .from("pollutant_values")
          .upsert(rows, { onConflict: "reading_id,forecast_id,pollutant" });
        if (valueError) throw valueError;
      }
      summary.recordsWritten += forecasts.length + valueRows.length;
    }

    const grid = `${series.gridPoint.latitude.toFixed(2)},${series.gridPoint.longitude.toFixed(2)}`;
    summary.notes.push(`${area.slug}: grid ${grid}, ${past.length} past h, ${future.length} forecast h`);
  }

  return summary;
}

async function applyRetention(db: Db, now: Date) {
  const forecastCutoff = new Date(now.getTime() - FORECAST_RETENTION_DAYS * 24 * HOUR);
  const results = await Promise.all([
    db.from("pollution_forecasts").delete().lt("issued_at", forecastCutoff.toISOString()),
    db.from("provider_payloads").delete().lt("expires_at", now.toISOString()),
  ]);
  for (const { error } of results) {
    if (error) console.error("retention delete failed", describeError(error));
  }
}

/**
 * One ingestion run: OpenAQ stations (measured) and Open-Meteo (modelled and
 * forecast). Each provider is isolated: one failing does not stop the other.
 */
export async function runAirQualityIngestion(deps: IngestionDeps): Promise<IngestionSummary> {
  const now = deps.now?.() ?? new Date();
  const sources = await getSourceIds(deps.db);
  const runs = [
    { sourceId: sources.openaq, provider: "openaq", run: () => ingestStations(deps, sources.openaq, now) },
    { sourceId: sources.openMeteo, provider: "open_meteo", run: () => ingestModel(deps, sources.openMeteo) },
  ] as const;

  // Providers run in parallel so a slow one cannot starve the other.
  const providers = await Promise.all(
    runs.map(async ({ sourceId, provider, run }): Promise<ProviderRunSummary> => {
      const logId = await startLog(deps.db, sourceId);
      let summary: ProviderRunSummary;
      try {
        summary = await run();
      } catch (error) {
        summary = { provider, status: "failed", recordsWritten: 0, notes: [describeError(error)] };
      }
      await finishLog(deps.db, logId, summary);
      return summary;
    }),
  );

  await applyRetention(deps.db, now);

  return { startedAt: now.toISOString(), finishedAt: new Date().toISOString(), providers };
}
