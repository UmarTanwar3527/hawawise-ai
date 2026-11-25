import "server-only";

import { fetchJson } from "../http";
import type { GeoPoint, ModelledGridProvider } from "../provider.interface";

import { normaliseOpenMeteoLocation, OPEN_METEO_VARIABLES } from "./normalise";
import { openMeteoResponseSchema } from "./schemas";

const BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

/**
 * Open-Meteo Air Quality adapter (no API key). Values are model output for a
 * grid cell, so they are always labelled "modelled" or "forecast", never
 * "measured". Free for non-commercial use under Open-Meteo's terms.
 */
export class OpenMeteoProvider implements ModelledGridProvider {
  readonly id = "open_meteo" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchHourly(points: GeoPoint[], options: { pastDays: number; forecastDays: number }) {
    if (points.length === 0) return { series: [], fetchedAt: new Date(), rawPayload: [] };

    const query = new URLSearchParams({
      latitude: points.map((point) => point.latitude.toFixed(5)).join(","),
      longitude: points.map((point) => point.longitude.toFixed(5)).join(","),
      hourly: Object.keys(OPEN_METEO_VARIABLES).join(","),
      past_days: String(options.pastDays),
      forecast_days: String(options.forecastDays),
      timezone: "GMT",
      timeformat: "unixtime",
    });

    const response = await fetchJson(`${BASE_URL}?${query}`, {
      provider: "open_meteo",
      schema: openMeteoResponseSchema,
      fetchImpl: this.fetchImpl,
    });
    const fetchedAt = new Date();

    // Open-Meteo returns locations in request order.
    const series = points.map((requested, index) => {
      const location = response[index];
      return {
        requested,
        gridPoint: location
          ? { latitude: location.latitude, longitude: location.longitude }
          : requested,
        hourly: location ? normaliseOpenMeteoLocation(location) : [],
      };
    });

    return { series, fetchedAt, rawPayload: response };
  }
}
