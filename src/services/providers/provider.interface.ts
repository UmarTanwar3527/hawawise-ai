import type {
  PollutantCode,
  PollutantUnit,
  PollutantValue,
} from "@/features/air-quality/types/aqi";

/**
 * Provider contracts.
 *
 * Station networks and spatial models are different kinds of source, so they
 * have different contracts rather than one interface that blurs them:
 *   - StationNetworkProvider → physical monitors → provenance "measured"
 *   - ModelledGridProvider   → model grid points → provenance "modelled" / "forecast"
 */

export type GeoPoint = { latitude: number; longitude: number };

export type HourlyObservation = {
  /**
   * Station data: end of the averaging hour.
   * Model data: the model's timestamp for that hour.
   */
  observedAt: Date;
  pollutants: PollutantValue[];
};

/** Why a provider value was not used. Recorded, never silently dropped. */
export type SkippedValue = {
  pollutant: PollutantCode | string;
  reason: "unknown_unit" | "no_recent_data" | "negative_value" | "incomplete_hour" | "unsupported_parameter";
  detail?: string;
};

export type StationSensor = {
  id: string;
  pollutant: PollutantCode;
  unit: PollutantUnit | null;
  rawUnit: string;
};

export type Station = {
  externalId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Network the data originates from, e.g. "CPCB". */
  network: string | null;
  /** Operating body, e.g. "Rajasthan State Pollution Control Board". */
  operator: string | null;
  isMonitor: boolean;
  lastObservedAt: Date | null;
  sensors: StationSensor[];
};

export type StationHourlySeries = {
  station: Station;
  observations: HourlyObservation[];
  skipped: SkippedValue[];
  fetchedAt: Date;
  /** Raw provider responses for the audit table. Must not contain secrets. */
  rawPayload: unknown;
};

export interface StationNetworkProvider {
  readonly id: "openaq";
  discoverStations(
    centre: GeoPoint,
    radiusMetres: number,
  ): Promise<{ stations: Station[]; rawPayload: unknown }>;
  fetchHourlySeries(
    station: Station,
    window: { from: Date; to: Date },
  ): Promise<StationHourlySeries>;
}

export type ModelledPointSeries = {
  requested: GeoPoint;
  /** The model grid cell the provider actually used. */
  gridPoint: GeoPoint;
  hourly: HourlyObservation[];
};

export interface ModelledGridProvider {
  readonly id: "open_meteo";
  fetchHourly(
    points: GeoPoint[],
    options: { pastDays: number; forecastDays: number },
  ): Promise<{ series: ModelledPointSeries[]; fetchedAt: Date; rawPayload: unknown }>;
}
