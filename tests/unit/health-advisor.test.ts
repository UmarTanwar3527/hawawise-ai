import { describe, expect, it, vi } from "vitest";

import type { CpcbAqiCategoryId } from "@/features/air-quality/types/aqi";
import { ACTIVITY_IDS, ADVICE_TIER, OFFICIAL_TABLE, PROFILE_IDS, PROFILES } from "@/features/health-advisor/constants";
import { buildAdvisory, type Measurement } from "@/features/health-advisor/rules";
import { findMedicalSafetyProblem } from "@/features/health-advisor/safety";
import { buildAdvisorFacts, explainAdvisory } from "@/features/health-advisor/services/explain";
import { forecastHint, measurementFrom } from "@/features/health-advisor/services/advisor";
import { GeminiError, type GenerateFn } from "@/lib/gemini/types";

import { current } from "./guardian-fixtures";

const CATEGORIES: { id: CpcbAqiCategoryId; aqi: number }[] = [
  { id: "good", aqi: 40 },
  { id: "satisfactory", aqi: 90 },
  { id: "moderate", aqi: 150 },
  { id: "poor", aqi: 250 },
  { id: "very_poor", aqi: 350 },
  { id: "severe", aqi: 450 },
];

const measurement = (category: CpcbAqiCategoryId, aqi: number, overrides: Partial<Measurement> = {}): Measurement => ({
  aqi,
  isLowerBound: false,
  category,
  dominantPollutant: "pm25",
  observedAt: "2026-11-25T10:30:00Z",
  isStale: false,
  stationName: "Police Commissionerate, Jaipur - RSPCB",
  distanceKm: 1.3,
  ...overrides,
});

const noForecast = { status: "unavailable" } as const;
const texts = (a: ReturnType<typeof buildAdvisory>) =>
  [a.headline, ...a.actions, ...a.avoid, ...a.atHome, a.recheck, ...a.symptoms, ...a.warnings].map((i) => (typeof i === "string" ? i : i.text));

