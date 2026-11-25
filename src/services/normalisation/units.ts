import type { PollutantUnit } from "@/features/air-quality/types/aqi";

/**
 * Maps a provider unit string to our unit code. Returns null for anything
 * unrecognised so the caller can drop the value rather than guess.
 *
 * Providers differ in the "micro" character: OpenAQ uses the micro sign
 * (U+00B5) and Open-Meteo the Greek mu (U+03BC). Both are accepted.
 */
export function normaliseUnit(raw: string): PollutantUnit | null {
  const unit = raw.trim().toLowerCase().replace("μ", "µ").replace(/\s+/g, "");
  switch (unit) {
    case "µg/m³":
    case "µg/m3":
    case "ug/m3":
    case "ug/m³":
      return "ug_m3";
    case "mg/m³":
    case "mg/m3":
      return "mg_m3";
    case "ppb":
      return "ppb";
    case "ppm":
      return "ppm";
    default:
      return null;
  }
}
