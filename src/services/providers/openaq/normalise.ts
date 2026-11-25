import {
  POLLUTANT_CODES,
  type PollutantCode,
  type PollutantValue,
} from "@/features/air-quality/types/aqi";
import { normaliseUnit } from "@/services/normalisation/units";

import type {
  HourlyObservation,
  SkippedValue,
  Station,
  StationSensor,
} from "../provider.interface";

import type { OpenAqHoursResponse, OpenAqLatestResponse, OpenAqLocation } from "./schemas";

/** Pollutants Hawa AI ingests from stations (others, e.g. weather, are ignored). */
export const OPENAQ_INGESTED_POLLUTANTS: readonly PollutantCode[] = [
  "pm25",
  "pm10",
  "no2",
  "so2",
  "co",
  "o3",
  "nh3",
];

/**
 * Minimum share of 15-minute samples for an hourly average to be stored.
 * Jaipur CPCB feeds on OpenAQ regularly deliver 2 of 4 samples for about a
 * third of hours (observed 2026-11-25), so 50% (≥ 30 minutes) is accepted.
 * Coverage is stored with every value so it stays visible downstream.
 */
export const MIN_HOURLY_COVERAGE_PERCENT = 50;

function toPollutantCode(name: string): PollutantCode | null {
  return (POLLUTANT_CODES as readonly string[]).includes(name) ? (name as PollutantCode) : null;
}

export function normaliseStation(location: OpenAqLocation): Station {
  const sensors: StationSensor[] = [];
  for (const sensor of location.sensors) {
    const pollutant = toPollutantCode(sensor.parameter.name);
    if (!pollutant) continue;
    sensors.push({
      id: String(sensor.id),
      pollutant,
      unit: normaliseUnit(sensor.parameter.units),
      rawUnit: sensor.parameter.units,
    });
  }
  return {
    externalId: String(location.id),
    name: location.name,
    latitude: location.coordinates.latitude,
    longitude: location.coordinates.longitude,
    network: location.provider?.name ?? null,
    operator: location.owner?.name ?? null,
    isMonitor: location.isMonitor,
    lastObservedAt: location.datetimeLast ? new Date(location.datetimeLast.utc) : null,
    sensors,
  };
}

/**
 * Many stations expose two sensors per pollutant (a retired id and a current
 * one). For each pollutant, pick the sensor that reported most recently,
 * preferring mass-concentration units on a tie.
 */
export function selectActiveSensors(
  station: Station,
  latest: OpenAqLatestResponse,
  notBefore: Date,
): { sensors: StationSensor[]; skipped: SkippedValue[] } {
  const lastSeen = new Map<string, number>();
  for (const entry of latest.results) {
    lastSeen.set(String(entry.sensorsId), new Date(entry.datetime.utc).getTime());
  }

  const unitPreference = (sensor: StationSensor) =>
    sensor.unit === "ug_m3" || sensor.unit === "mg_m3" ? 1 : 0;

  const chosen: StationSensor[] = [];
  const skipped: SkippedValue[] = [];

  for (const pollutant of OPENAQ_INGESTED_POLLUTANTS) {
    const candidates = station.sensors.filter((sensor) => sensor.pollutant === pollutant);
    if (candidates.length === 0) continue;

    const known = candidates.filter((sensor) => sensor.unit !== null);
    if (known.length === 0) {
      skipped.push({ pollutant, reason: "unknown_unit", detail: candidates[0]?.rawUnit });
      continue;
    }

    const ranked = [...known].sort((a, b) => {
      const byTime = (lastSeen.get(b.id) ?? 0) - (lastSeen.get(a.id) ?? 0);
      return byTime !== 0 ? byTime : unitPreference(b) - unitPreference(a);
    });
    const best = ranked[0];
    if (!best || (lastSeen.get(best.id) ?? 0) < notBefore.getTime()) {
      skipped.push({ pollutant, reason: "no_recent_data" });
      continue;
    }
    chosen.push(best);
  }

  return { sensors: chosen, skipped };
}

/**
 * Merges per-sensor hourly series into one observation per completed hour.
 * Values are kept in the unit the provider reports for that result.
 */
export function mergeHourlySeries(
  responses: { sensor: StationSensor; response: OpenAqHoursResponse }[],
  fetchedAt: Date,
): { observations: HourlyObservation[]; skipped: SkippedValue[] } {
  const byHour = new Map<number, PollutantValue[]>();
  const skipped: SkippedValue[] = [];

  for (const { sensor, response } of responses) {
    for (const result of response.results) {
      const end = new Date(result.period.datetimeTo.utc);
      // An hour that has not finished yet is not an hourly average.
      if (end.getTime() > fetchedAt.getTime()) continue;
      if (result.value === null) continue;

      const unit = normaliseUnit(result.parameter.units);
      if (!unit) {
        skipped.push({ pollutant: sensor.pollutant, reason: "unknown_unit", detail: result.parameter.units });
        continue;
      }
      if (result.value < 0) {
        skipped.push({ pollutant: sensor.pollutant, reason: "negative_value", detail: end.toISOString() });
        continue;
      }
      const rawCoverage = result.coverage?.percentComplete ?? null;
      // Clamp to the stored range; a provider value above 100% would otherwise fail the write.
      const coverage = rawCoverage === null ? null : Math.min(Math.max(rawCoverage, 0), 100);
      if (coverage !== null && coverage < MIN_HOURLY_COVERAGE_PERCENT) {
        skipped.push({ pollutant: sensor.pollutant, reason: "incomplete_hour", detail: end.toISOString() });
        continue;
      }

      const values = byHour.get(end.getTime()) ?? [];
      values.push({
        pollutant: sensor.pollutant,
        value: result.value,
        unit,
        averagingPeriod: "1h",
        coveragePercent: coverage,
      });
      byHour.set(end.getTime(), values);
    }
  }

  const observations = [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, pollutants]) => ({ observedAt: new Date(time), pollutants }));

  return { observations, skipped };
}
