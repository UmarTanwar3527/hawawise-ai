/**
 * Live checks against the real providers for Jaipur. Opt-in:
 *   npm run test:live
 * Reads OPENAQ_API_KEY from .env.local. Makes about 3 OpenAQ requests and
 * 1 Open-Meteo request.
 */
import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";
import { OpenMeteoProvider } from "@/services/providers/open-meteo/client";
import { OpenAqProvider } from "@/services/providers/openaq/client";

const live = process.env.RUN_LIVE_TESTS === "1";
if (live) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Fall back to the process environment (e.g. CI secrets).
  }
}
const openAqKey = process.env.OPENAQ_API_KEY;
const centre = siteConfig.pilotCity.centre;
const HOUR = 3_600_000;

describe.skipIf(!live)("live: OpenAQ (Jaipur stations)", () => {
  it.skipIf(!openAqKey)(
    "finds active Jaipur monitors and returns recent hourly PM2.5",
    async () => {
      const provider = new OpenAqProvider(openAqKey!);
      const { stations } = await provider.discoverStations(centre, 25_000);
      const recent = stations.filter(
        (station) => station.lastObservedAt && Date.now() - station.lastObservedAt.getTime() < 24 * HOUR,
      );
      expect(recent.length).toBeGreaterThan(0);

      const series = await provider.fetchHourlySeries(recent[0]!, {
        from: new Date(Date.now() - 26 * HOUR),
        to: new Date(),
      });
      const pm25 = series.observations.flatMap((o) => o.pollutants).filter((p) => p.pollutant === "pm25");
      expect(pm25.length).toBeGreaterThan(0);
      for (const value of pm25) {
        expect(value.unit).toBe("ug_m3");
        expect(value.averagingPeriod).toBe("1h");
      }
      for (const observation of series.observations) {
        expect(observation.observedAt.getTime()).toBeLessThanOrEqual(series.fetchedAt.getTime());
      }
    },
    60_000,
  );
});

describe.skipIf(!live)("live: Open-Meteo (Jaipur model)", () => {
  it(
    "returns modelled hourly values in µg/m³ including future hours",
    async () => {
      const { series, fetchedAt } = await new OpenMeteoProvider().fetchHourly([centre], {
        pastDays: 1,
        forecastDays: 2,
      });
      const hourly = series[0]?.hourly ?? [];
      expect(hourly.length).toBeGreaterThan(24);
      expect(hourly.some((h) => h.observedAt > fetchedAt)).toBe(true);
      const pm25 = hourly.flatMap((h) => h.pollutants).filter((p) => p.pollutant === "pm25");
      expect(pm25.every((p) => p.unit === "ug_m3")).toBe(true);
      // The grid cell used must be near the requested point.
      expect(Math.abs((series[0]?.gridPoint.latitude ?? 0) - centre.latitude)).toBeLessThan(0.5);
    },
    30_000,
  );
});
