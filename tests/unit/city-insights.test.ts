import { describe, expect, it, vi } from "vitest";

import { completeDays, computeCityInsights, type StationHour, type StationSeries } from "@/features/city-insights/services/compute";
import { buildInsightsFacts, explainInsights } from "@/features/city-insights/services/explain";
import { hourRangeLabel } from "@/features/city-insights/format";
import type { GenerateFn } from "@/lib/gemini/types";

const HOUR = 3_600_000;
/** 16:30 IST on 25 Nov 2026. */
const NOW = new Date("2026-11-25T11:00:00Z");

/**
 * Hourly series ending at `latest` (hour-ending stamps on the IST hour,
 * i.e. :30 UTC). `pm25At(istHourStart)` gives the value.
 */
function series(
  id: string,
  pm25At: (istHourStart: number, index: number) => number | null,
  { hours = 8 * 24, latest = new Date("2026-11-25T07:30:00Z"), aqi = 150, category = "moderate" } = {},
): StationSeries {
  const rows: StationHour[] = [];
  for (let i = hours - 1; i >= 0; i -= 1) {
    const end = latest.getTime() - i * HOUR;
    const istHourStart = new Date(end - HOUR + 330 * 60_000).getUTCHours();
    const pm25 = pm25At(istHourStart, i);
    // A missing hour has no stored reading at all.
    if (pm25 === null) continue;
    rows.push({
      observedAt: new Date(end).toISOString(),
      pm25,
      pm10: pm25 * 2,
      aqi,
      aqiIsLowerBound: false,
      category,
      dominantPollutant: "pm10",
    });
  }
  return { id, name: `${id}, Jaipur - RSPCB`, hours: rows };
}

const flat = (value: number) => () => value;

