import "server-only";

import { z } from "zod";

import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import type { AreaSummary, PollutantReading } from "@/features/air-quality/services/area-air-quality";
import { POLLUTANT_LABELS, UNIT_LABELS } from "@/features/air-quality/types/aqi";
import type { ToolDeclaration } from "@/lib/gemini/types";
import { formatDateTimeIst, istDayKey } from "@/lib/utils/format";

import { searchKnowledge } from "../rag/knowledge-base";
import type { Evidence } from "../schemas/response";

import type { GuardianDataSource } from "./data-source";

const HOUR = 3_600_000;
const AQI_STANDARD = "India National AQI (CPCB), calculated by Hawa AI from station measurements";
const MEASURED_SOURCE = "OpenAQ — CPCB/RSPCB continuous monitoring station";
const MODEL_SOURCE = "Open-Meteo Air Quality model";

export type ToolExecution = {
  name: string;
  ok: boolean;
  /** Short, truthful description of what was done, shown in the UI. */
  label: string;
  /** Sent back to the model. Data only; never instructions or secrets. */
  result: Record<string, unknown>;
  evidence: Evidence[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Declarations (what the model sees)
// ---------------------------------------------------------------------------

const locationProperty = {
  type: "string",
  description: "Jaipur area name or slug, e.g. 'Mansarovar', 'C-Scheme', 'vaishali-nagar'. Use 'Jaipur' for the city centre.",
};

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: "get_current_air_quality",
    description:
      "Latest stored air quality for a Jaipur area: the nearest monitoring station's measured pollutants and Hawa AI-calculated CPCB AQI, plus the area's modelled estimate, with times and freshness.",
    parameters: { type: "object", properties: { location: locationProperty }, required: ["location"] },
  },
  {
    name: "get_air_quality_forecast",
    description: "Stored Open-Meteo model forecast (PM2.5, PM10) for a Jaipur area, summarised by day. Modelled, not measured.",
    parameters: {
      type: "object",
      properties: { location: locationProperty, hours: { type: "integer", minimum: 1, maximum: 96, description: "Hours ahead (default 48)." } },
      required: ["location"],
    },
  },
  {
    name: "compare_neighbourhoods",
    description:
      "Compare all Jaipur monitoring stations by calculated CPCB AQI, PM2.5 or PM10. Optionally map named areas to their nearest station.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["aqi", "pm25", "pm10"], description: "What to compare (default aqi)." },
        areas: { type: "array", items: locationProperty, maxItems: 9, description: "Optional areas to map to their nearest station." },
      },
    },
  },
  {
    name: "get_air_quality_trend",
    description: "Hourly measured PM2.5 or PM10 at the station used for a Jaipur area over recent hours, with completeness and summary statistics.",
    parameters: {
      type: "object",
      properties: {
        location: locationProperty,
        pollutant: { type: "string", enum: ["pm25", "pm10"] },
        hours: { type: "integer", minimum: 6, maximum: 48, description: "Look-back window in hours (default 24)." },
      },
      required: ["location"],
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search curated references (WHO 2021 guidelines, India NAAQS 2009, CPCB AQI categories and method, WHO health effects, Hawa AI data methodology). Use for standards, health context and definitions.",
    parameters: { type: "object", properties: { query: { type: "string", description: "What to look up." } }, required: ["query"] },
  },
  {
    name: "submit_answer",
    description: "Submit the final answer. Call exactly once, after retrieving the data you need.",
    parameters: {
      type: "object",
      properties: {
        answer: { type: "string", description: "The answer for the user. Light Markdown allowed." },
        summary: { type: "string", description: "One-sentence summary." },
        language: { type: "string", enum: ["en", "hi"] },
        recommendations: { type: "array", items: { type: "string" }, maxItems: 6, description: "Practical general guidance." },
        warnings: { type: "array", items: { type: "string" }, maxItems: 6, description: "Data limitations or caveats." },
      },
      required: ["answer", "language"],
    },
  },
];

export const DATA_TOOL_NAMES = TOOL_DECLARATIONS.map((t) => t.name).filter((n) => n !== "submit_answer");

// ---------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------

