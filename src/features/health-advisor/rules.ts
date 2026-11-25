/**
 * Deterministic AQI health advisory. Chooses official guidance for the
 * visitor's group, activity and the latest MEASURED station AQI. No AI and no
 * invented rules: every item's text comes from `constants.ts` (official
 * sources) or describes Hawa AI's own data (times, freshness).
 *
 * Modelled estimates are never used to set the AQI category.
 */
import type { CpcbAqiCategoryId } from "@/features/air-quality/types/aqi";

import {
  ACTIVITIES,
  ADVICE_TIER,
  EMERGENCY_NUMBERS,
  OFFICIAL_TABLE,
  PROFILES,
  type ActivityId,
  type ProfileId,
  type SourceId,
} from "./constants";

export type AdvisoryItem = { text: string; source: SourceId };

export type Measurement = {
  aqi: number;
  isLowerBound: boolean;
  category: CpcbAqiCategoryId;
  dominantPollutant: string | null;
  observedAt: string;
  isStale: boolean;
  stationName: string;
  distanceKm: number;
};

export type ForecastHint =
  | { status: "ok"; day: "today" | "tomorrow"; lowestWindow: string; similarWindows: string[] }
  | { status: "unavailable" };

export type Verdict = "go" | "adjust" | "limit" | "avoid" | "indoors";

export type Advisory = {
  status: "current" | "stale" | "unavailable";
  profile: ProfileId;
  activity: ActivityId;
  group: "general" | "vulnerable" | "unspecified";
  category: CpcbAqiCategoryId | null;
  measurement: Measurement | null;
  /** The official table row for this category (null without a measurement). */
  official: { healthEffects: string; general: string; vulnerable: string; applies: string } | null;
  tier: number | null;
  verdict: Verdict | null;
  headline: string;
  actions: AdvisoryItem[];
  avoid: AdvisoryItem[];
  atHome: AdvisoryItem[];
  recheck: AdvisoryItem;
  symptoms: AdvisoryItem[];
  warnings: AdvisoryItem[];
  forecast: ForecastHint;
};

const HIGH_AQI_TIER = 3; // The advisory's "poor to severe plus (AQI > 200)" messages.

const ALWAYS_AT_HOME: AdvisoryItem[] = [
  { text: "Avoid burning mosquito coils and incense sticks in closed rooms.", source: "mohfw" },
  { text: "Keep cooking areas well ventilated, and use clean fuels such as gas or electricity.", source: "mohfw" },
  { text: "Use wet mopping instead of sweeping indoors.", source: "mohfw" },
  { text: "Do not smoke; tobacco smoke adds to the harm from air pollution.", source: "mohfw" },
];

const SYMPTOMS: AdvisoryItem[] = [
  {
    text: "If you have breathlessness, cough, chest discomfort or pain, giddiness, or red or watery eyes, reduce or stop activity and consult the nearest doctor.",
    source: "mohfw",
  },
  {
    text: `For severe breathlessness, chest pain or fainting, seek urgent medical care: call ${EMERGENCY_NUMBERS}.`,
    source: "hawa",
  },
];

function verdictFor(tier: number, activity: ActivityId): Verdict {
  const { outdoors, exertion } = ACTIVITIES[activity];
  if (!outdoors) return "go";
  if (exertion === "none") return tier >= 5 ? "limit" : tier >= HIGH_AQI_TIER ? "adjust" : "go";
  if (exertion === "strenuous") return tier === 0 ? "go" : tier === 1 ? "adjust" : tier === 2 ? "limit" : tier >= 5 ? "indoors" : "avoid";
  // Moderate exertion: walking or general outdoor time.
  return tier <= 1 ? "go" : tier === 2 ? "adjust" : tier === 3 ? "limit" : tier === 4 ? "avoid" : "indoors";
}

const VERDICT_HEADLINE: Record<Verdict, (activity: string) => string> = {
  go: (a) => `${a}: no special precautions needed at this level`,
  adjust: (a) => `${a}: fine with some adjustments`,
  limit: (a) => `${a}: keep it shorter and lighter`,
  avoid: (a) => `${a}: better avoided outdoors right now`,
  indoors: (a) => `${a}: stay indoors and keep activity levels low`,
};

