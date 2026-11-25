import "server-only";

import { generateGroundedExplanation, type GroundedExplanation } from "@/features/ai-guardian/agents/grounded-explanation";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import type { AreaAirQuality } from "@/features/air-quality/services/area-air-quality";
import type { GenerateFn } from "@/lib/gemini/types";
import { formatDateTimeIst, formatTimeIst } from "@/lib/utils/format";

import { ACTIVITIES } from "../constants";
import { plannerExplainSystemPrompt, PLANNER_EXPLAIN_PROMPT_VERSION } from "../prompts/planner-explain.v1";

import type { PlanResult, PlanWindow } from "./plan";

function describeWindow(window: PlanWindow | null) {
  if (!window) return null;
  return {
    start: formatTimeIst(window.start),
    end: formatTimeIst(window.end),
    partOfDay: window.period,
    meanPm25UgM3: window.pm25Mean,
    maxPm25UgM3: window.pm25Max,
    meanPm10UgM3: window.pm10Mean,
  };
}

/** The only data the model sees: the calculated comparison and the latest measurement. */
export function buildExplanationFacts(plan: PlanResult, current: AreaAirQuality | null) {
  const measured = current?.measured ?? null;
  const category = measured?.aqi?.category ? CPCB_AQI_CATEGORIES.find((c) => c.id === measured.aqi?.category) : null;
  return {
    area: current?.location.name ?? plan.request.location,
    activity: ACTIVITIES[plan.request.activity].label,
    activityIntensity: ACTIVITIES[plan.request.activity].intensity,
    durationMinutes: plan.request.duration,
    day: plan.request.day,
    timeRangeIst: `${plan.request.from}:00 to ${plan.request.to}:00`,
    sensitive: plan.request.sensitive,
    forecast: {
      kind: "modelled forecast",
      provider: plan.forecast.provider,
      fetchedAt: plan.forecast.fetchedAt ? formatDateTimeIst(plan.forecast.fetchedAt) : null,
      isStale: plan.forecast.isStale,
      caveat: "Modelled values have read lower than Jaipur monitoring stations; use them to compare times, not as actual levels.",
    },
    lowestWindow: describeWindow(plan.best),
    highestWindow: describeWindow(plan.worst),
    clearDifference: plan.clearDifference,
    lowestBelowHighestPercent: plan.bestBelowWorstPercent,
    similarStartTimes: plan.similarStarts.map((start) => formatTimeIst(start)),
    lowestByPartOfDay: plan.periods.map((period) => ({ partOfDay: period.label, ...describeWindow(period.best) })),
    windowsCompared: plan.windows.filter((w) => w.complete).length,
    windowsWithMissingData: plan.incompleteWindows,
    currentMeasurement: measured
      ? {
          kind: "measured",
          station: measured.station.name,
          distanceKm: Math.round(measured.station.distanceKm * 10) / 10,
          aqi: measured.aqi ? measured.aqi.value : null,
          aqiIsLowerBound: measured.aqi?.isLowerBound ?? false,
          aqiStandard: "India National AQI (CPCB), calculated by Hawa AI",
          category: category?.label ?? null,
          cpcbHealthNote: category?.healthImpact ?? null,
          observedAt: formatDateTimeIst(measured.observedAt),
          isStale: measured.isStale,
        }
      : null,
  };
}

export type ExplanationFacts = ReturnType<typeof buildExplanationFacts>;

export type PlanExplanation = GroundedExplanation;

/**
 * One model turn (plus at most one correction) that explains an already
 * calculated plan. Every AQI or concentration figure must appear in the facts.
 */
export function explainPlan({
  facts,
  language,
  generate,
}: {
  facts: ExplanationFacts;
  language: "en" | "hi";
  generate: GenerateFn;
}): Promise<PlanExplanation> {
  return generateGroundedExplanation({
    facts,
    task: "Explain this exposure plan.",
    systemInstruction: plannerExplainSystemPrompt(language),
    promptVersion: PLANNER_EXPLAIN_PROMPT_VERSION,
    language,
    generate,
    logLabel: "planner",
  });
}