const location = z.string().trim().min(1).max(80);
export const toolArgSchemas = {
  get_current_air_quality: z.object({ location }),
  get_air_quality_forecast: z.object({ location, hours: z.number().int().min(1).max(96).default(48) }),
  compare_neighbourhoods: z.object({
    metric: z.enum(["aqi", "pm25", "pm10"]).default("aqi"),
    areas: z.array(location).max(9).optional(),
  }),
  get_air_quality_trend: z.object({
    location,
    pollutant: z.enum(["pm25", "pm10"]).default("pm25"),
    hours: z.number().int().min(6).max(48).default(24),
  }),
  search_knowledge: z.object({ query: z.string().trim().min(2).max(200) }),
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalise = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Maps a user-supplied area name to a stored area, or null. */
export function resolveArea(input: string, areas: AreaSummary[]): AreaSummary | null {
  const key = normalise(input.replace(/,?\s*(jaipur|rajasthan|india)\s*$/gi, "").trim());
  const centre = areas.find((area) => area.type === "city_centre");
  if (["", "jaipur", "jaipurcity", "city", "citycentre", "citycenter", "centre", "center"].includes(key)) return centre ?? null;
  return (
    areas.find((area) => normalise(area.slug) === key || normalise(area.name) === key) ??
    areas.find((area) => key.length >= 4 && (normalise(area.name).includes(key) || key.includes(normalise(area.name)))) ??
    null
  );
}

const categoryLabel = (id: string | null) => CPCB_AQI_CATEGORIES.find((c) => c.id === id)?.label ?? null;
const pollutantLabel = (code: string) => POLLUTANT_LABELS[code as keyof typeof POLLUTANT_LABELS] ?? code;
const round1 = (value: number) => Math.round(value * 10) / 10;

function describePollutants(pollutants: PollutantReading[]) {
  return pollutants.map((p) =>
    p.unit === "ppb" || p.unit === "ppm"
      ? { pollutant: pollutantLabel(p.pollutant), note: "Reported unit is under verification; do not quote this value." }
      : {
          pollutant: pollutantLabel(p.pollutant),
          value: round1(p.value),
          unit: UNIT_LABELS[p.unit],
          averaging: p.averagingPeriod === "1h" ? "1-hour average" : "model value",
        },
  );
}

function unknownArea(input: string, areas: AreaSummary[]): Omit<ToolExecution, "name"> {
  return {
    ok: false,
    label: `Could not find an area called "${input.slice(0, 40)}"`,
    result: { error: "Unknown area.", availableAreas: areas.map((a) => a.name) },
    evidence: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

type Executor = (args: unknown, data: GuardianDataSource) => Promise<Omit<ToolExecution, "name">>;

const executors: Record<keyof typeof toolArgSchemas, Executor> = {
  async get_current_air_quality(args, data) {
    const { location: input } = toolArgSchemas.get_current_air_quality.parse(args);
    const areas = await data.listAreas();
    const area = resolveArea(input, areas);
    if (!area) return unknownArea(input, areas);

    const current = await data.getCurrent(area.slug);
    const m = current.measured;
    const model = current.modelled;
    const evidence: Evidence[] = [];
    const warnings: string[] = [];
    if (m) {
      evidence.push({ source: MEASURED_SOURCE, station: m.station.name, observedAt: m.observedAt, fetchedAt: m.fetchedAt, dataKind: "measured", aqiStandard: m.aqi ? AQI_STANDARD : null, url: null });
      if (m.isStale) warnings.push(`Station data for ${area.name} is stale (hour ending ${formatDateTimeIst(m.observedAt)}).`);
    }
    if (model) {
      evidence.push({ source: MODEL_SOURCE, station: null, observedAt: model.observedAt, fetchedAt: model.fetchedAt, dataKind: "modelled", aqiStandard: null, url: null });
    }

    return {
      ok: true,
      label: `Retrieved current air quality for ${area.name}`,
      evidence,
      warnings,
      result: {
        area: { name: area.name, isMonitoringStation: false },
        measured: m
          ? {
              dataKind: "measured",
              source: MEASURED_SOURCE,
              station: m.station.name,
              stationDistanceKm: m.station.distanceKm,
              hourEnding: formatDateTimeIst(m.observedAt),
              fetchedAt: formatDateTimeIst(m.fetchedAt),
              ageMinutes: m.ageMinutes,
              isStale: m.isStale,
              aqi: m.aqi
                ? {
                    value: m.aqi.value,
                    isLowerBound: m.aqi.isLowerBound,
                    standard: AQI_STANDARD,
                    category: categoryLabel(m.aqi.category),
                    dominantPollutant: m.aqi.dominantPollutant ? pollutantLabel(m.aqi.dominantPollutant) : null,
                    note: "Calculated by Hawa AI using the CPCB method; not an official CPCB bulletin value.",
                  }
                : null,
              pollutants: describePollutants(m.pollutants),
            }
          : null,
        modelled: model
          ? {
              dataKind: "modelled",
              source: MODEL_SOURCE,
              modelHour: formatDateTimeIst(model.observedAt),
              isStale: model.isStale,
              pollutants: describePollutants(model.pollutants),
              note: "Model estimate for the area's grid cell. It has read well below station measurements in Jaipur; use only for trends. No AQI is calculated from it.",
            }
          : null,
        unavailable: current.unavailable,
      },
    };
  },

  async get_air_quality_forecast(args, data) {
    const { location: input, hours } = toolArgSchemas.get_air_quality_forecast.parse(args);
    const areas = await data.listAreas();
    const area = resolveArea(input, areas);
    if (!area) return unknownArea(input, areas);

    const forecast = await data.getForecast(area.slug, hours);
    if (forecast.hours.length === 0) {
      return { ok: true, label: `No stored forecast for ${area.name}`, result: { area: area.name, available: false, unavailable: forecast.unavailable }, evidence: [], warnings: [] };
    }
    const days = new Map<string, { pm25: number[]; pm10: number[]; firstIso: string }>();
    for (const hour of forecast.hours) {
      const key = istDayKey(hour.forecastFor);
      const day = days.get(key) ?? { pm25: [], pm10: [], firstIso: hour.forecastFor };
      for (const p of hour.pollutants) {
        if (p.unit !== "ug_m3") continue;
        if (p.pollutant === "pm25") day.pm25.push(p.value);
        if (p.pollutant === "pm10") day.pm10.push(p.value);
      }
      days.set(key, day);
    }
    const stats = (values: number[]) =>
      values.length
        ? { mean: round1(values.reduce((a, b) => a + b, 0) / values.length), min: round1(Math.min(...values)), max: round1(Math.max(...values)) }
        : null;
    const warnings = forecast.isStale ? [`The stored forecast for ${area.name} is more than 12 hours old.`] : [];

    return {
      ok: true,
      label: `Retrieved ${hours}-hour forecast for ${area.name}`,
      warnings,
      evidence: [{ source: MODEL_SOURCE, station: null, observedAt: forecast.hours[0]?.forecastFor ?? null, fetchedAt: forecast.fetchedAt, dataKind: "forecast", aqiStandard: null, url: null }],
      result: {
        area: area.name,
        dataKind: "forecast",
        source: MODEL_SOURCE,
        fetchedAt: forecast.fetchedAt ? formatDateTimeIst(forecast.fetchedAt) : null,
        isStale: forecast.isStale,
        unit: "µg/m³",
        days: [...days.entries()].map(([date, day]) => ({ date, hours: day.pm25.length, pm25: stats(day.pm25), pm10: stats(day.pm10) })),
        note: "Model forecast. It has read well below station measurements in Jaipur, so compare days with each other rather than reading values as expected AQI. No AQI is calculated from forecasts.",
      },
    };
  },

  async compare_neighbourhoods(args, data) {
    const { metric, areas: requested } = toolArgSchemas.compare_neighbourhoods.parse(args);
    const [stations, areas, values] = await Promise.all([
      data.getStations(),
      data.listAreas(),
      metric === "aqi" ? Promise.resolve([]) : data.getStationsPollutant(metric),
    ]);
    const now = data.now();
    const valueByStation = new Map(values.map((v) => [v.stationId, v]));
    const rows = stations.map((station) => {
      const reading = valueByStation.get(station.id);
      const observedAt = metric === "aqi" ? station.observedAt : reading?.observedAt ?? null;
      return {
        station: station.name,
        aqi: station.aqi ? { value: station.aqi.value, isLowerBound: station.aqi.isLowerBound, category: categoryLabel(station.aqi.category) } : null,
        value: metric === "aqi" ? undefined : reading ? round1(reading.value) : null,
        hourEnding: observedAt ? formatDateTimeIst(observedAt) : null,
        isStale: observedAt ? now.getTime() - Date.parse(observedAt) > 4 * HOUR : true,
      };
    });

    const distance = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
      const rad = (d: number) => (d * Math.PI) / 180;
      const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(h));
    };
    const areaMapping = (requested ?? [])
      .map((input) => resolveArea(input, areas))
      .filter((area): area is AreaSummary => area !== null)
      .map((area) => {
        const nearest = [...stations].sort((a, b) => distance(area, a) - distance(area, b))[0];
        return nearest ? { area: area.name, nearestStation: nearest.name, distanceKm: round1(distance(area, nearest)) } : { area: area.name, nearestStation: null };
      });

    const stale = rows.filter((row) => row.isStale).map((row) => row.station);
    return {
      ok: true,
      label: `Compared ${stations.length} monitoring stations by ${metric === "aqi" ? "calculated CPCB AQI" : POLLUTANT_LABELS[metric]}`,
      warnings: stale.length ? [`Stale or missing data at: ${stale.join(", ")}.`] : [],
      evidence: stations
        .filter((s) => s.observedAt)
        .map((s) => ({ source: MEASURED_SOURCE, station: s.name, observedAt: s.observedAt, fetchedAt: null, dataKind: "measured" as const, aqiStandard: metric === "aqi" ? AQI_STANDARD : null, url: null })),
      result: {
        dataKind: "measured",
        source: MEASURED_SOURCE,
        metric: metric === "aqi" ? AQI_STANDARD : `${POLLUTANT_LABELS[metric]} 1-hour average (µg/m³)`,
        stations: rows,
        areaToNearestStation: areaMapping,
        limitations: [
          `Jaipur has ${stations.length} active monitoring stations in this data; most neighbourhoods have no station of their own.`,
          "Stale readings are flagged and should not be compared as if current.",
        ],
      },
    };
  },

  async get_air_quality_trend(args, data) {
    const { location: input, pollutant, hours } = toolArgSchemas.get_air_quality_trend.parse(args);
    const areas = await data.listAreas();
    const area = resolveArea(input, areas);
    if (!area) return unknownArea(input, areas);
    const current = await data.getCurrent(area.slug);
    const station = current.measured?.station;
    if (!station) {
      return { ok: true, label: `No station data for ${area.name}`, result: { area: area.name, available: false, unavailable: current.unavailable }, evidence: [], warnings: [] };
    }
    const history = await data.getStationHistory(station.id, hours);
    const series = history
      .map((point) => ({ iso: point.observedAt, value: point.values[pollutant] }))
      .filter((point): point is { iso: string; value: { value: number; unit: "ug_m3" } } => point.value?.unit === "ug_m3")
      .map((point) => ({ hourEnding: formatDateTimeIst(point.iso), iso: point.iso, value: round1(point.value.value) }));

    if (series.length < 2) {
      return { ok: true, label: `Not enough ${POLLUTANT_LABELS[pollutant]} history at ${station.name}`, result: { area: area.name, station: station.name, available: false, hoursWithData: series.length }, evidence: [], warnings: [] };
    }
    const values = series.map((point) => point.value);
    const first = series[0]!;
    const last = series[series.length - 1]!;
    return {
      ok: true,
      label: `Retrieved ${hours}-hour ${POLLUTANT_LABELS[pollutant]} trend at ${station.name}`,
      warnings: series.length < hours * 0.75 ? [`Only ${series.length} of ${hours} hours have ${POLLUTANT_LABELS[pollutant]} data.`] : [],
      evidence: [{ source: MEASURED_SOURCE, station: station.name, observedAt: last.iso, fetchedAt: null, dataKind: "measured", aqiStandard: null, url: null }],
      result: {
        area: area.name,
        station: station.name,
        stationDistanceKm: station.distanceKm,
        dataKind: "measured",
        source: MEASURED_SOURCE,
        pollutant: POLLUTANT_LABELS[pollutant],
        unit: "µg/m³",
        window: { from: first.hourEnding, to: last.hourEnding, requestedHours: hours, hoursWithData: series.length },
        summary: {
          first: first.value,
          last: last.value,
          change: round1(last.value - first.value),
          min: round1(Math.min(...values)),
          max: round1(Math.max(...values)),
          mean: round1(values.reduce((a, b) => a + b, 0) / values.length),
        },
        hourly: series.map(({ hourEnding, value }) => ({ hourEnding, value })),
      },
    };
  },

  async search_knowledge(args) {
    const { query } = toolArgSchemas.search_knowledge.parse(args);
    const items = searchKnowledge(query);
    return {
      ok: true,
      label: `Searched reference knowledge for "${query.slice(0, 40)}"`,
      warnings: [],
      evidence: items.map((item) => ({
        source: `${item.source.publisher} — ${item.source.document}${item.source.document.includes(String(item.source.year)) ? "" : ` (${item.source.year})`}`, station: null, observedAt: null, fetchedAt: null, dataKind: "reference" as const, aqiStandard: null, url: item.source.url })),
      result: {
        results: items.map((item) => ({ title: item.title, publisher: item.source.publisher, document: item.source.document, year: item.source.year, url: item.source.url, content: item.content })),
        note: items.length ? undefined : "No matching reference in the curated knowledge base.",
      },
    };
  },
};

/** Validates arguments and runs one allowlisted tool. Never throws. */
export async function executeTool(name: string, args: unknown, data: GuardianDataSource): Promise<ToolExecution> {
  if (!(name in executors)) {
    return { name, ok: false, label: "Rejected an unknown tool request", result: { error: "Unknown tool." }, evidence: [], warnings: [] };
  }
  const key = name as keyof typeof executors;
  const parsed = toolArgSchemas[key].safeParse(args);
  if (!parsed.success) {
    return { name, ok: false, label: `Rejected invalid arguments for ${name}`, result: { error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` }, evidence: [], warnings: [] };
  }
  try {
    return { name, ...(await executors[key](parsed.data, data)) };
  } catch (error) {
    console.error("guardian tool failed", name, error instanceof Error ? error.name : "unknown");
    return { name, ok: false, label: `Could not retrieve data (${name})`, result: { error: "Data is temporarily unavailable. Tell the user it cannot be verified right now." }, evidence: [], warnings: [] };
  }
}