describe("health advisor: official rules", () => {
  it("applies the official MoHFW/CPCB advice for every category and group, verbatim", () => {
    for (const { id, aqi } of CATEGORIES) {
      const general = buildAdvisory({ profile: "general", activity: "walking", measurement: measurement(id, aqi), forecast: noForecast });
      const vulnerable = buildAdvisory({ profile: "child", activity: "walking", measurement: measurement(id, aqi), forecast: noForecast });
      expect(general.official?.applies).toBe(OFFICIAL_TABLE[id].general);
      expect(vulnerable.official?.applies).toBe(OFFICIAL_TABLE[id].vulnerable);
      expect(general.actions.length + general.avoid.length).toBeGreaterThan(0);
      // Vulnerable groups never get less restrictive advice than the general population.
      expect(vulnerable.tier ?? 0).toBeGreaterThanOrEqual(general.tier ?? 0);
    }
  });

  it("gets stricter as the category worsens, for both groups", () => {
    for (const group of ["general", "vulnerable"] as const) {
      const tiers = CATEGORIES.map(({ id }) => ADVICE_TIER[OFFICIAL_TABLE[id][group]]);
      expect(tiers.every((tier, i) => i === 0 || tier! >= tiers[i - 1]!)).toBe(true);
    }
  });

  it("maps every profile to the right group", () => {
    for (const profile of PROFILE_IDS) {
      const a = buildAdvisory({ profile, activity: "outdoor", measurement: measurement("poor", 250), forecast: noForecast });
      expect(a.group).toBe(profile === "unspecified" ? "unspecified" : PROFILES[profile].vulnerable ? "vulnerable" : "general");
    }
    const unspecified = buildAdvisory({ profile: "unspecified", activity: "outdoor", measurement: measurement("poor", 250), forecast: noForecast });
    expect(unspecified.official?.applies).toBe(OFFICIAL_TABLE.poor.general);
    expect(unspecified.warnings.some((w) => w.text.includes(OFFICIAL_TABLE.poor.vulnerable))).toBe(true);
  });

  it("adds profile-specific official messages at poor or worse", () => {
    const worker = buildAdvisory({ profile: "outdoor_worker", activity: "outdoor", measurement: measurement("poor", 250), forecast: noForecast });
    expect(texts(worker).some((t) => t.includes("Outdoor workers are at higher risk"))).toBe(true);
    for (const profile of ["pregnant", "child", "older_adult"] as const) {
      const a = buildAdvisory({ profile, activity: "walking", measurement: measurement("very_poor", 350), forecast: noForecast });
      expect(a.avoid.some((i) => i.text.includes("restrict"))).toBe(true);
    }
    const heart = buildAdvisory({ profile: "heart", activity: "walking", measurement: measurement("moderate", 150), forecast: noForecast });
    expect(texts(heart).some((t) => t.includes("Follow your doctor's instructions"))).toBe(true);
    const child = buildAdvisory({ profile: "child", activity: "walking", measurement: measurement("poor", 250), forecast: noForecast });
    expect(child.warnings.some((w) => w.source === "who" && w.text.includes("children"))).toBe(true);
  });

  it("sets activity verdicts consistently", () => {
    const at = (category: CpcbAqiCategoryId, aqi: number, activity: (typeof ACTIVITY_IDS)[number], profile: "general" | "respiratory" = "general") =>
      buildAdvisory({ profile, activity, measurement: measurement(category, aqi), forecast: noForecast }).verdict;
    expect(at("good", 40, "running")).toBe("go");
    expect(at("moderate", 150, "running")).toBe("adjust");
    expect(at("poor", 250, "running")).toBe("avoid");
    expect(at("severe", 450, "running", "respiratory")).toBe("indoors");
    expect(at("severe", 450, "indoor", "respiratory")).toBe("go");
    expect(at("poor", 250, "commuting")).toBe("adjust");
    const commute = buildAdvisory({ profile: "general", activity: "commuting", measurement: measurement("poor", 250), forecast: noForecast });
    expect(texts(commute).some((t) => t.includes("windows closed"))).toBe(true);
  });

  it("says when a reading is stale, and gives no level-specific advice without a measurement", () => {
    const stale = buildAdvisory({ profile: "general", activity: "walking", measurement: measurement("poor", 250, { isStale: true }), forecast: noForecast });
    expect(stale.status).toBe("stale");
    expect(stale.warnings[0]?.text).toMatch(/out of date/);
    expect(stale.recheck.text).toMatch(/newer station reading/);

    const missing = buildAdvisory({ profile: "respiratory", activity: "running", measurement: null, forecast: noForecast });
    expect(missing).toMatchObject({ status: "unavailable", category: null, official: null, verdict: null });
    expect(missing.warnings[0]?.text).toMatch(/Model estimates are not used/);
  });

  it("uses only measured CPCB values, never modelled estimates, to set the category", () => {
    expect(measurementFrom(current({ measured: null }))).toBeNull();
    const withUaqi = current();
    if (withUaqi.measured?.aqi) withUaqi.measured.aqi = { ...withUaqi.measured.aqi, scale: "uaqi" };
    expect(measurementFrom(withUaqi)).toBeNull();
    expect(measurementFrom(current())).toMatchObject({ aqi: 140, category: "moderate", stationName: "Police Commissionerate" });
  });

  it("mentions forecast windows only when a forecast exists, labelled as modelled", () => {
    expect(forecastHint(null, "jaipur-city-centre", new Date())).toEqual({ status: "unavailable" });
    const withForecast = buildAdvisory({
      profile: "general",
      activity: "walking",
      measurement: measurement("moderate", 150),
      forecast: { status: "ok", day: "today", lowestWindow: "3:30–4:30 pm IST", similarWindows: [] },
    });
    expect(withForecast.actions.some((a) => a.source === "hawa" && /modelled forecast/.test(a.text))).toBe(true);
    const without = buildAdvisory({ profile: "general", activity: "walking", measurement: measurement("moderate", 150), forecast: noForecast });
    expect(without.actions.some((a) => /forecast/.test(a.text))).toBe(false);
  });

  it("never produces medication, diagnosis or 'safe' wording in any combination", () => {
    for (const { id, aqi } of CATEGORIES) {
      for (const profile of PROFILE_IDS) {
        for (const activity of ACTIVITY_IDS) {
          const a = buildAdvisory({ profile, activity, measurement: measurement(id, aqi), forecast: noForecast });
          for (const text of texts(a)) expect(findMedicalSafetyProblem(text), text).toBeNull();
        }
      }
    }
  });
});

