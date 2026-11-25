import { describe, expect, it, vi } from "vitest";

import type { AreaForecast } from "@/features/air-quality/services/area-air-quality";
import { planRequestFromSearchParams, planRequestSchema, type PlanRequest } from "@/features/exposure-planner/schemas/plan-request";
import { buildExplanationFacts, explainPlan } from "@/features/exposure-planner/services/explain";
import { isMeaningfulDifference, istMinuteOfDay, periodOf, planExposure } from "@/features/exposure-planner/services/plan";
import type { GenerateFn } from "@/lib/gemini/types";

import { current } from "./guardian-fixtures";

const HOUR = 3_600_000;
/** 15:30 IST on 25 Nov 2026. */
const NOW = new Date("2026-11-25T10:00:00Z");

/** Daily shape seen in the real Jaipur forecast: lowest at midday, highest before dawn. */
function pm25AtIstHour(hour: number): number {
  if (hour >= 11 && hour < 17) return 27 + (hour - 11);
  if (hour < 5) return 80;
  return 60;
}

function forecast(
  edit: (iso: string, pm25: number) => number | null = (_, v) => v,
  { hours = 48, unit = "ug_m3" as const } = {},
): AreaForecast {
  return {
    location: { slug: "mansarovar", name: "Mansarovar" },
    provenance: "forecast",
    provider: "Open-Meteo",
    issuedAt: "2026-11-25T06:00:00Z",
    fetchedAt: "2026-11-25T09:26:00Z",
    isStale: false,
    unavailable: [],
    hours: Array.from({ length: hours }, (_, i) => {
      const at = new Date(NOW.getTime() + (i + 1) * HOUR).toISOString();
      const istHour = Math.floor(istMinuteOfDay(at) / 60);
      const pm25 = edit(at, pm25AtIstHour(istHour));
      return {
        forecastFor: at,
        pollutants: [
          ...(pm25 === null ? [] : [{ pollutant: "pm25" as const, value: pm25, unit, averagingPeriod: null, coveragePercent: null }]),
          { pollutant: "pm10" as const, value: 70, unit: "ug_m3" as const, averagingPeriod: null, coveragePercent: null },
        ],
      };
    }),
  };
}

const request = (overrides: Partial<PlanRequest> = {}): PlanRequest =>
  planRequestSchema.parse({ location: "mansarovar", activity: "running", duration: 45, day: "tomorrow", from: 5, to: 22, ...overrides });

describe("exposure planner: deterministic ranking", () => {
  it("picks the window with the lowest mean forecast PM2.5 and says how much lower it is", () => {
    const plan = planExposure({ forecast: forecast(), request: request(), now: NOW });
    expect(plan.status).toBe("ok");
    expect(plan.dayKey).toBe("2026-11-26");
    // 11:30 IST on 26 Nov = 06:00 UTC.
    expect(plan.best).toMatchObject({ start: "2026-11-26T06:00:00.000Z", pm25Mean: 27, rank: 1, relative: "lowest", period: "midday" });
    expect(plan.worst?.pm25Mean).toBe(60);
    expect(plan.clearDifference).toBe(true);
    expect(plan.bestBelowWorstPercent).toBe(55);
    // 12:30–3:30 pm IST (28–31) are within 5 µg/m³ of 27; 4:30 pm (32) is 5 µg/m³ and 15.6% higher.
    expect(plan.similarStarts.map((s) => s.slice(11, 16))).toEqual(["07:00", "08:00", "09:00", "10:00"]);
  });

  it("only uses start times that fit inside the range", () => {
    const plan = planExposure({ forecast: forecast(), request: request(), now: NOW });
    const starts = plan.windows.map((w) => w.startMinute);
    expect(Math.min(...starts)).toBe(5 * 60 + 30);
    // 21:30 + 45 min would finish after 22:00.
    expect(Math.max(...starts)).toBe(20 * 60 + 30);
    expect(plan.periods.map((p) => p.id)).toEqual(["morning", "midday", "evening", "night"]);
  });

  it("averages consecutive hours for longer activities", () => {
    const plan = planExposure({ forecast: forecast(), request: request({ duration: 90 }), now: NOW });
    expect(plan.best).toMatchObject({ hoursUsed: 2, pm25Mean: 27.5, pm25Max: 28 });
  });

  it("never ranks windows with missing values, and counts them", () => {
    const missingAtBest = (at: string, v: number) => (at === "2026-11-26T06:00:00.000Z" ? null : v);
    const plan = planExposure({ forecast: forecast(missingAtBest), request: request(), now: NOW });
    expect(plan.incompleteWindows).toBe(1);
    expect(plan.windows.find((w) => w.start === "2026-11-26T06:00:00.000Z")).toMatchObject({ complete: false, rank: null });
    expect(plan.best?.start).toBe("2026-11-26T07:00:00.000Z");
  });

  it("ignores values in other units rather than mixing them", () => {
    const plan = planExposure({ forecast: forecast(undefined, { unit: "ppb" as never }), request: request(), now: NOW });
    expect(plan.status).toBe("insufficient_data");
    expect(plan.best).toBeNull();
  });

  it("does not overstate small differences", () => {
    const flat = (_: string, v: number) => 40 + (v % 3);
    const plan = planExposure({ forecast: forecast(flat), request: request(), now: NOW });
    expect(plan.clearDifference).toBe(false);
    expect(plan.windows.filter((w) => w.relative === "higher")).toHaveLength(0);
    expect(isMeaningfulDifference(40, 44)).toBe(false); // < 5 µg/m³
    expect(isMeaningfulDifference(100, 106)).toBe(false); // < 15 %
    expect(isMeaningfulDifference(27, 60)).toBe(true);
  });

  it("skips hours that have already passed today", () => {
    const plan = planExposure({ forecast: forecast(), request: request({ day: "today", from: 5, to: 24 }), now: NOW });
    expect(plan.dayKey).toBe("2026-11-25");
    expect(plan.windows.every((w) => Date.parse(w.start) >= NOW.getTime())).toBe(true);
    expect(plan.best?.startMinute).toBe(16 * 60 + 30);
  });

  it("returns explicit statuses instead of guessing", () => {
    expect(planExposure({ forecast: forecast(undefined, { hours: 0 }), request: request(), now: NOW }).status).toBe("no_forecast");
    expect(planExposure({ forecast: forecast(), request: request({ from: 9, to: 9 }), now: NOW }).status).toBe("range_too_short");
    expect(planExposure({ forecast: forecast(), request: request({ from: 9, to: 10, duration: 90 }), now: NOW }).status).toBe("range_too_short");
    // Today's morning has already passed at 15:30 IST.
    expect(planExposure({ forecast: forecast(), request: request({ day: "today", from: 6, to: 10 }), now: NOW }).status).toBe("no_windows");
  });

  it("assigns parts of the day in IST, with night wrapping past midnight", () => {
    expect(periodOf(5 * 60)).toBe("morning");
    expect(periodOf(13 * 60)).toBe("midday");
    expect(periodOf(19 * 60 + 30)).toBe("evening");
    expect(periodOf(23 * 60)).toBe("night");
    expect(periodOf(2 * 60)).toBe("night");
  });
});