describe("city insights: calculations", () => {
  it("uses the last 7 complete IST days (today excluded)", () => {
    expect(completeDays(NOW, 7)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
  });

  it("averages station-day means into city daily values and ranks stations", () => {
    const insights = computeCityInsights({
      stations: [series("A", flat(40), { aqi: 120 }), series("B", flat(80), { aqi: 220, category: "poor" })],
      forecastDays: null,
      reports: [],
      now: NOW,
    });
    expect(insights.daily).toHaveLength(7);
    expect(insights.daily.every((d) => d.pm25 === 60 && d.pm10 === 120 && d.stations === 2)).toBe(true);
    expect(insights.stations.map((s) => [s.name, s.pm25Mean])).toEqual([
      ["B, Jaipur - RSPCB", 80],
      ["A, Jaipur - RSPCB", 40],
    ]);
    expect(insights.ranking.mostPolluted?.latest?.aqi).toBe(220);
    expect(insights.ranking.cleanest?.latest?.aqi).toBe(120);
    expect(insights.change).toMatchObject({ pm25DayOverDayPercent: 0, periodPm25Mean: 60 });
    expect(insights.coverage.percent).toBe(100);
  });

  it("excludes station-days with fewer than 18 hourly values", () => {
    // Station B is missing 8 hours on every day (hours 0–7 IST): 16 values a day.
    const insights = computeCityInsights({
      stations: [series("A", flat(40)), series("B", (h) => (h < 8 ? null : 100))],
      forecastDays: null,
      reports: [],
      now: NOW,
    });
    expect(insights.daily.every((d) => d.pm25 === 40 && d.stations === 1)).toBe(true);
    expect(insights.stations.find((s) => s.id === "B")?.coveragePercent).toBeLessThan(75);
  });

  it("finds the daily rhythm in IST hour-start buckets", () => {
    const insights = computeCityInsights({
      stations: [series("A", (h) => (h === 20 ? 120 : h === 16 ? 30 : 60)), series("B", (h) => (h === 20 ? 100 : h === 16 ? 40 : 60))],
      forecastDays: null,
      reports: [],
      now: NOW,
    });
    expect(insights.hourOfDay.peak).toEqual({ hour: 20, pm25: 110 });
    expect(insights.hourOfDay.lowest).toEqual({ hour: 16, pm25: 35 });
    expect(hourRangeLabel(20)).toBe("8 pm–9 pm");
    expect(hourRangeLabel(23)).toBe("11 pm–12 am");
  });

  it("does not rank stations whose latest AQI is stale, and says why", () => {
    const stale = new Date("2026-11-24T20:30:00Z");
    const insights = computeCityInsights({
      stations: [series("A", flat(40), { latest: stale }), series("B", flat(80))],
      forecastDays: null,
      reports: [],
      now: NOW,
    });
    expect(insights.ranking.mostPolluted).toBeNull();
    expect(insights.ranking.freshStations).toBe(1);
    expect(insights.ranking.note).toMatch(/Fewer than two stations/);
  });

  it("returns empty daily values rather than inventing them when there is no history", () => {
    const insights = computeCityInsights({ stations: [series("A", flat(40), { hours: 5 })], forecastDays: null, reports: [], now: NOW });
    expect(insights.daily.every((d) => d.pm25 === null)).toBe(true);
    expect(insights.change.pm25DayOverDayPercent).toBeNull();
  });

  it("uses only full forecast days for the direction, and counts recent reports", () => {
    const insights = computeCityInsights({
      stations: [series("A", flat(40))],
      forecastDays: [
        { day: "2026-11-25", pm25Mean: 70, hours: 6 },
        { day: "2026-11-26", pm25Mean: 50, hours: 24 },
        { day: "2026-11-27", pm25Mean: 45, hours: 24 },
      ],
      reports: [
        { category: "waste_burning", createdAt: "2026-11-24T10:00:00Z", verificationStatus: "unverified" },
        { category: "waste_burning", createdAt: "2026-11-20T10:00:00Z", verificationStatus: "unverified" },
        { category: "road_dust", createdAt: "2026-09-01T10:00:00Z", verificationStatus: "unverified" },
      ],
      now: NOW,
    });
    expect(insights.forecast).toMatchObject({ changePercent: -10 });
    expect(insights.forecast?.days.map((d) => d.day)).toEqual(["2026-11-26", "2026-11-27"]);
    expect(insights.reports).toMatchObject({ total: 3, last30Days: 2, byCategory: [{ category: "waste_burning", count: 2 }] });
  });
});

describe("city insights: AI interpretation (mocked Gemini)", () => {
  const insights = computeCityInsights({
    stations: [series("A", flat(40), { aqi: 120 }), series("B", flat(80), { aqi: 220, category: "poor" })],
    forecastDays: null,
    reports: [],
    now: NOW,
  });
  const facts = buildInsightsFacts(insights);
  const reply = (explanation: string) => ({
    content: { role: "model" as const, parts: [] },
    functionCalls: [{ name: "submit_explanation", args: { explanation, language: "en" } }],
    text: "",
    usage: { inputTokens: 0, outputTokens: 0 },
  });

  it("gives the model labelled, calculated statistics only", () => {
    expect(facts).toMatchObject({
      aqiStandard: expect.stringContaining("calculated by Hawa AI"),
      currentStationRanking: { highest: { calculatedAqi: 220, category: "Poor" } },
      change: { periodMeanPm25UgM3: 60 },
    });
  });

  it("accepts grounded figures and rejects invented ones", async () => {
    const ok = vi.fn<GenerateFn>().mockResolvedValueOnce(reply("City PM2.5 averaged 60 µg/m³; the highest calculated AQI now is 220."));
    expect(await explainInsights({ facts, language: "en", generate: ok })).toMatchObject({ status: "ok", promptVersion: "insights-explain/v1" });

    const bad = vi.fn<GenerateFn>().mockResolvedValue(reply("PM2.5 will reach 300 µg/m³ tomorrow."));
    expect(await explainInsights({ facts, language: "en", generate: bad })).toMatchObject({ status: "ungrounded" });
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
