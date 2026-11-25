import { describe, expect, it } from "vitest";

import { summariseByDay } from "@/features/air-quality/components/dashboard/forecast-days";
import {
  calculateCpcbAqi,
  calculationDetailsSchema,
  type HourlyConcentration,
} from "@/features/air-quality/cpcb-aqi-calculator";
import {
  chooseStation,
  isCpcbCategory,
  withCurrentForecastFreshness,
  withCurrentFreshness,
  type AreaAirQuality,
  type AreaForecast,
} from "@/features/air-quality/services/area-air-quality";
import { hoursWithCompleteWindow } from "@/services/ingestion/air-quality-ingestion";
import { mergeHourlySeries } from "@/services/providers/openaq/normalise";
import { openAqLatestResponseSchema } from "@/services/providers/openaq/schemas";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-25T06:00:00Z");

describe("hoursWithCompleteWindow (AQI overwrite fix)", () => {
  it("only returns hours whose full 24 h window lies inside the fetched range", () => {
    const from = new Date(NOW.getTime() - 30 * HOUR);
    const observations = Array.from({ length: 28 }, (_, i) => ({
      observedAt: new Date(from.getTime() + (i + 1) * HOUR),
      pollutants: [],
    }));
    const eligible = hoursWithCompleteWindow(observations, from);
    expect(eligible.length).toBeGreaterThan(0);
    for (const observation of eligible) {
      expect(observation.observedAt.getTime() - 24 * HOUR).toBeGreaterThanOrEqual(from.getTime());
    }
    // An hour 10 h into the window must never be recalculated from a truncated slice.
    expect(eligible.map((o) => o.observedAt.getTime())).not.toContain(from.getTime() + 10 * HOUR);
  });
});

describe("chooseStation", () => {
  const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();

  it("prefers the nearest station with fresh data over a nearer stale one", () => {
    const chosen = chooseStation(
      [
        { stationId: "near-stale", distanceKm: 2, observedAt: iso(30) },
        { stationId: "far-fresh", distanceKm: 6, observedAt: iso(2) },
      ],
      NOW,
    );
    expect(chosen?.stationId).toBe("far-fresh");
  });

  it("falls back to the nearest station with any data when none is fresh", () => {
    const chosen = chooseStation(
      [
        { stationId: "b", distanceKm: 5, observedAt: iso(20) },
        { stationId: "a", distanceKm: 3, observedAt: iso(30) },
        { stationId: "c", distanceKm: 1, observedAt: null },
      ],
      NOW,
    );
    expect(chosen?.stationId).toBe("a");
  });

  it("returns null when no station has data", () => {
    expect(chooseStation([{ stationId: "x", distanceKm: 1, observedAt: null }], NOW)).toBeNull();
  });
});

describe("render-time freshness", () => {
  it("recomputes age and staleness instead of trusting cached values", () => {
    const cached = {
      location: { slug: "x", name: "X", latitude: 0, longitude: 0, type: "neighbourhood" },
      measured: {
        provenance: "measured",
        provider: "OpenAQ",
        station: { id: "s", name: "S", distanceKm: 1, network: null, operator: null },
        aqi: null,
        pollutants: [],
        observedAt: new Date(NOW.getTime() - 5 * HOUR).toISOString(),
        fetchedAt: NOW.toISOString(),
        ageMinutes: 10, // stale value from cache time
        isStale: false,
      },
      modelled: null,
      unavailable: [],
    } satisfies AreaAirQuality;
    const fresh = withCurrentFreshness(cached, NOW);
    expect(fresh.measured?.ageMinutes).toBe(300);
    expect(fresh.measured?.isStale).toBe(true);
  });

  it("flags old forecasts and drops hours that are now in the past", () => {
    const forecast: AreaForecast = {
      location: { slug: "x", name: "X" },
      provenance: "forecast",
      provider: "Open-Meteo",
      issuedAt: null,
      fetchedAt: new Date(NOW.getTime() - 13 * HOUR).toISOString(),
      isStale: false,
      hours: [
        { forecastFor: new Date(NOW.getTime() - HOUR).toISOString(), pollutants: [] },
        { forecastFor: new Date(NOW.getTime() + HOUR).toISOString(), pollutants: [] },
      ],
      unavailable: [],
    };
    const result = withCurrentForecastFreshness(forecast, NOW);
    expect(result.isStale).toBe(true);
    expect(result.hours).toHaveLength(1);
  });
});

