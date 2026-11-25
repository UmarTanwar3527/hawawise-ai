# Air-quality data

How Hawa AI gets, labels and calculates Jaipur air-quality data. Decisions and observations are dated so they can be revisited.

## Sources (decided 2026-11-25)

| Source | What it provides | Provenance label | Key / cost |
| --- | --- | --- | --- |
| **OpenAQ v3** (primary) | Hourly averages from CPCB/RSPCB continuous monitoring stations in Jaipur | `measured` | Free API key (`OPENAQ_API_KEY`) |
| **Open-Meteo Air Quality API** | Hourly model estimates per area, plus a 5-day forecast | `modelled` / `forecast` | No key. Free for non-commercial use; check its terms before any commercial use |
| Google Air Quality API | Deferred: needs a Google Cloud billing account | — | — |
| CPCB National AQI dashboard | Reference for manual validation only; no authorised API integration | — | — |

**Neither active source supplies an official CPCB AQI.** Hawa AI calculates a CPCB AQI from station data and labels it `hawa_calculated` (see below). It never calculates an AQI from modelled data.

## Pipeline

```text
/api/cron/ingest  (Bearer CRON_SECRET; the only place providers are called)
  ├─ OpenAQ: discover monitors within 25 km → upsert as monitoring_station locations
  │    for each active station: latest → choose live sensor per pollutant
  │    → last 26 h of hourly averages → aqi_readings (measured) + pollutant_values
  │    → CPCB AQI per hour where data allows → aqi_index_values (hawa_calculated)
  ├─ Open-Meteo: one request for all areas → past 24 h → aqi_readings (modelled)
  │    → future hours → pollution_forecasts (6-hour run blocks)
  ├─ raw responses → provider_payloads (7-day expiry)
  ├─ run health → provider_sync_logs
  └─ retention: forecasts older than 3 days, expired payloads

/api/air-quality?location=<slug>   nearest station (≤ 10 km) + the area's modelled estimate
/api/forecast?location=<slug>&hours=<1–120>   latest stored forecast run
```

Visitor requests read only from Supabase (cached at the CDN for 5–10 minutes), so traffic can never exhaust provider quotas. Ingestion is idempotent: rerunning updates the same rows.

A run takes about 20 seconds and makes about 43 OpenAQ requests (OpenAQ's limit is 60 per minute) plus 1 Open-Meteo request.

### Running ingestion

```bash
npm run build && npm start   # or npm run dev
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest
```

**Scheduling is not set up yet.** After deployment, call the endpoint hourly. Options: a GitHub Actions scheduled workflow, Supabase `pg_cron` with `pg_net`, or Vercel Cron (check the cron frequency your Vercel plan allows).

## CPCB AQI calculation

`src/features/air-quality/cpcb-aqi-calculator.ts`, following the CPCB National Air Quality Index (2014):

- **Averaging:** 24 h for PM10, PM2.5, NO₂, SO₂ and NH₃; 8 h for CO and O₃.
- **Sub-index:** linear interpolation within the CPCB breakpoint band. AQI = highest sub-index; the dominant pollutant is recorded.
- **Minimum data:** at least 3 pollutants, including PM2.5 or PM10.

Hawa AI implementation choices (review these against CPCB guidance):

| Choice | Rationale |
| --- | --- |
| 24 h average needs ≥ 16 hourly values; 8 h needs ≥ 6 | Avoids averages built from a few hours. |
| Averages are rounded to breakpoint precision (whole numbers; CO 0.1) before banding | Values such as 30.5 fall unambiguously into one band. |
| 8 h average = the 8 hours ending at the reporting hour | Our reading of "8-hourly". CPCB's bulletin may use a different 8-hour aggregation; to be verified. |
| ppb/ppm values are excluded, not converted | Conversion needs temperature and pressure assumptions. CO in µg/m³ is converted exactly to mg/m³. |
| Severe band reported as **401+** (`is_lower_bound`) | CPCB publishes no upper concentration for Severe, so no value is extrapolated. |
| Hourly averages accepted at ≥ 50% sample coverage | See the observations below. Coverage is stored with every value. |

Every calculated value stores its sub-indices, averages, hours used and excluded pollutants (with reasons) in `aqi_index_values.calculation_details`, so the UI can explain it.

## Data-quality observations (2026-11-25)

1. **Station data lag:** Jaipur station hours reached OpenAQ about 2.5 h after the hour ended. Measurements older than 4 h are flagged stale.
2. **Sample coverage:** about 30% of station hours have 2 of 4 fifteen-minute samples. None had less. Hours at ≥ 50% coverage are accepted.
3. **Duplicate sensors:** most stations list two sensors per pollutant (a retired id and a current one). The live sensor is chosen from the `latest` endpoint.
4. **⚠️ Suspect units:** newer sensor ids report CO, NO₂ and SO₂ with unit **ppb**. Their values (for example CO ≈ 1.2–2.9) look like the mg/m³ and µg/m³ that CPCB normally publishes, not ppb. Values are stored **as reported** and excluded from the AQI calculation. Before using them, compare against the CPCB dashboard for the same station and hour, then either confirm the unit or report it to OpenAQ.
5. **Model vs stations:** for the same hour, Open-Meteo estimated PM2.5 at about 23–25 µg/m³ across Jaipur, while stations measured about 78–122 µg/m³ (roughly 3–5× higher). The modelled values must never be presented as the area's air quality. They are suitable at most for relative trends and must stay labelled "modelled".
6. **Model resolution:** Open-Meteo snapped the 9 Jaipur areas to 4 grid cells (about 0.1°). Most neighbourhoods share one estimate, so the UI must not imply neighbourhood-level differences from model data.

## Limits and follow-ups

- Verify the 8-hour aggregation and the ppb unit anomaly against CPCB.
- Schedule hourly ingestion after deployment, and alert on `provider_sync_logs` failures.
- Per-IP rate limiting of the public API is not implemented (CDN caching only). Add it with a shared store if abuse appears.
- Google Air Quality can be added later as another `ModelledGridProvider` without changing the read API.
