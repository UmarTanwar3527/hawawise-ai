/**
 * Deterministic exposure planning. Ranks the start times available in the
 * visitor's range by forecast PM2.5. No AI is involved here: Gemini may only
 * explain the result afterwards.
 *
 * Assumptions (documented in docs/exposure-planner.md):
 * - Each hourly forecast value represents the hour starting at its timestamp.
 * - A window of D minutes uses ceil(D / 60) consecutive hourly values.
 * - The forecast is modelled (Open-Meteo), so windows are compared with each
 *   other, never presented as actual or "safe" levels.
 */
import type { AreaForecast } from "@/features/air-quality/services/area-air-quality";

import { MEANINGFUL_DIFFERENCE, PERIODS, type PeriodId } from "../constants";
import type { PlanRequest } from "../schemas/plan-request";

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** India Standard Time has a fixed +05:30 offset (no daylight saving). */
const IST_OFFSET_MINUTES = 330;

export type ForecastPoint = { at: string; pm25: number | null; pm10: number | null };

export type PlanWindow = {
  start: string;
  end: string;
  /** IST minutes since midnight at the start. */
  startMinute: number;
  period: PeriodId;
  hoursUsed: number;
  complete: boolean;
  pm25Mean: number | null;
  pm25Max: number | null;
  pm10Mean: number | null;
  /** 1 = lowest forecast PM2.5. Null for incomplete windows. */
  rank: number | null;
  /** Compared with the lowest window, using MEANINGFUL_DIFFERENCE. */
  relative: "lowest" | "similar" | "higher" | null;
  /** Percentage above the lowest window's mean PM2.5 (0 for the lowest). */
  aboveLowestPercent: number | null;
};

export type PlanStatus = "ok" | "no_forecast" | "no_windows" | "range_too_short" | "insufficient_data";

export type PlanResult = {
  status: PlanStatus;
  request: PlanRequest;
  /** IST calendar day planned, YYYY-MM-DD. */
  dayKey: string;
  /** Hourly forecast for the planned day (for the chart), chronological. */
  points: ForecastPoint[];
  /** Candidate windows, chronological. */
  windows: PlanWindow[];
  best: PlanWindow | null;
  worst: PlanWindow | null;
  /** True when best and worst differ meaningfully. */
  clearDifference: boolean;
  /** How much lower the best window's mean PM2.5 is than the worst's, in percent. */
  bestBelowWorstPercent: number | null;
  /** Other start times whose forecast is not meaningfully higher than the lowest, chronological. */
  similarStarts: string[];
  /** The lowest window within each part of the day that has candidates. */
  periods: { id: PeriodId; label: string; best: PlanWindow | null; candidates: number }[];
  incompleteWindows: number;
  forecast: {
    provider: string;
    issuedAt: string | null;
    fetchedAt: string | null;
    isStale: boolean;
  };
};

export function istMinuteOfDay(iso: string): number {
  const minutes = Math.floor(Date.parse(iso) / MINUTE) + IST_OFFSET_MINUTES;
  return ((minutes % 1440) + 1440) % 1440;
}

export function istDayKeyOf(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * MINUTE).toISOString().slice(0, 10);
}

export function periodOf(minuteOfDay: number): PeriodId {
  const match = PERIODS.find((period) =>
    period.fromMinute < period.toMinute
      ? minuteOfDay >= period.fromMinute && minuteOfDay < period.toMinute
      : minuteOfDay >= period.fromMinute || minuteOfDay < period.toMinute,
  );
  return match?.id ?? "night";
}

