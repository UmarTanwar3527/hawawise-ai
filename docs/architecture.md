# Architecture

## Shape

Hawa AI is a **modular monolith**: one Next.js application deployed to Vercel, with Supabase as the data platform. Services can be split out later if load or team structure requires it.

```text
Browser (Next.js UI)
   │  HTTPS
   ▼
Next.js server (route handlers, server components)
   ├── Air-quality services ──► stored OpenAQ station data (measured) and Open-Meteo data (modelled, forecast)
   ├── Air Guardian ──────────► Gemini function calling over allowlisted data tools
   ├── Explanations ──────────► Gemini (planner, insights, daily brief), grounding-checked
   ├── Photo reporter ────────► Gemini vision; private Supabase Storage
   └── Ingestion (/api/cron/*) ► OpenAQ, Open-Meteo (scheduled, never per visitor)
   ▼
Supabase: Postgres · PostGIS · Storage · RLS · pg_cron (hourly jobs) · Vault (job secret)
```

**Hard boundary:** the browser never calls Gemini or protected environmental APIs. Privileged calls run on the server, so keys stay protected and AI tool requests can be validated.

## Current state

| Area | Status |
| --- | --- |
| App shell, navigation, landing page, guided demo (`/demo`) with live readiness checks | Built |
| Design tokens, UI primitives, loading, error and not-found states | Built |
| Supabase schema, RLS, storage, Jaipur locations ([database.md](database.md)) | Applied; 99 pgTAP security and integrity tests passing |
| OpenAQ and Open-Meteo ingestion, CPCB AQI calculation ([air-quality-data.md](air-quality-data.md)) | Built; scheduled hourly inside Supabase (`pg_cron` + `pg_net`), manual GitHub Actions workflow as backup |
| Dashboard, pollution map (Leaflet + OpenStreetMap) | Built |
| Air Guardian and AI daily brief ([ai-guardian.md](ai-guardian.md)) | Built |
| Exposure planner ([exposure-planner.md](exposure-planner.md)) | Built |
| AI photo reporter, anonymous civic reports ([civic-reports.md](civic-reports.md)) | Built |
| City insights ([city-insights.md](city-insights.md)) | Built |
| Health advisor ([health-advisor.md](health-advisor.md)) | Built |
| Tests | 147 unit (Vitest, Gemini mocked), 141 end-to-end on 3 viewports (Playwright), 99 database (pgTAP) |
| Accounts | Deferred: not needed for the pilot. Settings is a labelled placeholder outside the navigation |

## Rendering

`cacheComponents` and `partialPrefetching` are enabled. Page shells are prerendered; data-dependent sections render inside `<Suspense>` with skeleton fallbacks. Stored data is read through `"use cache"` functions with explicit `cacheLife` and the `air-quality` / `civic-reports` tags, which ingestion and report submission revalidate. Freshness and staleness are computed per request.

## Data provenance model

Every value shown carries: provider, AQI scale code (`ind_cpcb` or `uaqi`), observation time, fetch time and provenance (`measured`, `modelled` or `forecast`). See `src/features/air-quality/types/aqi.ts`. Observations and forecasts are stored in separate tables.

## Next steps

1. **Accounts** to save conversations and report history, and a moderation tool for community reports.
2. **Security:** a Content-Security-Policy, and a shared store for AI rate limits (today they are per server instance; the database enforces report limits).
3. **Alerts** when conditions change, and further cities with enough verified stations.
