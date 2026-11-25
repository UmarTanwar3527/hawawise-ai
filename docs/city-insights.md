# City insights (Day 5)

`/insights` turns stored station measurements into city-level analysis. **Every statistic and ranking is calculated in code** (`src/features/city-insights/services/compute.ts`, pure and unit-tested). Gemini can interpret the results on request but cannot change any figure.

## What is shown

| Insight | Method |
| --- | --- |
| Highest and lowest station now | Latest calculated CPCB AQI per station. Only stations with a value from the last 4 hours are ranked, and at least 2 are needed. |
| City PM2.5 and PM10 by day | Each station's daily mean (IST day, at least 18 of 24 hourly values), then the mean across stations. The last 7 **complete** days are used, so today is excluded. |
| Day-over-day and 7-day change | The latest complete day against the previous day, and against the period mean, in percent. |
| Daily rhythm | Mean PM2.5 for each hour of day (IST, using the hour's start, because OpenAQ stamps hour-ending values) across all stations and days. An hour needs at least 10 values to be shown. |
| Station comparison | 7-day means of PM2.5, PM10 and calculated AQI (each needs at least half the period's hours), the highest AQI, coverage and the latest value. |
| Hours in each AQI category | Station-hours by calculated CPCB category. |
| Data coverage | Station-hours with any value as a share of expected hours (stations × 7 × 24). |
| Forecast direction | Daily mean modelled PM2.5 (Open-Meteo, city centre) for full forecast days (at least 20 hours). Only the relative change is described, because the model reads lower than stations. |
| Community reports | Published reports from the last 30 days by category. They are unverified. |

Only µg/m³ values are used for particulate matter. Missing values are shown as unavailable and are never filled in.

## AI interpretation

`POST /api/insights/explain {language: "en" | "hi"}` recalculates the insights on the server, builds a labelled facts object (`buildInsightsFacts`) and makes one Gemini call through the shared `generateGroundedExplanation` helper. The exposure planner uses the same helper.

- **Grounding:** every AQI or concentration figure must match a numeric field of the facts.
- **Language:** the reply must be in the requested language, with one correction allowed. Otherwise the result is `ungrounded`, and the page says so.
- **Prompt** (`prompts/insights-explain.v1.ts`, `insights-explain/v1`):
  - It must say "calculated AQI" and give the forecast's direction only.
  - It may mention general factors (calmer night air in winter, traffic, dust) only as possible contributors.
  - It must not diagnose anything or call anything "safe".
- **Limits:** 4 requests per minute and 30 per day per IP, plus 400 per day per instance. Identical facts are cached in memory for 30 minutes.
- **Measured locally on 2026-11-25** with live data: English and Hindi each took about 2.5 s and were grounded. The model misspelled "Mansarovar" in Hindi.

## History backfill

Ingestion normally fetches the last 30 hours. To give the insights a full week straight away, `GET /api/cron/ingest?backfillHours=192` (Bearer `CRON_SECRET`) fetches up to 8 days of hourly station data from OpenAQ. It uses the same validation and CPCB calculation, and the writes are idempotent upserts. The parameter accepts whole numbers from 31 to 192.

It was run once on 2026-11-25:
- **Volume:** about 185 hours per station, and 145–165 calculated AQI values per station.
- **Coverage:** 98% of station-hours for 18–24 Nov.

From then on, the hourly run keeps history growing. Station history is not pruned.

## Tests

- **Unit tests** (`tests/unit/city-insights.test.ts`) cover:
  - Choosing complete days and daily means with the 18-hour rule.
  - Ranking, and stale stations being excluded.
  - Daily-rhythm buckets.
  - Empty history.
  - Forecast direction from full days only, and report counts.
  - Interpretation grounding, with Gemini mocked.
- **End-to-end tests** (`tests/e2e/insights.spec.ts`) cover:
  - The page on three viewports, data tables and the method section.
  - A mocked interpretation and its failure state.
  - API validation.

## Limitations

- **Station means are point measurements.** They don't describe whole neighbourhoods.
- **The AQI is calculated by Hawa AI** (CPCB method), not an official CPCB bulletin.
- **Fixed period:** 7 days, with no date picker.
- **One forecast point:** the city centre only.
- **Ties:** stations with equal mean PM2.5 keep their original order.
