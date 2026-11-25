import { z } from "zod";

import { getCpcbAqiCategory } from "./cpcb-aqi-scale";
import type { CpcbAqiCategoryId, PollutantCode, PollutantUnit } from "./types/aqi";

/**
 * India National AQI (CPCB) calculation from station concentrations.
 *
 * Method: CPCB National Air Quality Index (2014).
 *   - Averaging: 24 h for PM10, PM2.5, NO2, SO2, NH3; 8 h for CO and O3.
 *   - Sub-index: linear interpolation within the pollutant's breakpoint band.
 *   - AQI = the highest sub-index. At least 3 pollutants are required, one
 *     of which must be PM2.5 or PM10.
 *
 * Hawa AI implementation choices (documented in docs/air-quality-data.md):
 *   - A 24 h average needs at least 16 hourly values; an 8 h average needs 6.
 *   - Averages are rounded to the breakpoint precision (whole numbers; CO to
 *     0.1 mg/m³) before banding, so values between bands are unambiguous.
 *   - Only mass-concentration units are used. Values reported in ppb/ppm are
 *     excluded because converting them requires temperature and pressure
 *     assumptions. CO in µg/m³ is converted exactly to mg/m³.
 *   - The CPCB Severe band has no published upper concentration, so a Severe
 *     sub-index is reported as a lower bound (401+) rather than extrapolated.
 *
 * The result is a Hawa AI calculation, not an official CPCB AQI, and must
 * be labelled as such wherever it is shown.
 */

export const CPCB_CALCULATION_METHOD = "cpcb_naqi_2014";

type CpcbPollutant = "pm10" | "pm25" | "no2" | "so2" | "co" | "o3" | "nh3";

type PollutantRule = {
  averagingHours: 24 | 8;
  minimumHours: number;
  /** Unit the breakpoints are defined in. */
  unit: "ug_m3" | "mg_m3";
  /** Concentration [low, high] for each AQI band from Good to Very Poor. */
  bands: readonly [number, number][];
  /** Decimal places the breakpoints use. */
  precision: number;
};

const AQI_BANDS: readonly [number, number][] = [
  [0, 50],
  [51, 100],
  [101, 200],
  [201, 300],
  [301, 400],
];
const SEVERE_FLOOR = 401;

export const CPCB_POLLUTANT_RULES: Record<CpcbPollutant, PollutantRule> = {
  pm10: { averagingHours: 24, minimumHours: 16, unit: "ug_m3", precision: 0,
    bands: [[0, 50], [51, 100], [101, 250], [251, 350], [351, 430]] },
  pm25: { averagingHours: 24, minimumHours: 16, unit: "ug_m3", precision: 0,
    bands: [[0, 30], [31, 60], [61, 90], [91, 120], [121, 250]] },
  no2: { averagingHours: 24, minimumHours: 16, unit: "ug_m3", precision: 0,
    bands: [[0, 40], [41, 80], [81, 180], [181, 280], [281, 400]] },
  so2: { averagingHours: 24, minimumHours: 16, unit: "ug_m3", precision: 0,
    bands: [[0, 40], [41, 80], [81, 380], [381, 800], [801, 1600]] },
  nh3: { averagingHours: 24, minimumHours: 16, unit: "ug_m3", precision: 0,
    bands: [[0, 200], [201, 400], [401, 800], [801, 1200], [1201, 1800]] },
  o3: { averagingHours: 8, minimumHours: 6, unit: "ug_m3", precision: 0,
    bands: [[0, 50], [51, 100], [101, 168], [169, 208], [209, 748]] },
  co: { averagingHours: 8, minimumHours: 6, unit: "mg_m3", precision: 1,
    bands: [[0, 1.0], [1.1, 2.0], [2.1, 10], [10.1, 17], [17.1, 34]] },
};

export type HourlyConcentration = {
  /** End of the averaging hour. */
  observedAt: Date;
  pollutant: PollutantCode;
  value: number;
  unit: PollutantUnit;
};

export type SubIndex = {
  pollutant: CpcbPollutant;
  average: number;
  unit: "ug_m3" | "mg_m3";
  hoursUsed: number;
  averagingHours: 24 | 8;
  subIndex: number;
  isLowerBound: boolean;
};

export type ExcludedPollutant = {
  pollutant: CpcbPollutant;
  reason: "no_data" | "insufficient_hours" | "unit_not_supported";
  detail?: string;
};