describe("exposure planner: request validation", () => {
  it("falls back to safe defaults for hand-edited values", () => {
    const parsed = planRequestFromSearchParams({ activity: "skydiving", duration: "7", from: "-3", to: "99", day: "yesterday", sensitive: "maybe" });
    expect(parsed.success && parsed.data).toEqual({
      location: "jaipur-city-centre",
      activity: "walking",
      duration: 45,
      day: "today",
      from: 5,
      to: 22,
      sensitive: false,
    });
    expect(planRequestFromSearchParams({ sensitive: "1", activity: ["cycling", "running"] }).data).toMatchObject({ sensitive: true, activity: "cycling" });
  });

  it("rejects malformed area slugs", () => {
    expect(planRequestFromSearchParams({ location: "../etc/passwd" }).success).toBe(false);
  });
});

describe("exposure planner: AI explanation (mocked Gemini)", () => {
  const plan = planExposure({ forecast: forecast(), request: request({ sensitive: true }), now: NOW });
  const facts = buildExplanationFacts(plan, current());

  const reply = (explanation: string, language: "en" | "hi" = "en") => ({
    content: { role: "model" as const, parts: [] },
    functionCalls: [{ name: "submit_explanation", args: { explanation, language } }],
    text: "",
    usage: { inputTokens: 0, outputTokens: 0 },
  });

  it("gives the model only the calculated comparison and labelled measurement", () => {
    expect(facts).toMatchObject({
      activity: "Running",
      sensitive: true,
      lowestWindow: { meanPm25UgM3: 27, start: "11:30 am IST" },
      clearDifference: true,
      forecast: { kind: "modelled forecast", provider: "Open-Meteo" },
      currentMeasurement: { kind: "measured", aqi: 140, category: "Moderate", aqiStandard: expect.stringContaining("calculated by Hawa AI") },
    });
  });

  it("accepts an explanation whose figures come from the data", async () => {
    const generate = vi.fn<GenerateFn>().mockResolvedValueOnce(reply("Around 11:30 am IST forecast PM2.5 averages 27 µg/m³ versus 60 µg/m³ later. Current AQI 140 (Moderate)."));
    const result = await explainPlan({ facts, language: "en", generate });
    expect(result).toMatchObject({ status: "ok", promptVersion: "planner-explain/v1" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].allowedTools).toEqual(["submit_explanation"]);
    expect(generate.mock.calls[0]?.[0].systemInstruction).toContain("Do not change the ranking");
  });

  it("rejects an invented figure, asks once for a correction, then gives up honestly", async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValueOnce(reply("PM2.5 will be 12 µg/m³ at noon."))
      .mockResolvedValueOnce(reply("PM2.5 will be 12 µg/m³ at noon."));
    expect(await explainPlan({ facts, language: "en", generate })).toMatchObject({ status: "ungrounded" });
    expect(JSON.stringify(generate.mock.calls[1]?.[0].contents)).toContain("not in the data: 12");
  });

  it("enforces the requested language", async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValueOnce(reply("The midday window is lower.", "hi"))
      .mockResolvedValueOnce(reply("दोपहर का समय तुलनात्मक रूप से बेहतर है।", "hi"));
    const result = await explainPlan({ facts, language: "hi", generate });
    expect(result).toMatchObject({ status: "ok", language: "hi" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
