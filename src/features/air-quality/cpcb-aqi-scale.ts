import type { CpcbAqiCategoryId } from "./types/aqi";

/**
 * India National AQI (CPCB) category bands, 0–500.
 * Source: CPCB National Air Quality Index (2014), including the
 * "associated health impacts" statements. General information, not medical advice.
 *
 * Bands are inclusive integer ranges. A fractional value above a band's upper
 * bound (e.g. 50.4) falls into the next band; values are never rounded here,
 * so callers must pass the provider value unchanged.
 *
 * Only use this scale for values whose scale code is `ind_cpcb`.
 */
export type CpcbAqiCategory = {
  id: CpcbAqiCategoryId;
  label: string;
  min: number;
  max: number;
  /** Solid fill for scale bars and markers (non-text). */
  swatchClass: string;
  /** Same colour as an SVG fill. */
  fillClass: string;
  /** Accessible text/background pair for category chips. */
  chipClass: string;
  /** CPCB "associated health impacts" statement for the category. */
  healthImpact: string;
};

export const CPCB_AQI_MAX = 500;

const SEVERE: CpcbAqiCategory = {
  id: "severe",
  label: "Severe",
  min: 401,
  max: CPCB_AQI_MAX,
  swatchClass: "bg-red-900",
  fillClass: "fill-red-900",
  chipClass: "bg-red-900 text-white border-red-900",
  healthImpact: "Affects healthy people and seriously impacts those with existing diseases",
};

export const CPCB_AQI_CATEGORIES: readonly CpcbAqiCategory[] = [
  {
    id: "good",
    label: "Good",
    min: 0,
    max: 50,
    swatchClass: "bg-healthy",
    fillClass: "fill-healthy",
    chipClass: "bg-green-100 text-green-800 border-green-200",
    healthImpact: "Minimal impact",
  },
  {
    id: "satisfactory",
    label: "Satisfactory",
    min: 51,
    max: 100,
    swatchClass: "bg-lime-500",
    fillClass: "fill-lime-500",
    chipClass: "bg-lime-100 text-lime-800 border-lime-200",
    healthImpact: "Minor breathing discomfort to sensitive people",
  },
  {
    id: "moderate",
    label: "Moderate",
    min: 101,
    max: 200,
    swatchClass: "bg-moderate",
    fillClass: "fill-moderate",
    chipClass: "bg-yellow-100 text-yellow-800 border-yellow-200",
    healthImpact: "Breathing discomfort to the people with lungs, asthma and heart diseases",
  },
  {
    id: "poor",
    label: "Poor",
    min: 201,
    max: 300,
    swatchClass: "bg-poor",
    fillClass: "fill-poor",
    chipClass: "bg-orange-100 text-orange-800 border-orange-200",
    healthImpact: "Breathing discomfort to most people on prolonged exposure",
  },
  {
    id: "very_poor",
    label: "Very poor",
    min: 301,
    max: 400,
    swatchClass: "bg-severe",
    fillClass: "fill-severe",
    chipClass: "bg-red-100 text-red-800 border-red-200",
    healthImpact: "Respiratory illness on prolonged exposure",
  },
  SEVERE,
];

/**
 * Returns the CPCB category for an `ind_cpcb` AQI value, or `null` when the
 * value is not a valid AQI (negative, NaN, infinite). Values above 500 remain
 * "Severe" because the CPCB scale is capped at 500.
 */
export function getCpcbAqiCategory(aqi: number): CpcbAqiCategory | null {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  return CPCB_AQI_CATEGORIES.find((category) => aqi <= category.max) ?? SEVERE;
}
