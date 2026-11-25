/**
 * Grounding check: every AQI value or pollutant concentration stated in an
 * answer must match a number that appears in the retrieved data (or in the
 * curated reference knowledge). Anything else is treated as unsupported.
 */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function normaliseDigits(text: string): string {
  return text.replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)));
}

const UNIT = String.raw`(?:µg\/m³|μg\/m³|ug\/m3|µg\/m3|μg\/m3|mcg\/m3|mg\/m³|mg\/m3|ppb|ppm|माइक्रोग्राम)`;
const CONCENTRATION = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}`, "gi");
// "AQI 242", "AQI of 242", "AQI is 242+", "AQI: 242", "AQI लगभग 242" (up to 20 chars between, no digits).
const AQI_VALUE = /AQI[^0-9\n]{0,20}?(\d{1,3}(?:\.\d+)?)/gi;

/** All numeric figures in `text` that claim to be an AQI or a concentration. */
export function extractClaimedFigures(text: string): number[] {
  const normalised = normaliseDigits(text);
  const figures: number[] = [];
  for (const match of normalised.matchAll(CONCENTRATION)) figures.push(Number(match[1]));
  for (const match of normalised.matchAll(AQI_VALUE)) figures.push(Number(match[1]));
  return figures.filter((value) => Number.isFinite(value));
}

/** Every number found anywhere in the given values (objects, arrays, strings). */
export function collectNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) into.add(value);
  else if (typeof value === "string") {
    for (const match of normaliseDigits(value).matchAll(/\d+(?:\.\d+)?/g)) into.add(Number(match[0]));
  } else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, into));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectNumbers(item, into));
  return into;
}

function isSupported(figure: number, allowed: Set<number>): boolean {
  for (const value of allowed) {
    if (figure === value) return true;
    // Allow the rounding a person would naturally use when quoting a value.
    if (Math.round(value) === figure || Math.round(value * 10) / 10 === figure) return true;
  }
  return false;
}

/** Figures in `text` that do not match any allowed number. */
export function findUnsupportedFigures(text: string, allowed: Set<number>): number[] {
  return [...new Set(extractClaimedFigures(text).filter((figure) => !isSupported(figure, allowed)))];
}