describe("isCpcbCategory", () => {
  it("accepts only CPCB category ids", () => {
    expect(isCpcbCategory("very_poor")).toBe(true);
    expect(isCpcbCategory("unhealthy")).toBe(false);
    expect(isCpcbCategory(null)).toBe(false);
  });
});

describe("summariseByDay", () => {
  it("groups forecast hours by IST calendar day", () => {
    // 18:00Z on 25 Nov is 23:30 IST (25 Nov); 19:00Z is 00:30 IST (26 Nov).
    const forecast: AreaForecast = {
      location: { slug: "x", name: "X" },
      provenance: "forecast",
      provider: "Open-Meteo",
      issuedAt: null,
      fetchedAt: null,
      isStale: false,
      hours: [
        { forecastFor: "2026-11-25T18:00:00Z", pollutants: [{ pollutant: "pm25", value: 10, unit: "ug_m3", averagingPeriod: null, coveragePercent: null }] },
        { forecastFor: "2026-11-25T19:00:00Z", pollutants: [{ pollutant: "pm25", value: 30, unit: "ug_m3", averagingPeriod: null, coveragePercent: null }] },
      ],
      unavailable: [],
    };
    const days = summariseByDay(forecast);
    expect(days.map((d) => [d.key, d.hours, d.pm25])).toEqual([
      ["2026-11-25", 1, 10],
      ["2026-11-26", 1, 30],
    ]);
  });
});

describe("calculation details schema", () => {
  it("accepts exactly what the calculator stores", () => {
    const hourly: HourlyConcentration[] = ["pm25", "pm10", "o3"].flatMap((pollutant) =>
      Array.from({ length: 24 }, (_, i) => ({
        observedAt: new Date(NOW.getTime() - i * HOUR),
        pollutant: pollutant as HourlyConcentration["pollutant"],
        value: 50,
        unit: "ug_m3" as const,
      })),
    );
    const result = calculateCpcbAqi(hourly, NOW);
    const stored = JSON.parse(JSON.stringify({ subIndices: result.subIndices, excluded: result.excluded }));
    expect(calculationDetailsSchema.safeParse(stored).success).toBe(true);
    expect(calculationDetailsSchema.safeParse({ subIndices: [{ pollutant: "pm25" }], excluded: [] }).success).toBe(false);
  });
});

describe("provider input hardening", () => {
  it("clamps coverage above 100% instead of failing the write", () => {
    const { observations } = mergeHourlySeries(
      [
        {
          sensor: { id: "1", pollutant: "pm25", unit: "ug_m3", rawUnit: "µg/m³" },
          response: {
            results: [
              {
                value: 40,
                parameter: { name: "pm25", units: "µg/m³" },
                period: { datetimeFrom: { utc: "2026-11-25T01:30:00Z" }, datetimeTo: { utc: "2026-11-25T02:30:00Z" } },
                coverage: { percentComplete: 125 },
              },
            ],
          },
        },
      ],
      NOW,
    );
    expect(observations[0]?.pollutants[0]?.coveragePercent).toBe(100);
  });

  it("rejects unparseable provider timestamps", () => {
    const parsed = openAqLatestResponseSchema.safeParse({
      results: [{ sensorsId: 1, datetime: { utc: "yesterday-ish" }, value: 1 }],
    });
    expect(parsed.success).toBe(false);
  });
});
