# Architecture

## Shape

Hawa AI is a **modular monolith**: one Next.js application deployed to Vercel, with Supabase as the data platform. Services can be split out later if load or team structure requires it.

```text
Browser (Next.js UI)
   │  HTTPS
   ▼
Next.js server (route handlers, server components)
   ├── AQI service ──────────► OpenAQ stations (primary), Open-Meteo model; Google deferred
   ├── AI orchestrator ──────► Gemini (tool calling, vision)
   ├── Location service ─────► Supabase / PostGIS
   ├── Vision service ───────► Gemini vision
   ├── Safety layer (deterministic validation)
   └── Alert service
   ▼
Supabase: Postgres · PostGIS · Auth · Storage · RLS
```

**Hard boundary:** the browser never calls Gemini or protected environmental APIs. Privileged calls run on the server, so keys stay protected and AI tool requests can be validated.

## Current state (foundation)

| Area | Status |
| --- | --- |
| App shell, navigation, routes | Built |
| Design tokens and UI primitives (`Button`, `Card`, `Badge`, `EmptyState`, `ErrorState`, `Skeleton`, `PageHeader`) | Built |
| Loading (`(app)/loading.tsx`), error (`(app)/error.tsx`) and not-found states | Built |
| CPCB AQI category scale and provenance labels | Built and unit-tested |
| Dashboard (`/dashboard`): station-led AQI, pollutants, sources, modelled estimate, 24 h trend, 4-day outlook, station map | Built; data cached for 5 min and refreshed by ingestion (`revalidateTag`) |
| Environment validation (`src/config/env.schema.ts`) | Built and unit-tested |
| `/api/health` | Built |
| Supabase schema, RLS, storage, Jaipur locations ([database.md](database.md)) | Applied; 53 pgTAP tests passing |
| Supabase clients (browser, server, admin) with generated types | Built |
| OpenAQ and Open-Meteo adapters, ingestion, CPCB AQI calculation, `/api/air-quality`, `/api/forecast` ([air-quality-data.md](air-quality-data.md)) | Built; ingestion not scheduled yet |
| Gemini | Air Guardian, Daily Brief, planner explanations and civic photo analysis (server-only; see the feature docs) |
| Maps, auth | Leaflet + OpenStreetMap (no Google Maps); auth set aside in a git stash |

## Rendering

`cacheComponents` and `partialPrefetching` are enabled. Product pages are currently fully static. As data arrives, data-dependent sections should be wrapped in `<Suspense>` with skeleton fallbacks so the shell stays instant. Use `"use cache"` with an explicit `cacheLife` for provider data, matched to provider refresh rates.

## Data provenance model

Every value shown carries: provider, AQI scale code (`ind_cpcb` or `uaqi`), observation time, fetch time and provenance (`measured`, `modelled` or `forecast`). See `src/features/air-quality/types/aqi.ts`. Observations and forecasts are stored in separate tables (next step).

## Next steps

1. **Security hardening:** add a Content-Security-Policy once the Maps and Supabase origins are known, plus rate limiting on API routes.
2. **Scheduling:** run `/api/cron/ingest` hourly after deployment.
3. **Authentication** (set aside in a git stash) to enable conversation persistence, Settings and signed-in report history. Civic reports work anonymously (see `docs/civic-reports.md`).
