import { describe, expect, it } from "vitest";

import {
  calculateCpcbAqi,
  calculateSubIndex,
  type HourlyConcentration,
} from "@/features/air-quality/cpcb-aqi-calculator";
import type { PollutantCode, PollutantUnit } from "@/features/air-quality/types/aqi";

const AS_OF = new Date("2026-11-25T03:30:00Z");

/** `hours` hourly values ending at AS_OF, all equal to `value`. */
function series(
  pollutant: PollutantCode,
  value: number,
  hours: number,
  unit: PollutantUnit = "ug_m3",
): HourlyConcentration[] {
  return Array.from({ length: hours }, (_, i) => ({
    observedAt: new Date(AS_OF.getTime() - i * 3_600_000),
    pollutant,
    value,
    unit,
  }));
}

describe("calculateSubIndex (CPCB NAQI 2014 breakpoints)", () => {
  it.each([
    // Hand-checked against the CPCB linear interpolation formula.
    ["pm25", 105, 249],
    ["pm25", 85, 183],
    ["pm25", 82, 173],
    ["pm10", 257, 207],
    ["pm10", 256, 206],
    ["pm10", 134, 123],
    ["o3", 78, 78],
  ] as const)("%s at %d → %d", (pollutant, concentration, expected) => {
    expect(calculateSubIndex(pollutant, concentration)).toEqual({
      subIndex: expected,
      isLowerBound: false,
    });
  });

  it.each([
    ["pm25", 0, 0],
    ["pm25", 30, 50],
    ["pm25", 31, 51],
    ["pm25", 60, 100],
    ["pm25", 250, 400],
    ["pm10", 430, 400],
    ["co", 1.0, 50],
    ["co", 1.1, 51],
  ] as const)("band boundary: %s at %d → %d", (pollutant, concentration, expected) => {
    expect(calculateSubIndex(pollutant, concentration).subIndex).toBe(expected);
  });

  it("rounds to breakpoint precision so values between bands are unambiguous", () => {
    expect(calculateSubIndex("pm25", 30.4).subIndex).toBe(50);
    expect(calculateSubIndex("pm25", 30.5).subIndex).toBe(51);
  });

  it("reports the Severe band as a lower bound instead of extrapolating", () => {
    expect(calculateSubIndex("pm25", 251)).toEqual({ subIndex: 401, isLowerBound: true });
    expect(calculateSubIndex("pm10", 900)).toEqual({ subIndex: 401, isLowerBound: true });
  });
});

describe("calculateCpcbAqi", () => {
  it("takes the highest sub-index as the AQI and names the dominant pollutant", () => {
    const result = calculateCpcbAqi(
      [...series("pm25", 105, 24), ...series("pm10", 257, 24), ...series("o3", 6, 8)],
      AS_OF,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.aqi).toBe(249);
    expect(result.category).toBe("poor");
    expect(result.dominantPollutant).toBe("pm25");
    expect(result.method).toBe("cpcb_naqi_2014");
  });

  it("requires at least three pollutants", () => {
    const result = calculateCpcbAqi([...series("pm25", 50, 24), ...series("pm10", 80, 24)], AS_OF);
    expect(result).toMatchObject({ ok: false, reason: "insufficient_pollutants" });
  });

  it("requires PM2.5 or PM10 among the pollutants", () => {
    const result = calculateCpcbAqi(
      [...series("no2", 50, 24), ...series("so2", 20, 24), ...series("o3", 40, 8)],
      AS_OF,
    );
    expect(result).toMatchObject({ ok: false, reason: "no_particulate_matter" });
  });

  it("needs at least 16 hours for a 24-hour average", () => {
    const result = calculateCpcbAqi(
      [...series("pm25", 50, 15), ...series("pm10", 80, 24), ...series("o3", 40, 8)],
      AS_OF,
    );
    expect(result.excluded).toContainEqual({ pollutant: "pm25", reason: "insufficient_hours", detail: "15/24" });
  });

  it("only uses the 8 hours ending at the reporting hour for O3 and CO", () => {
    // 8 recent hours at 40, plus older hours at 700 that must be ignored.
    const older = series("o3", 700, 24).slice(8);
    const result = calculateCpcbAqi(
      [...series("pm25", 50, 24), ...series("pm10", 80, 24), ...series("o3", 40, 8), ...older],
      AS_OF,
    );
    const o3 = result.subIndices.find((entry) => entry.pollutant === "o3");
    expect(o3).toMatchObject({ average: 40, hoursUsed: 8, subIndex: 40 });
  });

  it("ignores values reported after the reporting hour", () => {
    const future: HourlyConcentration = {
      observedAt: new Date(AS_OF.getTime() + 3_600_000),
      pollutant: "pm25",
      value: 999,
      unit: "ug_m3",
    };
    const result = calculateCpcbAqi(
      [...series("pm25", 50, 24), future, ...series("pm10", 80, 24), ...series("o3", 40, 8)],
      AS_OF,
    );
    expect(result.subIndices.find((entry) => entry.pollutant === "pm25")?.average).toBe(50);
  });

  it("excludes ppb/ppm values instead of converting them with assumed conditions", () => {
    const result = calculateCpcbAqi(
      [
        ...series("pm25", 50, 24),
        ...series("pm10", 80, 24),
        ...series("o3", 40, 8),
        ...series("no2", 60, 24, "ppb"),
      ],
      AS_OF,
    );
    expect(result.excluded).toContainEqual({ pollutant: "no2", reason: "unit_not_supported", detail: "ppb" });
  });

  it("converts CO from µg/m³ to mg/m³ exactly", () => {
    const result = calculateCpcbAqi(
      [
        ...series("pm25", 20, 24),
        ...series("pm10", 40, 24),
        ...series("co", 1500, 8, "ug_m3"),
      ],
      AS_OF,
    );
    expect(result.subIndices.find((entry) => entry.pollutant === "co")).toMatchObject({
      average: 1.5,
      unit: "mg_m3",
    });
  });

  it("marks the overall AQI as a lower bound when the dominant pollutant is Severe", () => {
    const result = calculateCpcbAqi(
      [...series("pm25", 300, 24), ...series("pm10", 200, 24), ...series("o3", 40, 8)],
      AS_OF,
    );
    expect(result).toMatchObject({ ok: true, aqi: 401, isLowerBound: true, category: "severe" });
  });
});