describe("health advisor: medical safety check", () => {
  it("rejects medication, dosage, diagnosis and safety promises in English and Hindi", () => {
    expect(findMedicalSafetyProblem("Keep your inhaler with you.")).toMatch(/medicines/);
    expect(findMedicalSafetyProblem("Take two tablets of paracetamol.")).toMatch(/medicines/);
    expect(findMedicalSafetyProblem("अपनी दवा साथ रखें।")).toMatch(/medicines/);
    expect(findMedicalSafetyProblem("You may have asthma.")).toMatch(/diagnose/);
    expect(findMedicalSafetyProblem("It is completely safe to run now.")).toMatch(/safe/);
    expect(findMedicalSafetyProblem("अभी बाहर जाना पूरी तरह सुरक्षित है।")).toMatch(/safe/);
  });

  it("accepts ordinary guidance, including referrals to a doctor", () => {
    expect(findMedicalSafetyProblem("Follow your doctor's instructions and seek medical advice if symptoms worsen.")).toBeNull();
    expect(findMedicalSafetyProblem("This is general information, not a medical diagnosis.")).toBeNull();
  });
});

describe("health advisor: AI explanation (mocked Gemini)", () => {
  const advisory = buildAdvisory({ profile: "respiratory", activity: "walking", measurement: measurement("poor", 250), forecast: noForecast });
  const facts = buildAdvisorFacts(advisory, "Jaipur city centre");
  const reply = (explanation: string, language: "en" | "hi" = "en") => ({
    content: { role: "model" as const, parts: [] },
    functionCalls: [{ name: "submit_explanation", args: { explanation, language } }],
    text: "",
    usage: { inputTokens: 0, outputTokens: 0 },
  });

  it("passes only rules-engine output and the labelled measurement", () => {
    expect(facts).toMatchObject({
      measurement: { kind: "measured", calculatedAqi: 250, category: "Poor", aqiStandard: expect.stringContaining("calculated by Hawa AI") },
      officialGuidance: { adviceForThisGroup: OFFICIAL_TABLE.poor.vulnerable },
    });
  });

  it("returns a Hindi explanation that passes the checks", async () => {
    const generate = vi.fn<GenerateFn>().mockResolvedValueOnce(reply("AQI 250 (Poor) है। आधिकारिक सलाह: बाहर की शारीरिक गतिविधियों से बचें।", "hi"));
    expect(await explainAdvisory({ facts, language: "hi", generate })).toMatchObject({ status: "ok", language: "hi", promptVersion: "advisor-explain/v1" });
    expect(generate.mock.calls[0]?.[0].systemInstruction).toContain("never mention medicines");
  });

  it("rejects medication advice once, then accepts a corrected answer", async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValueOnce(reply("AQI is 250. Keep your inhaler handy."))
      .mockResolvedValueOnce(reply("AQI is 250 (Poor). Avoid outdoor physical activities and follow your doctor's instructions."));
    expect(await explainAdvisory({ facts, language: "en", generate })).toMatchObject({ status: "ok" });
    expect(JSON.stringify(generate.mock.calls[1]?.[0].contents)).toContain("do not mention medicines");
  });

  it("rejects fabricated figures and gives up honestly", async () => {
    const generate = vi.fn<GenerateFn>().mockResolvedValue(reply("The AQI is 90, so conditions are fine."));
    expect(await explainAdvisory({ facts, language: "en", generate })).toMatchObject({ status: "ungrounded" });
  });

  it("propagates Gemini failures so the API can answer honestly", async () => {
    const generate = vi.fn<GenerateFn>().mockRejectedValue(new GeminiError("unavailable", 503));
    await expect(explainAdvisory({ facts, language: "en", generate })).rejects.toBeInstanceOf(GeminiError);
  });
});
