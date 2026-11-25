/**
 * Exposure planner configuration. Pure values only, safe for client components.
 */

export const ACTIVITIES = {
  walking: { label: "Walking", hindi: "पैदल चलना", intensity: "light" },
  running: { label: "Running", hindi: "दौड़ना", intensity: "vigorous" },
  cycling: { label: "Cycling", hindi: "साइकिल चलाना", intensity: "vigorous" },
  workout: { label: "Outdoor workout", hindi: "बाहर व्यायाम", intensity: "vigorous" },
} as const;

export type ActivityId = keyof typeof ACTIVITIES;
export const ACTIVITY_IDS = Object.keys(ACTIVITIES) as ActivityId[];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;

/** Parts of the day, in IST minutes since midnight. Night wraps past midnight. */
export const PERIODS = [
  { id: "morning", label: "Morning", fromMinute: 5 * 60, toMinute: 11 * 60 },
  { id: "midday", label: "Midday", fromMinute: 11 * 60, toMinute: 16 * 60 },
  { id: "evening", label: "Evening", fromMinute: 16 * 60, toMinute: 20 * 60 },
  { id: "night", label: "Night", fromMinute: 20 * 60, toMinute: 5 * 60 },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

/**
 * Two windows are treated as meaningfully different only when their mean
 * forecast PM2.5 differs by at least this much in absolute AND relative terms.
 * A product heuristic, not a health threshold: it stops the planner from
 * over-reading small differences in a modelled forecast.
 */
export const MEANINGFUL_DIFFERENCE = { absoluteUgM3: 5, relative: 0.15 } as const;

/** Forecast hours fetched for planning (covers the rest of today and all of tomorrow). */
export const PLANNER_FORECAST_HOURS = 48;
