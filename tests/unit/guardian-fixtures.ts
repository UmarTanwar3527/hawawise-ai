import type {
  AreaAirQuality,
  AreaForecast,
  AreaSummary,
  StationHistoryPoint,
  StationOverview,
} from "@/features/air-quality/services/area-air-quality";
import type { GuardianDataSource } from "@/features/ai-guardian/tools/data-source";
import type { GenerateFn, GenerateRequest, GenerateResult } from "@/lib/gemini/types";

export const NOW = new Date("2026-11-25T09:30:00Z");
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

export const AREAS: AreaSummary[] = [
  { slug: "jaipur-city-centre", name: "Jaipur city centre", type: "city_centre", latitude: 26.9124, longitude: 75.7873 },
  { slug: "mansarovar", name: "Mansarovar", type: "neighbourhood", latitude: 26.8756, longitude: 75.7509 },
];

export function current(overrides: Partial<AreaAirQuality> = {}): AreaAirQuality {
  return {
    location: { slug: "jaipur-city-centre", name: "Jaipur city centre", latitude: 26.9124, longitude: 75.7873, type: "city_centre" },
    measured: {
      provenance: "measured",
      provider: "OpenAQ",
      station: { id: "st-1", name: "Police Commissionerate", distanceKm: 1.3, network: "CPCB", operator: "RSPCB" },
      aqi: {
        scale: "ind_cpcb",
        value: 140,
        isLowerBound: false,
        category: "moderate",
        dominantPollutant: "pm10",
        origin: "hawa_calculated",
        calculationMethod: "cpcb_naqi_2014",
        calculationDetails: null,
      },
      pollutants: [
        { pollutant: "pm25", value: 54.5, unit: "ug_m3", averagingPeriod: "1h", coveragePercent: 100 },
        { pollutant: "pm10", value: 108, unit: "ug_m3", averagingPeriod: "1h", coveragePercent: 100 },
        { pollutant: "co", value: 1.19, unit: "ppb", averagingPeriod: "1h", coveragePercent: 100 },
      ],
      observedAt: iso(3),
      fetchedAt: iso(1),
      ageMinutes: 180,
      isStale: false,
    },
    modelled: {
      provenance: "modelled",
      provider: "Open-Meteo",
      pollutants: [{ pollutant: "pm25", value: 24.1, unit: "ug_m3", averagingPeriod: null, coveragePercent: null }],
      observedAt: iso(0.5),
      fetchedAt: iso(1),
      ageMinutes: 30,
      isStale: false,
    },
    unavailable: [],
    ...overrides,
  };
}

export const STATIONS: StationOverview[] = [
  { id: "st-1", name: "Police Commissionerate", latitude: 26.916, longitude: 75.8015, network: "CPCB", operator: "RSPCB", observedAt: iso(3), aqi: { value: 140, isLowerBound: false, category: "moderate" } },
  { id: "st-2", name: "Mansarovar Sector-12", latitude: 26.855, longitude: 75.76, network: "CPCB", operator: "RSPCB", observedAt: iso(3), aqi: { value: 242, isLowerBound: false, category: "poor" } },
  { id: "st-3", name: "Sector-2 Murlipura", latitude: 26.97, longitude: 75.77, network: "CPCB", operator: "RSPCB", observedAt: iso(10), aqi: { value: 148, isLowerBound: false, category: "moderate" } },
];

export const FORECAST: AreaForecast = {
  location: { slug: "jaipur-city-centre", name: "Jaipur city centre" },
  provenance: "forecast",
  provider: "Open-Meteo",
  issuedAt: iso(6),
  fetchedAt: iso(1),
  isStale: false,
  hours: [1, 2, 3].map((h) => ({
    forecastFor: new Date(NOW.getTime() + h * 3_600_000).toISOString(),
    pollutants: [
      { pollutant: "pm25" as const, value: 30 + h, unit: "ug_m3" as const, averagingPeriod: null, coveragePercent: null },
      { pollutant: "pm10" as const, value: 40 + h, unit: "ug_m3" as const, averagingPeriod: null, coveragePercent: null },
    ],
  })),
  unavailable: [],
};

export const HISTORY: StationHistoryPoint[] = [41.5, 60, 82, 54.5].map((value, index) => ({
  observedAt: iso(24 - index * 7),
  values: { pm25: { value, unit: "ug_m3" } },
}));

export function fakeData(overrides: Partial<GuardianDataSource> = {}): GuardianDataSource {
  return {
    now: () => NOW,
    listAreas: async () => AREAS,
    getCurrent: async () => current(),
    getForecast: async () => FORECAST,
    getStations: async () => STATIONS,
    getStationsPollutant: async () => [{ stationId: "st-1", value: 54.5, unit: "ug_m3", observedAt: iso(3) }],
    getStationHistory: async () => HISTORY,
    ...overrides,
  };
}

/** A scripted model: each call returns the next turn's function calls. */
export function scriptedModel(turns: { name: string; args: Record<string, unknown> }[][]) {
  const requests: GenerateRequest[] = [];
  let index = 0;
  const generate: GenerateFn = async (request) => {
    requests.push(structuredClone(request));
    const calls = turns[Math.min(index, turns.length - 1)] ?? [];
    index += 1;
    const result: GenerateResult = {
      content: { role: "model", parts: calls.map((call) => ({ functionCall: call })) },
      functionCalls: calls,
      text: "",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    return result;
  };
  return { generate, requests };
}
