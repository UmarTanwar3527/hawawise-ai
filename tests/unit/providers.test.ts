import { describe, expect, it } from "vitest";

import { normaliseOpenMeteoLocation } from "@/services/providers/open-meteo/normalise";
import {
  mergeHourlySeries,
  selectActiveSensors,
} from "@/services/providers/openaq/normalise";
import type { OpenAqHoursResponse } from "@/services/providers/openaq/schemas";
import type { Station } from "@/services/providers/provider.interface";
import { normaliseUnit } from "@/services/normalisation/units";

// Inputs below are constructed to mirror the shape of real provider responses.

describe("normaliseUnit", () => {
  it.each([
    ["µg/m³", "ug_m3"], // micro sign (OpenAQ)
    ["μg/m³", "ug_m3"], // Greek mu (Open-Meteo)
    ["mg/m³", "mg_m3"],
    ["ppb", "ppb"],
    ["PPM", "ppm"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseUnit(raw)).toBe(expected);
  });

  it("returns null for unrecognised units rather than guessing", () => {
    expect(normaliseUnit("c")).toBeNull();
    expect(normaliseUnit("")).toBeNull();
  });
});

const station: Station = {
  externalId: "5612",
  name: "Test station",
  latitude: 26.95,
  longitude: 75.73,
  network: "CPCB",
  operator: "RSPCB",
  isMonitor: true,
  lastObservedAt: new Date("2026-11-25T03:15:00Z"),
  sensors: [
    { id: "15005", pollutant: "pm25", unit: "ug_m3", rawUnit: "µg/m³" }, // retired
    { id: "12234876", pollutant: "pm25", unit: "ug_m3", rawUnit: "µg/m³" }, // current
    { id: "12234871", pollutant: "co", unit: "ppb", rawUnit: "ppb" },
    { id: "999", pollutant: "nh3", unit: null, rawUnit: "furlongs" },
  ],
};

describe("OpenAQ sensor selection", () => {
  const latest = {
    results: [
      { sensorsId: 15005, datetime: { utc: "2022-10-31T01:45:00Z" }, value: 10 },
      { sensorsId: 12234876, datetime: { utc: "2026-11-25T03:15:00Z" }, value: 92 },
      { sensorsId: 12234871, datetime: { utc: "2026-11-25T03:15:00Z" }, value: 1.2 },
    ],
  };

  it("picks the sensor that reported most recently and skips unknown units", () => {
    const { sensors, skipped } = selectActiveSensors(
      station,
      latest,
      new Date("2026-11-24T00:00:00Z"),
    );
    expect(sensors.map((sensor) => sensor.id)).toEqual(["12234876", "12234871"]);
    expect(skipped).toContainEqual({ pollutant: "nh3", reason: "unknown_unit", detail: "furlongs" });
  });

  it("skips pollutants whose sensors have not reported in the window", () => {
    const { sensors, skipped } = selectActiveSensors(
      station,
      { results: [latest.results[0]!] },
      new Date("2026-11-24T00:00:00Z"),
    );
    expect(sensors).toEqual([]);
    expect(skipped).toContainEqual({ pollutant: "pm25", reason: "no_recent_data" });
  });
});

describe("OpenAQ hourly merge", () => {
  const hour = (end: string, value: number | null, percent: number | null): OpenAqHoursResponse["results"][number] => ({
    value,
    parameter: { name: "pm25", units: "µg/m³" },
    period: {
      datetimeFrom: { utc: new Date(Date.parse(end) - 3_600_000).toISOString() },
      datetimeTo: { utc: end },
    },
    coverage: { percentComplete: percent },
  });
  const sensor = station.sensors[1]!;
  const fetchedAt = new Date("2026-11-25T03:20:00Z");

  it("keeps complete hours with their unit, averaging period and coverage", () => {
    const { observations } = mergeHourlySeries(
      [{ sensor, response: { results: [hour("2026-11-25T02:30:00Z", 92, 100)] } }],
      fetchedAt,
    );
    expect(observations).toEqual([
      {
        observedAt: new Date("2026-11-25T02:30:00Z"),
        pollutants: [
          { pollutant: "pm25", value: 92, unit: "ug_m3", averagingPeriod: "1h", coveragePercent: 100 },
        ],
      },
    ]);
  });

  it("drops hours that have not ended, low-coverage hours and negative values", () => {
    const { observations, skipped } = mergeHourlySeries(
      [
        {
          sensor,
          response: {
            results: [
              hour("2026-11-25T03:30:00Z", 90, 75), // ends after fetch time
              hour("2026-11-25T01:30:00Z", 80, 25), // too little coverage
              hour("2026-11-25T00:30:00Z", -3, 100), // negative
              hour("2026-11-24T23:30:00Z", null, 100), // no value
              hour("2026-11-24T22:30:00Z", 70, 50), // accepted at 50%
            ],
          },
        },
      ],
      fetchedAt,
    );
    expect(observations.map((o) => o.observedAt.toISOString())).toEqual(["2026-11-24T22:30:00.000Z"]);
    expect(skipped.map((s) => s.reason).sort()).toEqual(["incomplete_hour", "negative_value"]);
  });
});

describe("Open-Meteo normalisation", () => {
  it("omits null values, maps variables and keeps model output unaveraged", () => {
    const observations = normaliseOpenMeteoLocation({
      latitude: 26.9,
      longitude: 75.8,
      hourly_units: { time: "unixtime", pm2_5: "μg/m³", pm10: "μg/m³" },
      hourly: {
        time: [1_764_028_800, 1_764_032_400, 1_764_036_000],
        pm2_5: [25.1, null, null],
        pm10: [27.9, 30, null],
      },
    });
    expect(observations).toHaveLength(2);
    expect(observations[0]?.pollutants).toEqual([
      { pollutant: "pm25", value: 25.1, unit: "ug_m3", averagingPeriod: null, coveragePercent: null },
      { pollutant: "pm10", value: 27.9, unit: "ug_m3", averagingPeriod: null, coveragePercent: null },
    ]);
    expect(observations[1]?.pollutants.map((p) => p.pollutant)).toEqual(["pm10"]);
  });
});