export function isMeaningfulDifference(a: number, b: number): boolean {
  const difference = Math.abs(a - b);
  const larger = Math.max(Math.abs(a), Math.abs(b));
  return difference >= MEANINGFUL_DIFFERENCE.absoluteUgM3 && larger > 0 && difference / larger >= MEANINGFUL_DIFFERENCE.relative;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Only µg/m³ values are used; anything else is treated as missing. */
function toPoints(forecast: AreaForecast): ForecastPoint[] {
  return forecast.hours
    .map((hour) => {
      const pick = (code: string) => {
        const value = hour.pollutants.find((p) => p.pollutant === code && p.unit === "ug_m3");
        return value && Number.isFinite(value.value) && value.value >= 0 ? value.value : null;
      };
      return { at: hour.forecastFor, pm25: pick("pm25"), pm10: pick("pm10") };
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function planExposure({
  forecast,
  request,
  now,
}: {
  forecast: AreaForecast;
  request: PlanRequest;
  now: Date;
}): PlanResult {
  const dayKey = istDayKeyOf(request.day === "today" ? now : new Date(now.getTime() + 24 * HOUR));
  const allPoints = toPoints(forecast);
  const byTime = new Map(allPoints.map((point) => [Date.parse(point.at), point]));
  const points = allPoints.filter((point) => istDayKeyOf(new Date(point.at)) === dayKey);

  const base: PlanResult = {
    status: "ok",
    request,
    dayKey,
    points,
    windows: [],
    best: null,
    worst: null,
    clearDifference: false,
    bestBelowWorstPercent: null,
    similarStarts: [],
    periods: [],
    incompleteWindows: 0,
    forecast: {
      provider: forecast.provider,
      issuedAt: forecast.issuedAt,
      fetchedAt: forecast.fetchedAt,
      isStale: forecast.isStale,
    },
  };

  if (allPoints.length === 0) return { ...base, status: "no_forecast" };
  if ((request.to - request.from) * 60 < request.duration || request.to <= request.from) {
    return { ...base, status: "range_too_short" };
  }

  const hoursNeeded = Math.ceil(request.duration / 60);
  const windows: PlanWindow[] = [];
  for (const point of points) {
    const startMs = Date.parse(point.at);
    const startMinute = istMinuteOfDay(point.at);
    if (startMs < now.getTime()) continue;
    if (startMinute < request.from * 60 || startMinute + request.duration > request.to * 60) continue;

    const used = Array.from({ length: hoursNeeded }, (_, i) => byTime.get(startMs + i * HOUR));
    const pm25 = used.map((p) => p?.pm25 ?? null);
    const pm10 = used.map((p) => p?.pm10 ?? null);
    const complete = pm25.every((value) => value !== null);
    const pm10Values = pm10.filter((value): value is number => value !== null);
    windows.push({
      start: point.at,
      end: new Date(startMs + request.duration * MINUTE).toISOString(),
      startMinute,
      period: periodOf(startMinute),
      hoursUsed: hoursNeeded,
      complete,
      pm25Mean: complete ? round1(mean(pm25 as number[])) : null,
      pm25Max: complete ? round1(Math.max(...(pm25 as number[]))) : null,
      pm10Mean: complete && pm10Values.length === hoursNeeded ? round1(mean(pm10Values)) : null,
      rank: null,
      relative: null,
      aboveLowestPercent: null,
    });
  }

  if (windows.length === 0) return { ...base, status: "no_windows" };

  const ranked = windows
    .filter((window) => window.complete)
    .sort(
      (a, b) =>
        (a.pm25Mean ?? 0) - (b.pm25Mean ?? 0) ||
        (a.pm25Max ?? 0) - (b.pm25Max ?? 0) ||
        (a.pm10Mean ?? Infinity) - (b.pm10Mean ?? Infinity) ||
        Date.parse(a.start) - Date.parse(b.start),
    );
  const incompleteWindows = windows.length - ranked.length;
  if (ranked.length === 0) return { ...base, windows, incompleteWindows, status: "insufficient_data" };

  const best = ranked[0] as PlanWindow;
  const lowest = best.pm25Mean as number;
  ranked.forEach((window, index) => {
    const value = window.pm25Mean as number;
    window.rank = index + 1;
    window.relative = index === 0 ? "lowest" : isMeaningfulDifference(value, lowest) ? "higher" : "similar";
    window.aboveLowestPercent = lowest > 0 ? Math.round(((value - lowest) / lowest) * 100) : null;
  });
  const worst = ranked.at(-1) as PlanWindow;
  const highest = worst.pm25Mean as number;

  const periods = PERIODS.map((period) => {
    const candidates = windows.filter((window) => window.period === period.id);
    return {
      id: period.id,
      label: period.label,
      best: ranked.find((window) => window.period === period.id) ?? null,
      candidates: candidates.length,
    };
  }).filter((period) => period.candidates > 0);

  return {
    ...base,
    windows,
    best,
    worst,
    clearDifference: ranked.length > 1 && isMeaningfulDifference(lowest, highest),
    bestBelowWorstPercent: ranked.length > 1 && highest > 0 ? Math.round(((highest - lowest) / highest) * 100) : null,
    similarStarts: windows.filter((window) => window.relative === "similar").map((window) => window.start),
    periods,
    incompleteWindows,
  };
}
