import "server-only";

import type { z } from "zod";

import { fetchJson, ProviderError } from "../http";
import type {
  GeoPoint,
  Station,
  StationHourlySeries,
  StationNetworkProvider,
} from "../provider.interface";

import { mergeHourlySeries, normaliseStation, selectActiveSensors } from "./normalise";
import {
  openAqHoursResponseSchema,
  openAqLatestResponseSchema,
  openAqLocationsResponseSchema,
  type OpenAqHoursResponse,
} from "./schemas";

const BASE_URL = "https://api.openaq.org/v3";
/** OpenAQ caps the coordinate search radius at 25 km. */
export const OPENAQ_MAX_RADIUS_METRES = 25_000;

/**
 * OpenAQ v3 adapter. The API key is sent as a header (never in the URL).
 * OpenAQ allows 60 requests per minute per key, so the client tracks the
 * remaining budget from response headers and pauses before it runs out.
 */
export class OpenAqProvider implements StationNetworkProvider {
  readonly id = "openaq" as const;
  private remaining = Number.POSITIVE_INFINITY;
  private resetAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (this.remaining <= 2 && Date.now() < this.resetAt) {
      const wait = this.resetAt - Date.now();
      if (wait > 30_000) throw new ProviderError("openaq", "rate_limited", 429);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    return fetchJson<T>(`${BASE_URL}${path}`, {
      provider: "openaq",
      schema,
      headers: { "X-API-Key": this.apiKey },
      fetchImpl: this.fetchImpl,
      onResponse: (response) => {
        const remaining = Number(response.headers.get("x-ratelimit-remaining"));
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        if (Number.isFinite(remaining)) this.remaining = remaining;
        if (Number.isFinite(reset)) this.resetAt = Date.now() + reset * 1000;
      },
    });
  }

  async discoverStations(centre: GeoPoint, radiusMetres: number) {
    const radius = Math.min(Math.round(radiusMetres), OPENAQ_MAX_RADIUS_METRES);
    const query = new URLSearchParams({
      coordinates: `${centre.latitude},${centre.longitude}`,
      radius: String(radius),
      limit: "100",
    });
    const response = await this.request(`/locations?${query}`, openAqLocationsResponseSchema);
    const stations = response.results
      .filter((location) => location.isMonitor && !location.isMobile)
      .map(normaliseStation);
    return { stations, rawPayload: response };
  }

  async fetchHourlySeries(
    station: Station,
    window: { from: Date; to: Date },
  ): Promise<StationHourlySeries> {
    const latest = await this.request(
      `/locations/${encodeURIComponent(station.externalId)}/latest`,
      openAqLatestResponseSchema,
    );
    const { sensors, skipped: sensorSkips } = selectActiveSensors(station, latest, window.from);

    const responses: { sensor: (typeof sensors)[number]; response: OpenAqHoursResponse }[] = [];
    for (const sensor of sensors) {
      const query = new URLSearchParams({
        datetime_from: window.from.toISOString(),
        datetime_to: window.to.toISOString(),
        // One page covers the window (hourly values; OpenAQ allows up to 1000).
        limit: String(Math.min(1000, Math.max(100, Math.ceil((window.to.getTime() - window.from.getTime()) / 3_600_000) + 10))),
      });
      const response = await this.request(
        `/sensors/${encodeURIComponent(sensor.id)}/hours?${query}`,
        openAqHoursResponseSchema,
      );
      responses.push({ sensor, response });
    }

    const fetchedAt = new Date();
    const { observations, skipped } = mergeHourlySeries(responses, fetchedAt);

    return {
      station,
      observations,
      skipped: [...sensorSkips, ...skipped],
      fetchedAt,
      rawPayload: {
        latest,
        hours: responses.map(({ sensor, response }) => ({ sensorId: sensor.id, response })),
      },
    };
  }
}
