import "server-only";

import {
  isCpcbCategory,
  withCurrentForecastFreshness,
  withCurrentFreshness,
  type AreaAirQuality,
  type AreaForecast,
} from "@/features/air-quality/services/area-air-quality";
import { getAreaAirQualityCached, getAreaForecastCached } from "@/features/air-quality/services/dashboard-data";
import { planExposure } from "@/features/exposure-planner/services/plan";
import { formatTimeIst } from "@/lib/utils/format";

import { buildAdvisory, type Advisory, type ForecastHint, type Measurement } from "../rules";
import type { AdvisorRequest } from "../schemas/advisor-request";

/** Only a measured, CPCB-scale value can set the health category. */
export function measurementFrom(current: AreaAirQuality): Measurement | null {
  const measured = current.measured;
  const aqi = measured?.aqi;
  if (!measured || !aqi || aqi.scale !== "ind_cpcb" || !isCpcbCategory(aqi.category)) return null;
  return {
    aqi: aqi.value,
    isLowerBound: aqi.isLowerBound,
    category: aqi.category,
    dominantPollutant: aqi.dominantPollutant,
    observedAt: measured.observedAt,
    isStale: measured.isStale,
    stationName: measured.station.name,
    distanceKm: Math.round(measured.station.distanceKm * 10) / 10,
  };
}

const span = (start: string, end: string) => `${formatTimeIst(start).replace(" IST", "")}–${formatTimeIst(end)}`;

/** Lower-exposure daytime window from the planner's ranking (today, else tomorrow). */
export function forecastHint(forecast: AreaForecast | null, location: string, now: Date): ForecastHint {
  if (!forecast) return { status: "unavailable" };
  for (const day of ["today", "tomorrow"] as const) {
    const plan = planExposure({
      forecast,
      request: { location, activity: "walking", duration: 60, day, from: 6, to: 21, sensitive: false },
      now,
    });
    if (plan.status === "ok" && plan.best) {
      return {
        status: "ok",
        day,
        lowestWindow: span(plan.best.start, plan.best.end),
        similarWindows: plan.similarStarts.map((start) => formatTimeIst(start)),
      };
    }
  }
  return { status: "unavailable" };
}

export async function loadAdvisory(request: AdvisorRequest, now: Date): Promise<{ advisory: Advisory; current: AreaAirQuality }> {
  const [current, forecast] = await Promise.all([
    getAreaAirQualityCached(request.location),
    getAreaForecastCached(request.location, 48).catch((error: unknown) => {
      console.error("advisor forecast failed", error instanceof Error ? error.name : "unknown");
      return null;
    }),
  ]);
  const live = withCurrentFreshness(current, now);
  const advisory = buildAdvisory({
    profile: request.profile,
    activity: request.activity,
    measurement: measurementFrom(live),
    forecast: forecastHint(forecast ? withCurrentForecastFreshness(forecast, now) : null, request.location, now),
  });
  return { advisory, current: live };
}
