import "server-only";

import { generateGroundedExplanation, type GroundedExplanation } from "@/features/ai-guardian/agents/grounded-explanation";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import type { GenerateFn } from "@/lib/gemini/types";
import { formatDateTimeIst } from "@/lib/utils/format";

import { ACTIVITIES, PROFILES, SOURCES } from "../constants";
import { advisorExplainSystemPrompt, ADVISOR_EXPLAIN_PROMPT_VERSION } from "../prompts/advisor-explain.v1";
import type { Advisory, AdvisoryItem } from "../rules";
import { findMedicalSafetyProblem } from "../safety";

const item = (i: AdvisoryItem) => ({ text: i.text, source: SOURCES[i.source].short });

/** What the model sees: the rules engine's output and the labelled measurement. */
export function buildAdvisorFacts(advisory: Advisory, areaName: string) {
  const m = advisory.measurement;
  return {
    area: areaName,
    profile: PROFILES[advisory.profile].label,
    activity: ACTIVITIES[advisory.activity].label,
    dataStatus: advisory.status,
    measurement: m
      ? {
          kind: "measured",
          calculatedAqi: m.aqi,
          aqiIsLowerBound: m.isLowerBound,
          aqiStandard: "India National AQI (CPCB), calculated by Hawa AI from station measurements",
          category: CPCB_AQI_CATEGORIES.find((c) => c.id === m.category)?.label ?? null,
          dominantPollutant: m.dominantPollutant,
          station: m.stationName,
          distanceKm: m.distanceKm,
          observedAt: formatDateTimeIst(m.observedAt),
          isStale: m.isStale,
        }
      : null,
    officialGuidance: advisory.official
      ? {
          source: SOURCES.mohfw.label,
          healthEffects: advisory.official.healthEffects,
          adviceForThisGroup: advisory.official.applies,
          adviceForGeneralPopulation: advisory.official.general,
          adviceForVulnerablePopulation: advisory.official.vulnerable,
        }
      : null,
    headline: advisory.headline,
    recommendedActions: advisory.actions.map(item),
    whatToAvoid: advisory.avoid.map(item),
    atHome: advisory.atHome.map(item),
    whenToCheckAgain: item(advisory.recheck),
    ifYouFeelUnwell: advisory.symptoms.map(item),
    warnings: advisory.warnings.map(item),
    forecast:
      advisory.forecast.status === "ok"
        ? { kind: "modelled forecast, for comparing times only", day: advisory.forecast.day, comparativelyLowerWindow: advisory.forecast.lowestWindow }
        : { kind: "unavailable" },
  };
}

export type AdvisorFacts = ReturnType<typeof buildAdvisorFacts>;

export function explainAdvisory({
  facts,
  language,
  generate,
}: {
  facts: AdvisorFacts;
  language: "en" | "hi";
  generate: GenerateFn;
}): Promise<GroundedExplanation> {
  return generateGroundedExplanation({
    facts,
    task: "Explain this air-quality health advisory to the person.",
    systemInstruction: advisorExplainSystemPrompt(language),
    promptVersion: ADVISOR_EXPLAIN_PROMPT_VERSION,
    language,
    generate,
    maxOutputTokens: 800,
    logLabel: "advisor",
    validate: findMedicalSafetyProblem,
  });
}