export function buildAdvisory({
  profile,
  activity,
  measurement,
  forecast,
}: {
  profile: ProfileId;
  activity: ActivityId;
  measurement: Measurement | null;
  forecast: ForecastHint;
}): Advisory {
  const group = profile === "unspecified" ? "unspecified" : PROFILES[profile].vulnerable ? "vulnerable" : "general";
  const activityLabel = ACTIVITIES[activity].label;
  const base = { profile, activity, group, measurement, forecast } as const;

  const recheckDefault: AdvisoryItem = {
    text: "Check the AQI of your area again before you plan your day out.",
    source: "mohfw",
  };

  if (!measurement) {
    return {
      ...base,
      status: "unavailable",
      category: null,
      official: null,
      tier: null,
      verdict: null,
      headline: "No current station measurement, so no level-specific advice",
      actions: [
        { text: "Check the daily AQI of your area before planning your day out.", source: "mohfw" },
        { text: "Avoid places with high air pollution, such as roads with slow and heavy traffic, construction sites and polluting industries.", source: "mohfw" },
      ],
      avoid: [],
      atHome: ALWAYS_AT_HOME,
      recheck: recheckDefault,
      symptoms: SYMPTOMS,
      warnings: [
        {
          text: "No recent measured AQI is available for this area. Model estimates are not used to set a health category.",
          source: "hawa",
        },
      ],
    };
  }

  const row = OFFICIAL_TABLE[measurement.category];
  // "Prefer not to specify" gets the general advice, with the vulnerable-group line shown alongside.
  const applies = group === "vulnerable" ? row.vulnerable : row.general;
  const tier = ADVICE_TIER[applies] ?? 0;
  const verdict = verdictFor(tier, activity);
  const outdoors = ACTIVITIES[activity].outdoors;
  const strenuous = ACTIVITIES[activity].exertion === "strenuous";
  const high = tier >= HIGH_AQI_TIER || ["poor", "very_poor", "severe"].includes(measurement.category);

  // The official line itself is shown separately (advisory.official); actions add the supporting messages.
  const actions: AdvisoryItem[] = [];
  if (tier === 0) actions.push({ text: "No special precautions are advised at this level. Check the AQI again before planning your day out.", source: "mohfw" });
  const avoid: AdvisoryItem[] = [];
  const warnings: AdvisoryItem[] = [];

  if (tier >= 1 && outdoors) {
    actions.push({
      text: "Avoid places with high air pollution, such as roads with slow and heavy traffic, construction sites and polluting industries.",
      source: "mohfw",
    });
  }
  if (forecast.status === "ok" && outdoors && tier >= 1) {
    actions.push({
      text: `The forecast suggests comparatively lower particle levels ${forecast.day} around ${forecast.lowestWindow} (modelled forecast, for comparing times only).`,
      source: "hawa",
    });
  }
  if (strenuous && tier >= 1 && tier <= 2) {
    actions.push({ text: "Keep sessions shorter and less strenuous, and avoid exercising near high-traffic areas.", source: "mohfw" });
  }
  if (strenuous && tier >= HIGH_AQI_TIER) {
    actions.push({ text: "Reschedule outdoor activities as per AQI levels, and keep activity levels low.", source: "mohfw" });
  }
  if (activity === "commuting" && high) {
    actions.push(
      { text: "Drive with the windows closed, and use the air conditioner in re-circulate mode.", source: "mohfw" },
      { text: "Use public transport whenever possible, and avoid long periods on busy routes.", source: "mohfw" },
    );
  }
  if (profile === "outdoor_worker" && high) {
    actions.push({
      text: "Outdoor workers are at higher risk. Where possible, keep away from heavy traffic and construction dust, and limit strenuous exertion.",
      source: "mohfw",
    });
  }
  if ((profile === "respiratory" || profile === "heart") && tier >= 1) {
    actions.push(
      { text: "Follow your doctor's instructions on your care, and watch for any worsening of your usual symptoms.", source: "mohfw" },
      { text: "Seek immediate medical advice if symptoms worsen.", source: "mohfw" },
    );
  }
  if (high) {
    actions.push({
      text: "Optional: if you choose a mask for short trips outside, a close-fitted N95 or N99 helps only when worn correctly; paper masks, handkerchiefs and cloth are not effective.",
      source: "mohfw",
    });
    if (profile === "respiratory" || profile === "heart" || profile === "child") {
      warnings.push({
        text: "WHO notes that respirators only help with a proper fit, that no commercial respirators for children were known (as of 2019), and that people with heart or lung disease should be cautious using them.",
        source: "who",
      });
    }
  }

  if (high && outdoors) {
    avoid.push(
      { text: "Outdoor walks, runs and exercise in the early morning and late evening.", source: "mohfw" },
      { text: "Jogging, running or other exertional physical activities outdoors.", source: "mohfw" },
    );
  }
  if (high && (profile === "pregnant" || profile === "child" || profile === "older_adult")) {
    avoid.push({ text: "Unnecessary outdoor movement: high-risk people should restrict it as far as possible.", source: "mohfw" });
  }
  if (high) avoid.push({ text: "Burning wood, leaves, crop residue, waste or firecrackers.", source: "mohfw" });

  const atHome: AdvisoryItem[] = high
    ? [
        { text: "Keep outside doors and windows closed in the morning and late evening; ventilate between 12 pm and 4 pm if needed.", source: "mohfw" },
        ...ALWAYS_AT_HOME,
      ]
    : ALWAYS_AT_HOME;

  if (measurement.isStale) {
    warnings.unshift({
      text: `This advice uses the last available reading (${measurement.stationName}), which is out of date. Conditions may have changed.`,
      source: "hawa",
    });
  }
  if (group === "unspecified") {
    warnings.push({
      text: `If you are in a vulnerable group (children, older adults, pregnant women, people with heart or lung conditions, outdoor workers), the official advice is: "${row.vulnerable}".`,
      source: "mohfw",
    });
  }
  if (measurement.isLowerBound) {
    warnings.push({ text: "The AQI is at least this value: the measured level is above the top of the scale.", source: "hawa" });
  }

  return {
    ...base,
    status: measurement.isStale ? "stale" : "current",
    category: measurement.category,
    official: { ...row, applies },
    tier,
    verdict,
    headline: outdoors ? VERDICT_HEADLINE[verdict](activityLabel) : "Indoor activity: fine, and keep indoor air clean",
    actions,
    avoid,
    atHome,
    recheck: measurement.isStale
      ? { text: "Check again later: a newer station reading is not available yet.", source: "hawa" }
      : high
        ? { text: "Check again in 1–2 hours. Station readings update hourly, usually a few hours after measurement.", source: "hawa" }
        : recheckDefault,
    symptoms: SYMPTOMS,
    warnings,
  };
}