export type CpcbAqiResult =
  | {
      ok: true;
      aqi: number;
      isLowerBound: boolean;
      category: CpcbAqiCategoryId;
      dominantPollutant: CpcbPollutant;
      asOf: Date;
      method: typeof CPCB_CALCULATION_METHOD;
      subIndices: SubIndex[];
      excluded: ExcludedPollutant[];
    }
  | {
      ok: false;
      reason: "insufficient_pollutants" | "no_particulate_matter";
      asOf: Date;
      subIndices: SubIndex[];
      excluded: ExcludedPollutant[];
    };

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Sub-index for an already-averaged, rounded concentration. */
export function calculateSubIndex(
  pollutant: CpcbPollutant,
  concentration: number,
): { subIndex: number; isLowerBound: boolean } {
  const rule = CPCB_POLLUTANT_RULES[pollutant];
  const value = roundTo(concentration, rule.precision);

  for (let band = 0; band < rule.bands.length; band += 1) {
    const [cLow, cHigh] = rule.bands[band] as [number, number];
    const [iLow, iHigh] = AQI_BANDS[band] as [number, number];
    if (value <= cHigh) {
      const clamped = Math.max(value, cLow);
      const subIndex = ((iHigh - iLow) / (cHigh - cLow)) * (clamped - cLow) + iLow;
      return { subIndex: Math.round(subIndex), isLowerBound: false };
    }
  }
  return { subIndex: SEVERE_FLOOR, isLowerBound: true };
}

function toRuleUnit(
  value: number,
  unit: PollutantUnit,
  target: "ug_m3" | "mg_m3",
): number | null {
  if (unit === target) return value;
  if (unit === "ug_m3" && target === "mg_m3") return value / 1000;
  if (unit === "mg_m3" && target === "ug_m3") return value * 1000;
  return null; // ppb/ppm need temperature/pressure assumptions
}

/**
 * Calculates the CPCB AQI as of the end of the hour `asOf` from hourly
 * station concentrations. Values outside the averaging windows are ignored.
 */
export function calculateCpcbAqi(
  hourly: readonly HourlyConcentration[],
  asOf: Date,
): CpcbAqiResult {
  const subIndices: SubIndex[] = [];
  const excluded: ExcludedPollutant[] = [];

  for (const [pollutant, rule] of Object.entries(CPCB_POLLUTANT_RULES) as [CpcbPollutant, PollutantRule][]) {
    const windowStart = asOf.getTime() - rule.averagingHours * 3_600_000;
    const inWindow = hourly.filter(
      (entry) =>
        entry.pollutant === pollutant &&
        entry.observedAt.getTime() > windowStart &&
        entry.observedAt.getTime() <= asOf.getTime(),
    );

    if (inWindow.length === 0) {
      excluded.push({ pollutant, reason: "no_data" });
      continue;
    }

    const converted = inWindow.map((entry) => toRuleUnit(entry.value, entry.unit, rule.unit));
    if (converted.some((value) => value === null)) {
      excluded.push({ pollutant, reason: "unit_not_supported", detail: inWindow[0]?.unit });
      continue;
    }

    // One value per hour; if a provider repeats an hour, keep the last.
    const perHour = new Map<number, number>();
    inWindow.forEach((entry, index) => perHour.set(entry.observedAt.getTime(), converted[index] as number));

    if (perHour.size < rule.minimumHours) {
      excluded.push({
        pollutant,
        reason: "insufficient_hours",
        detail: `${perHour.size}/${rule.averagingHours}`,
      });
      continue;
    }

    const values = [...perHour.values()];
    const average = roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, rule.precision);
    const { subIndex, isLowerBound } = calculateSubIndex(pollutant, average);
    subIndices.push({
      pollutant,
      average,
      unit: rule.unit,
      hoursUsed: perHour.size,
      averagingHours: rule.averagingHours,
      subIndex,
      isLowerBound,
    });
  }

  const base = { asOf, subIndices, excluded };
  if (subIndices.length < 3) return { ok: false, reason: "insufficient_pollutants", ...base };
  if (!subIndices.some((entry) => entry.pollutant === "pm25" || entry.pollutant === "pm10")) {
    return { ok: false, reason: "no_particulate_matter", ...base };
  }

  const dominant = subIndices.reduce((max, entry) => (entry.subIndex > max.subIndex ? entry : max));
  const category = getCpcbAqiCategory(dominant.subIndex);
  if (!category) throw new Error("Unreachable: sub-index outside the CPCB scale");

  return {
    ok: true,
    aqi: dominant.subIndex,
    isLowerBound: dominant.isLowerBound,
    category: category.id,
    dominantPollutant: dominant.pollutant,
    method: CPCB_CALCULATION_METHOD,
    ...base,
  };
}

const cpcbPollutantSchema = z.enum(["pm10", "pm25", "no2", "so2", "co", "o3", "nh3"]);

/** Shape of aqi_index_values.calculation_details, validated when read back. */
export const calculationDetailsSchema = z.object({
  subIndices: z.array(
    z.object({
      pollutant: cpcbPollutantSchema,
      average: z.number(),
      unit: z.enum(["ug_m3", "mg_m3"]),
      hoursUsed: z.number(),
      averagingHours: z.union([z.literal(24), z.literal(8)]),
      subIndex: z.number(),
      isLowerBound: z.boolean(),
    }),
  ),
  excluded: z.array(
    z.object({
      pollutant: cpcbPollutantSchema,
      reason: z.enum(["no_data", "insufficient_hours", "unit_not_supported"]),
      detail: z.string().optional(),
    }),
  ),
});
