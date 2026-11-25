import "server-only";

import { z } from "zod";

import { collectDataNumbers, findUnsupportedFigures } from "@/features/ai-guardian/agents/grounding";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import type { AreaAirQuality } from "@/features/air-quality/services/area-air-quality";
import type { GenerateFn, ModelContent, ToolDeclaration } from "@/lib/gemini/types";
import { formatDateTimeIst, formatTimeIst } from "@/lib/utils/format";

import { ACTIVITIES } from "../constants";
import { plannerExplainSystemPrompt, PLANNER_EXPLAIN_PROMPT_VERSION } from "../prompts/planner-explain.v1";

import type { PlanResult, PlanWindow } from "./plan";

const SUBMIT: ToolDeclaration = {
  name: "submit_explanation",
  description: "Submit the explanation of the exposure plan.",
  parameters: {
    type: "object",
    properties: {
      explanation: { type: "string", description: "The explanation, at most 110 words." },
      language: { type: "string", enum: ["en", "hi"] },
    },
    required: ["explanation", "language"],
  },
};

const submitSchema = z.object({
  explanation: z.string().trim().min(1).max(1_500),
  language: z.enum(["en", "hi"]),
});

const DEVANAGARI = /[ऀ-ॿ]/;


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

export type PlanExplanation =
  | { status: "ok"; explanation: string; language: "en" | "hi"; promptVersion: string }
  | { status: "ungrounded"; promptVersion: string };

/**
 * One model turn (plus at most one correction) that explains an already
 * calculated plan. Every AQI or concentration figure must appear in the facts.
 */
export async function explainPlan({
  facts,
  language,
  generate,
}: {
  facts: ExplanationFacts;
  language: "en" | "hi";
  generate: GenerateFn;
}): Promise<PlanExplanation> {
  const allowed = collectDataNumbers(facts);
  const contents: ModelContent[] = [
    { role: "user", parts: [{ text: `Explain this exposure plan.\n\nDATA (JSON):\n${JSON.stringify(facts)}` }] },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await generate({
      systemInstruction: plannerExplainSystemPrompt(language),
      contents,
      tools: [SUBMIT],
      allowedTools: [SUBMIT.name],
      maxOutputTokens: 700,
    });
    const call = result.functionCalls.find((c) => c.name === SUBMIT.name);
    const parsed = submitSchema.safeParse(call?.args);

    let problem: string | null = null;
    if (!parsed.success) problem = "Call submit_explanation with explanation and language.";
    else {
      const unsupported = findUnsupportedFigures(parsed.data.explanation, allowed);
      const wrongLanguage = DEVANAGARI.test(parsed.data.explanation) !== (language === "hi");
      if (unsupported.length) {
        console.warn("planner explanation rejected figures", unsupported.join(","));
        problem = `Rejected: these figures are not in the data: ${unsupported.join(", ")}. Use only figures from the data.`;
      } else if (wrongLanguage) {
        problem = language === "hi" ? "Rewrite the explanation in Hindi (Devanagari script)." : "Rewrite the explanation in English.";
      } else {
        return { status: "ok", explanation: parsed.data.explanation, language, promptVersion: PLANNER_EXPLAIN_PROMPT_VERSION };
      }
    }

    contents.push(
      result.content,
      call
        ? { role: "user", parts: [{ functionResponse: { name: SUBMIT.name, id: call.id, response: { error: problem } } }] }
        : { role: "user", parts: [{ text: problem }] },
    );
  }
  return { status: "ungrounded", promptVersion: PLANNER_EXPLAIN_PROMPT_VERSION };
}
