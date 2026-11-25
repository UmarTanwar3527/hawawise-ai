# Architecture

## Shape

Hawa AI is a **modular monolith**: one Next.js application deployed to Vercel, with Supabase as the data platform. Services can be split out later if load or team structure requires it.

```text
Browser (Next.js UI)
   │  HTTPS
   ▼
Next.js server (route handlers, server components)
   ├── AQI service ──────────► Google Air Quality API (primary), OpenAQ (secondary)
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
| Environment validation (`src/config/env.schema.ts`) | Built and unit-tested |
| `/api/health` | Built |
| Supabase schema, RLS, storage, Jaipur locations ([database.md](database.md)) | Applied; 53 pgTAP tests passing |
| Supabase clients (browser, server, admin) with generated types | Built |
| Provider adapters, Gemini, Maps | Not started; endpoints return `501` |

## Rendering

`cacheComponents` and `partialPrefetching` are enabled. Product pages are currently fully static. As data arrives, data-dependent sections should be wrapped in `<Suspense>` with skeleton fallbacks so the shell stays instant. Use `"use cache"` with an explicit `cacheLife` for provider data, matched to provider refresh rates.

## Data provenance model

Every value shown carries: provider, AQI scale code (`ind_cpcb` or `uaqi`), observation time, fetch time and provenance (`measured`, `modelled` or `forecast`). See `src/features/air-quality/types/aqi.ts`. Observations and forecasts are stored in separate tables (next step).

## Next steps

1. **Provider integration:** Google Air Quality adapter (`ind_cpcb`) and OpenAQ adapter behind `services/providers/provider.interface.ts`, with timeouts, retries, caching and stale-data handling. Verify the live Jaipur response first.
2. **Dashboard:** replace the "not connected" panels with real data, keeping explicit unavailable states.
3. **Security hardening:** add a Content-Security-Policy once the Maps and Supabase origins are known, plus rate limiting on API routes.
