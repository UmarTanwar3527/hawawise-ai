/**
 * AQI index codes. Different standards are never interchangeable: a value
 * must always travel with its scale code.
 *
 * - `ind_cpcb`: India National AQI (Central Pollution Control Board)
 * - `uaqi`: Google Universal AQI
 */
export type AqiScaleCode = "ind_cpcb" | "uaqi";

/**
 * Provenance of a value shown in the UI.
 * - measured: a physical monitoring-station observation
 * - modelled: a spatial model estimate for an area, not a station
 * - forecast: a provider prediction for a future time
 */
export type DataProvenance = "measured" | "modelled" | "forecast";

/** Whether an AQI number came from the provider or was calculated by Hawa AI. */
export type AqiValueOrigin = "provider_reported" | "hawa_calculated";

export type CpcbAqiCategoryId =
  | "good"
  | "satisfactory"
  | "moderate"
  | "poor"
  | "very_poor"
  | "severe";

export const POLLUTANT_CODES = [
  "pm25",
  "pm10",
  "no2",
  "so2",
  "co",
  "o3",
  "nh3",
  "no",
  "nox",
] as const;
export type PollutantCode = (typeof POLLUTANT_CODES)[number];

/** Units stored exactly as the provider reports them (no conversion at rest). */
export type PollutantUnit = "ug_m3" | "mg_m3" | "ppb" | "ppm";

export type PollutantValue = {
  pollutant: PollutantCode;
  value: number;
  unit: PollutantUnit;
  /** As stated by the provider, e.g. "1h"; null when not stated (model output). */
  averagingPeriod: string | null;
  /** Share of expected samples in the average, when the provider reports it. */
  coveragePercent: number | null;
};

export const POLLUTANT_LABELS: Record<PollutantCode, string> = {
  pm25: "PM2.5",
  pm10: "PM10",
  no2: "NO₂",
  so2: "SO₂",
  co: "CO",
  o3: "O₃",
  nh3: "NH₃",
  no: "NO",
  nox: "NOₓ",
};

export const UNIT_LABELS: Record<PollutantUnit, string> = {
  ug_m3: "µg/m³",
  mg_m3: "mg/m³",
  ppb: "ppb",
  ppm: "ppm",
};
