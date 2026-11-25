/**
 * Civic report configuration. Pure values only, safe for client components.
 * Categories match the civic_reports.category CHECK constraint.
 */

export const REPORT_CATEGORIES = {
  construction_dust: { label: "Construction dust", hindi: "निर्माण की धूल" },
  waste_burning: { label: "Garbage or waste burning", hindi: "कचरा जलाना" },
  smoke: { label: "Smoke (source unclear)", hindi: "धुआँ" },
  industrial_emissions: { label: "Industrial emissions", hindi: "औद्योगिक उत्सर्जन" },
  road_dust: { label: "Road dust", hindi: "सड़क की धूल" },
  vehicle_emissions: { label: "Vehicle exhaust", hindi: "वाहन का धुआँ" },
  other: { label: "Other", hindi: "अन्य" },
} as const;

export type ReportCategory = keyof typeof REPORT_CATEGORIES;
export const REPORT_CATEGORY_IDS = Object.keys(REPORT_CATEGORIES) as ReportCategory[];

/** The AI may also say nothing is visible. */
export const AI_CATEGORY_IDS = [...REPORT_CATEGORY_IDS, "none_visible"] as const;
export type AiCategory = (typeof AI_CATEGORY_IDS)[number];

export function categoryLabel(id: string): string {
  if (id === "none_visible") return "No pollution source visible";
  return REPORT_CATEGORIES[id as ReportCategory]?.label ?? "Other";
}

export const VISIBLE_SEVERITY = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  unclear: "Unclear",
} as const;
export type VisibleSeverity = keyof typeof VISIBLE_SEVERITY;

export const VERIFICATION_LABELS: Record<string, string> = {
  unverified: "Unverified community report",
  verified: "Verified",
  dismissed: "Dismissed",
};

/** Jaipur-area bounds accepted for reports (matches the database constraint). */
export const JAIPUR_BOUNDS = { south: 26.6, north: 27.2, west: 75.5, east: 76.1 } as const;

export function isInJaipurArea(latitude: number, longitude: number): boolean {
  return (
    latitude >= JAIPUR_BOUNDS.south &&
    latitude <= JAIPUR_BOUNDS.north &&
    longitude >= JAIPUR_BOUNDS.west &&
    longitude <= JAIPUR_BOUNDS.east
  );
}

/** Stored and published coordinates are rounded to 3 decimals (about 110 m). */
export const roundCoordinate = (value: number) => Math.round(value * 1000) / 1000;

export const REPORT_LIMITS = {
  /** After browser re-encoding a photo is typically 150–600 KB. */
  maxImageBytes: 3 * 1024 * 1024,
  /** Longest edge after browser re-encoding. */
  maxImageEdge: 1600,
  maxDescription: 500,
  /** How long an analysis token stays valid. */
  tokenTtlMinutes: 30,
} as const;
