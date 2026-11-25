import "server-only";

import { generateGroundedExplanation, type GroundedExplanation } from "@/features/ai-guardian/agents/grounded-explanation";
import { categoryLabel } from "@/features/civic-reports/constants";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import type { GenerateFn } from "@/lib/gemini/types";
import { formatDateTimeIst } from "@/lib/utils/format";

import { hourRangeLabel } from "../format";
import { insightsExplainSystemPrompt, INSIGHTS_EXPLAIN_PROMPT_VERSION } from "../prompts/insights-explain.v1";

import type { CityInsights, StationStats } from "./compute";

const categoryName = (id: string | null) => CPCB_AQI_CATEGORIES.find((c) => c.id === id)?.label ?? null;

function current(station: StationStats | null) {
  if (!station?.latest) return null;
  return {
    station: station.name,
    calculatedAqi: station.latest.aqi,
    aqiIsLowerBound: station.latest.isLowerBound,
    category: categoryName(station.latest.category),
    dominantPollutant: station.latest.dominantPollutant,
    observedAt: formatDateTimeIst(station.latest.observedAt),
  };
}

/** The only data the model sees: calculated statistics, labelled. */
export function buildInsightsFacts(insights: CityInsights) {
  return {
    city: "Jaipur",
    period: { firstDay: insights.period.days[0], lastDay: insights.period.days.at(-1), days: insights.period.days.length },
    aqiStandard: "India National AQI (CPCB), calculated by Hawa AI from station measurements",
    monitoredStations: insights.stationCount,
    currentStationRanking: {
      highest: current(insights.ranking.mostPolluted),
      lowest: current(insights.ranking.cleanest),
      stationsWithCurrentData: insights.ranking.freshStations,
      note: insights.ranking.note,
    },
    dailyCityMeans: insights.daily.map((d) => ({
      day: d.day,
      pm25UgM3: d.pm25,
      pm10UgM3: d.pm10,
      meanCalculatedAqi: d.aqiMean,
      highestStationAqi: d.aqiMax,
      stationsIncluded: d.stations,
    })),
    change: {
      pm25LatestDayVsPreviousDayPercent: insights.change.pm25DayOverDayPercent,
      pm25LatestDayVsPeriodMeanPercent: insights.change.pm25VsPeriodPercent,
      periodMeanPm25UgM3: insights.change.periodPm25Mean,
      periodMeanPm10UgM3: insights.change.periodPm10Mean,
    },
    dailyRhythmPm25: {
      peakHourIst: insights.hourOfDay.peak ? hourRangeLabel(insights.hourOfDay.peak.hour) : null,
      peakMeanPm25UgM3: insights.hourOfDay.peak?.pm25 ?? null,
      lowestHourIst: insights.hourOfDay.lowest ? hourRangeLabel(insights.hourOfDay.lowest.hour) : null,
      lowestMeanPm25UgM3: insights.hourOfDay.lowest?.pm25 ?? null,
    },
    stationsOverPeriod: insights.stations.map((s) => ({
      station: s.name,
      meanPm25UgM3: s.pm25Mean,
      meanPm10UgM3: s.pm10Mean,
      meanCalculatedAqi: s.aqiMean,
      highestCalculatedAqi: s.aqiMax,
      dataCoveragePercent: s.coveragePercent,
    })),
    stationHoursByAqiCategory: insights.categoryHours.filter((c) => c.hours > 0).map((c) => ({ category: c.label, stationHours: c.hours })),
    dataCoveragePercent: insights.coverage.percent,
    forecast: insights.forecast
      ? {
          kind: "modelled forecast (Open-Meteo) for the city centre; reads lower than stations, use the direction only",
          changeFirstToLastFullDayPercent: insights.forecast.changePercent,
          days: insights.forecast.days.map((d) => d.day),
        }
      : null,
    communityReports: {
      kind: "unverified community submissions",
      last30Days: insights.reports.last30Days,
      byCategory: insights.reports.byCategory.map((r) => ({ category: categoryLabel(r.category), count: r.count })),
    },
  };
}

export type InsightsFacts = ReturnType<typeof buildInsightsFacts>;

export function explainInsights({
  facts,
  language,
  generate,
}: {
  facts: InsightsFacts;
  language: "en" | "hi";
  generate: GenerateFn;
}): Promise<GroundedExplanation> {
  return generateGroundedExplanation({
    facts,
    task: "Interpret these Jaipur air-quality insights.",
    systemInstruction: insightsExplainSystemPrompt(language),
    promptVersion: INSIGHTS_EXPLAIN_PROMPT_VERSION,
    language,
    generate,
    maxOutputTokens: 900,
    logLabel: "insights",
  });
}
