/**
 * City insights: every statistic and ranking here is calculated in code from
 * stored measurements. AI may only explain the result (see explain.ts).
 *
 * Conventions (documented in docs/city-insights.md):
 * - Station values are hourly averages stamped at the END of the hour; hour-of-
 *   day buckets use the hour's start in IST.
 * - "Days" are the last N complete IST calendar days (today is partial and
 *   excluded from daily trends).
 * - A station-day counts only with at least 18 of 24 hourly values (75%).
 * - Only µg/m³ values are used for PM2.5/PM10.
 */
import { MEASURED_STALE_AFTER_HOURS } from "@/features/air-quality/constants";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";

const HOUR = 3_600_000;
const IST_OFFSET_MS = 330 * 60_000;
export const MIN_HOURS_PER_STATION_DAY = 18;
/** An hour-of-day bucket needs this many station-hours to be shown. */
export const MIN_SAMPLES_PER_HOUR_OF_DAY = 10;

export type StationHour = {
  observedAt: string;
  pm25: number | null;
  pm10: number | null;
  aqi: number | null;
  aqiIsLowerBound: boolean;
  category: string | null;
  dominantPollutant: string | null;
};

export type StationSeries = { id: string; name: string; hours: StationHour[] };

export type ForecastDayMean = { day: string; pm25Mean: number; hours: number };

export type ReportSummaryInput = { category: string; createdAt: string; verificationStatus: string };

export const istDay = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
const istHourStart = (observedAtMs: number) => new Date(observedAtMs - HOUR + IST_OFFSET_MS).getUTCHours();
const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
const pct = (from: number, to: number) => (from > 0 ? Math.round(((to - from) / from) * 100) : null);

/** The last `count` complete IST days before `now`, oldest first. */
export function completeDays(now: Date, count: number): string[] {
  const today = istDay(now.getTime());
  const days: string[] = [];
  for (let i = count; i >= 1; i -= 1) {
    days.push(istDay(Date.parse(`${today}T12:00:00+05:30`) - i * 24 * HOUR));
  }
  return days;
}

export type StationStats = {
  id: string;
  name: string;
  pm25Mean: number | null;
  pm10Mean: number | null;
  aqiMean: number | null;
  aqiMax: number | null;
  hoursWithData: number;
  coveragePercent: number;
  latest: { aqi: number; isLowerBound: boolean; category: string | null; dominantPollutant: string | null; observedAt: string; isStale: boolean } | null;
};

export type DailyPoint = {
  day: string;
  pm25: number | null;
  pm10: number | null;
  aqiMean: number | null;
  aqiMax: number | null;
  /** Stations with enough hours that day (for PM2.5). */
  stations: number;
};

export type CityInsights = {
  generatedAt: string;
  period: { days: string[]; from: string; to: string };
  stationCount: number;
  ranking: {
    mostPolluted: StationStats | null;
    cleanest: StationStats | null;
    freshStations: number;
    /** Why a ranking is unavailable, if it is. */
    note: string | null;
  };
  daily: DailyPoint[];
  change: {
    /** Latest complete day vs the day before, PM2.5 city mean, percent. */
    pm25DayOverDayPercent: number | null;
    /** Latest complete day vs the period mean, percent. */
    pm25VsPeriodPercent: number | null;
    periodPm25Mean: number | null;
    periodPm10Mean: number | null;
  };
  hourOfDay: {
    hours: { hour: number; pm25: number | null; samples: number }[];
    peak: { hour: number; pm25: number } | null;
    lowest: { hour: number; pm25: number } | null;
  };
  stations: StationStats[];
  coverage: { percent: number; hoursWithData: number; hoursExpected: number; earliestObservation: string | null };
  categoryHours: { category: string; label: string; hours: number }[];
  forecast: { days: ForecastDayMean[]; changePercent: number | null } | null;
  reports: { total: number; last30Days: number; byCategory: { category: string; count: number }[]; latestAt: string | null };
};

