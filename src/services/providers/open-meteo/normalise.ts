import type { PollutantCode, PollutantValue } from "@/features/air-quality/types/aqi";
import { normaliseUnit } from "@/services/normalisation/units";

import type { HourlyObservation } from "../provider.interface";

import type { OpenMeteoLocation } from "./schemas";

/** Open-Meteo hourly variable → Hawa AI pollutant code. */
export const OPEN_METEO_VARIABLES: Record<string, PollutantCode> = {
  pm2_5: "pm25",
  pm10: "pm10",
  nitrogen_dioxide: "no2",
  sulphur_dioxide: "so2",
  ozone: "o3",
  carbon_monoxide: "co",
};

/**
 * Converts one Open-Meteo location into hourly observations. Missing (null)
 * values are omitted, never filled. Hours with no values at all are dropped.
 */
export function normaliseOpenMeteoLocation(location: OpenMeteoLocation): HourlyObservation[] {
  const times = location.hourly.time;
  const observations: HourlyObservation[] = [];

  times.forEach((unixSeconds, index) => {
    const pollutants: PollutantValue[] = [];
    for (const [variable, pollutant] of Object.entries(OPEN_METEO_VARIABLES)) {
      const series = location.hourly[variable];
      const value = Array.isArray(series) ? series[index] : undefined;
      const rawUnit = location.hourly_units[variable];
      const unit = rawUnit ? normaliseUnit(rawUnit) : null;
      if (value === null || value === undefined || value < 0 || !unit) continue;
      pollutants.push({
        pollutant,
        value,
        unit,
        averagingPeriod: null,
        coveragePercent: null,
      });
    }
    if (pollutants.length > 0) {
      observations.push({ observedAt: new Date(unixSeconds * 1000), pollutants });
    }
  });

  return observations;
}
