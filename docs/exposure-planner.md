# Exposure planner (Day 3)

The planner compares start times for an outdoor activity using the stored air-quality forecast. **The ranking is calculated in code.** Gemini can explain the result on request, but it cannot change the result.

## Flow

```text
/planner?location&activity&duration&day&from&to&sensitive   (GET form; every plan is a shareable URL)
  validate (Zod, safe defaults) ─► area must be a known slug (else not-found)
  cached Open-Meteo forecast (48 h) + cached current area reading
  planExposure()  ── deterministic, pure, unit-tested
  page: comparison, part-of-day summary, hourly chart + table, current measured AQI, caveats

"Explain" button ─► POST /api/planner/explain {choices + language}   (no numbers from the browser)
  server recalculates the plan ─► one Gemini call (submit_explanation)
  grounding check (numeric data fields only) + language check ─► one correction, else "ungrounded"
```

## Ranking rules (`src/features/exposure-planner/services/plan.ts`)

1. **Forecast used:** the hourly Open-Meteo PM2.5 and PM10 forecast in µg/m³. Values in any other unit count as missing.
2. **Hours:** each hourly value is treated as representative of the hour starting at its timestamp. A D-minute activity uses `ceil(D / 60)` consecutive hourly values.
3. **Start times:**
   - Candidates are the forecast hours, which fall at :30 IST because the model hours are on the hour in UTC.
   - A start must be in the future.
   - It must be at or after the earliest start, and the activity must finish by the chosen finish time.
4. **Missing values:** a window with any missing PM2.5 value is **not ranked**, and the page shows how many were skipped.
5. **Order:** windows are ranked by mean PM2.5, then peak PM2.5, then mean PM10, then the earlier start.
6. **Meaningful difference:**
   - Rule: two windows differ meaningfully only when their means differ by **both** at least 5 µg/m³ **and** at least 15% (`MEANINGFUL_DIFFERENCE`).
   - This is a product heuristic to avoid over-reading a modelled forecast. It is not a health threshold.
   - Otherwise a window is "similar". When the best and worst windows in the range are similar, the page says timing makes little difference.
7. **Statuses:** the planner returns `no_forecast`, `range_too_short`, `no_windows` or `insufficient_data` rather than guessing.

## What is deliberately not done

- **No AQI per window.** CPCB AQI uses 24-hour (and 8-hour) averages from measurements. Calculating it from hourly model values would not be the CPCB method.
- **No absolute "safe" levels.** The model reads 3–5× lower than Jaipur stations (see `docs/air-quality-data.md`), so values are for comparing times only. The current measured station AQI is shown separately for context, with its CPCB health statement.
- **No dose model.** Duration and activity are the same for every window in a plan, so they don't change the order. Activity type and the sensitive-group option only change the guidance text.

## AI explanation

- **Prompt:** `prompts/planner-explain.v1.ts` (`planner-explain/v1`). Bump the version for any edit after deployment.
- **What the model sees:**
  - The calculated comparison: lowest and highest windows, similar start times, and the lowest window per part of the day.
  - The forecast caveat.
  - The latest measured AQI, labelled as calculated by Hawa AI.
- **Grounding:** every AQI or concentration in the text must match a numeric field of that data. Digits in times or station names don't count.
- **Language:** the reply must be in the requested language (Hindi in Devanagari, or English). A wrong-language reply gets one correction.
- **Wording:** the model must say "comparatively preferable" and must never say "safe" or "best".
- **Limits:**
  - 6 requests per minute and 40 per day per IP, plus 600 per day per instance (in memory).
  - Bodies are capped at 2 KB.
  - Identical requests over the same data are served from a 30-minute in-memory cache to save Gemini quota.
- **Measured locally on 2026-11-25** (gemini-3.5-flash-lite, live data): the English explanation took 2.3 s and the Hindi one 9.2 s. Both used only figures from the data.

## Tests

- **Unit tests** (`tests/unit/exposure-planner.test.ts`) cover:
  - Ranking, range limits and multi-hour averaging.
  - Missing values and units.
  - The similarity threshold, past hours and statuses.
  - IST parts of the day and request defaults.
  - The explanation's grounding, correction and language enforcement, with Gemini mocked.
- **End-to-end tests** (`tests/e2e/planner.spec.ts`) cover:
  - Rendering on three viewports.
  - The shareable URL and defaults for edited values.
  - The not-found page for unknown areas.
  - A mocked Hindi explanation and API validation.

## Limitations and next steps

- **One area per plan.** Comparing areas would need a forecast for each area, which is stored already, plus UI work.
- **Planning horizon:** today and tomorrow only, though the stored forecast covers about 4 days.
- **Not yet in Air Guardian:** the Guardian can't call the planner. A `plan_outdoor_activity` tool would reuse `planExposure` directly.