export function computeCityInsights({
  stations,
  forecastDays,
  reports,
  now,
  days: dayCount = 7,
}: {
  stations: StationSeries[];
  forecastDays: ForecastDayMean[] | null;
  reports: ReportSummaryInput[];
  now: Date;
  days?: number;
}): CityInsights {
  const days = completeDays(now, dayCount);
  const daySet = new Set(days);
  const inPeriod = (h: StationHour) => daySet.has(istDay(Date.parse(h.observedAt) - HOUR));

  // Per-station statistics over the period.
  const stationStats: StationStats[] = stations.map((station) => {
    const hours = station.hours.filter(inPeriod);
    const pm25 = hours.flatMap((h) => (h.pm25 === null ? [] : [h.pm25]));
    const pm10 = hours.flatMap((h) => (h.pm10 === null ? [] : [h.pm10]));
    const aqi = hours.flatMap((h) => (h.aqi === null ? [] : [h.aqi]));
    const expected = days.length * 24;
    const enough = (values: number[]) => values.length >= expected / 2;
    const latestHour = [...station.hours]
      .filter((h) => h.aqi !== null)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    const withData = hours.filter((h) => h.pm25 !== null || h.pm10 !== null || h.aqi !== null).length;
    return {
      id: station.id,
      name: station.name,
      pm25Mean: enough(pm25) ? round1(mean(pm25) as number) : null,
      pm10Mean: enough(pm10) ? round1(mean(pm10) as number) : null,
      aqiMean: enough(aqi) ? Math.round(mean(aqi) as number) : null,
      aqiMax: aqi.length ? Math.max(...aqi) : null,
      hoursWithData: withData,
      coveragePercent: expected ? Math.round((withData / expected) * 100) : 0,
      latest: latestHour
        ? {
            aqi: latestHour.aqi as number,
            isLowerBound: latestHour.aqiIsLowerBound,
            category: latestHour.category,
            dominantPollutant: latestHour.dominantPollutant,
            observedAt: latestHour.observedAt,
            isStale: now.getTime() - Date.parse(latestHour.observedAt) > MEASURED_STALE_AFTER_HOURS * HOUR,
          }
        : null,
    };
  });

  // Ranking: only stations with a fresh calculated AQI.
  const fresh = stationStats.filter((s) => s.latest && !s.latest.isStale);
  const byAqi = [...fresh].sort((a, b) => (b.latest?.aqi ?? 0) - (a.latest?.aqi ?? 0));
  const ranking = {
    mostPolluted: byAqi.length >= 2 ? (byAqi[0] ?? null) : null,
    cleanest: byAqi.length >= 2 ? (byAqi.at(-1) ?? null) : null,
    freshStations: fresh.length,
    note: byAqi.length >= 2 ? null : "Fewer than two stations have a current calculated AQI, so no ranking is shown.",
  };

  // Daily city means: mean of station-day means, each needing 18+ hours.
  const daily: DailyPoint[] = days.map((day) => {
    const perStation = stations.map((station) => {
      const hours = station.hours.filter((h) => istDay(Date.parse(h.observedAt) - HOUR) === day);
      const pick = (key: "pm25" | "pm10" | "aqi") => hours.flatMap((h) => (h[key] === null ? [] : [h[key] as number]));
      const pm25 = pick("pm25");
      const pm10 = pick("pm10");
      const aqi = pick("aqi");
      return {
        pm25: pm25.length >= MIN_HOURS_PER_STATION_DAY ? mean(pm25) : null,
        pm10: pm10.length >= MIN_HOURS_PER_STATION_DAY ? mean(pm10) : null,
        aqi: aqi.length >= MIN_HOURS_PER_STATION_DAY ? mean(aqi) : null,
        aqiMax: aqi.length ? Math.max(...aqi) : null,
      };
    });
    const values = (key: "pm25" | "pm10" | "aqi") => perStation.flatMap((s) => (s[key] === null ? [] : [s[key] as number]));
    const pm25 = mean(values("pm25"));
    const pm10 = mean(values("pm10"));
    const aqiMean = mean(values("aqi"));
    const maxes = perStation.flatMap((s) => (s.aqiMax === null ? [] : [s.aqiMax]));
    return {
      day,
      pm25: pm25 === null ? null : round1(pm25),
      pm10: pm10 === null ? null : round1(pm10),
      aqiMean: aqiMean === null ? null : Math.round(aqiMean),
      aqiMax: maxes.length ? Math.max(...maxes) : null,
      stations: values("pm25").length,
    };
  });

  const withPm25 = daily.filter((d) => d.pm25 !== null);
  const last = withPm25.at(-1);
  const previous = withPm25.at(-2);
  const periodPm25 = mean(withPm25.map((d) => d.pm25 as number));
  const periodPm10 = mean(daily.flatMap((d) => (d.pm10 === null ? [] : [d.pm10])));

  // Hour-of-day pattern (IST, hour start), across all stations and days in the period.
  const buckets = Array.from({ length: 24 }, () => [] as number[]);
  for (const station of stations) {
    for (const h of station.hours) {
      if (h.pm25 === null || !inPeriod(h)) continue;
      buckets[istHourStart(Date.parse(h.observedAt))]?.push(h.pm25);
    }
  }
  const hourRows = buckets.map((values, hour) => ({
    hour,
    pm25: values.length >= MIN_SAMPLES_PER_HOUR_OF_DAY ? round1(mean(values) as number) : null,
    samples: values.length,
  }));
  const shown = hourRows.filter((row): row is { hour: number; pm25: number; samples: number } => row.pm25 !== null);
  const peak = shown.length ? shown.reduce((a, b) => (b.pm25 > a.pm25 ? b : a)) : null;
  const lowest = shown.length ? shown.reduce((a, b) => (b.pm25 < a.pm25 ? b : a)) : null;

  // Hours spent in each CPCB category (station-hours with a calculated AQI).
  const categoryCounts = new Map<string, number>();
  for (const station of stations) {
    for (const h of station.hours) {
      if (h.category && inPeriod(h)) categoryCounts.set(h.category, (categoryCounts.get(h.category) ?? 0) + 1);
    }
  }

  const expectedHours = stations.length * days.length * 24;
  const hoursWithData = stationStats.reduce((sum, s) => sum + s.hoursWithData, 0);
  const earliest = stations
    .flatMap((s) => s.hours.map((h) => Date.parse(h.observedAt)))
    .reduce<number | null>((min, t) => (min === null || t < min ? t : min), null);

  const fullForecastDays = (forecastDays ?? []).filter((d) => d.hours >= 20);
  const firstForecast = fullForecastDays[0];
  const lastForecast = fullForecastDays.at(-1);

  const thirtyDaysAgo = now.getTime() - 30 * 24 * HOUR;
  const recentReports = reports.filter((r) => Date.parse(r.createdAt) >= thirtyDaysAgo);
  const reportCounts = new Map<string, number>();
  for (const report of recentReports) reportCounts.set(report.category, (reportCounts.get(report.category) ?? 0) + 1);

  return {
    generatedAt: now.toISOString(),
    period: {
      days,
      from: `${days[0]}T00:00:00+05:30`,
      to: `${days.at(-1)}T23:59:59+05:30`,
    },
    stationCount: stations.length,
    ranking,
    daily,
    change: {
      pm25DayOverDayPercent: last && previous ? pct(previous.pm25 as number, last.pm25 as number) : null,
      pm25VsPeriodPercent: last && periodPm25 !== null && withPm25.length >= 3 ? pct(periodPm25, last.pm25 as number) : null,
      periodPm25Mean: periodPm25 === null ? null : round1(periodPm25),
      periodPm10Mean: periodPm10 === null ? null : round1(periodPm10),
    },
    hourOfDay: {
      hours: hourRows,
      peak: peak ? { hour: peak.hour, pm25: peak.pm25 } : null,
      lowest: lowest ? { hour: lowest.hour, pm25: lowest.pm25 } : null,
    },
    stations: [...stationStats].sort((a, b) => (b.pm25Mean ?? -1) - (a.pm25Mean ?? -1)),
    coverage: {
      percent: expectedHours ? Math.round((hoursWithData / expectedHours) * 100) : 0,
      hoursWithData,
      hoursExpected: expectedHours,
      earliestObservation: earliest === null ? null : new Date(earliest).toISOString(),
    },
    categoryHours: CPCB_AQI_CATEGORIES.map((c) => ({ category: c.id, label: c.label, hours: categoryCounts.get(c.id) ?? 0 })),
    forecast:
      forecastDays && fullForecastDays.length
        ? {
            days: fullForecastDays.map((d) => ({ ...d, pm25Mean: round1(d.pm25Mean) })),
            changePercent:
              firstForecast && lastForecast && firstForecast !== lastForecast ? pct(firstForecast.pm25Mean, lastForecast.pm25Mean) : null,
          }
        : null,
    reports: {
      total: reports.length,
      last30Days: recentReports.length,
      byCategory: [...reportCounts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      latestAt: reports.reduce<string | null>((latest, r) => (latest === null || r.createdAt > latest ? r.createdAt : latest), null),
    },
  };
}
