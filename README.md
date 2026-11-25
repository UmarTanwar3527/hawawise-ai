# Hawa AI

Evidence-grounded urban air-quality intelligence, piloting in **Jaipur, Rajasthan**.

> **Status: Day 2.** Real Jaipur air-quality data (OpenAQ stations, Open-Meteo model) with a Hawa AI-calculated CPCB AQI; dashboard, interactive pollution map, **Air Guardian** (Gemini tool calling, grounded answers with evidence, English and Hindi) and an **AI Daily Air Brief**. No sign-in yet; Settings, Civic reports, Planner and Insights are placeholders.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Zod · Vitest · Playwright. Data: Supabase (Postgres, PostGIS, Storage), OpenAQ, Open-Meteo. Planned: Supabase Auth, Gemini API, Google Maps Platform. Deployment target: Vercel.

## Getting started

Requirements: Node.js ≥ 20.9 (developed on Node 24) and npm.

```bash
npm install
cp .env.example .env.local      # every key is optional during the foundation phase
npm run dev                     # http://localhost:3000
```

For end-to-end tests, install the Playwright browser once:

```bash
npx playwright install chromium
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Create and serve a production build |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm run lint` | Run ESLint (Next.js core-web-vitals and TypeScript rules) |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:live` | Live checks against OpenAQ and Open-Meteo for Jaipur (uses `.env.local`) |
| `npm run test:e2e` | Run E2E tests on desktop, tablet and mobile viewports (Playwright, production build on port 3100) |
| `npm run check` | Typecheck, lint and unit tests |
| `npm run db:rehearse` | Dry-run all migrations, seed and DB tests in one transaction, then roll back |
| `npm run db:push` | Apply migrations and seed to Supabase (`SUPABASE_DB_URL` in `.env.local`) |
| `npm run db:test` | Run pgTAP security tests (rolled back; leaves no data) |
| `npm run db:types` | Regenerate Supabase TypeScript types |

## Routes

| Route | Module | State |
| --- | --- | --- |
| `/` | Landing page | Built |
| `/dashboard?location=<slug>` | Air dashboard | Built on stored provider data |
| `/map` | Pollution map (stations, areas, model layer; OpenStreetMap) | Built |
| `/guardian` | Air Guardian (AI, grounded, English and Hindi) | Built; needs `GEMINI_API_KEY` |
| `/planner` | Exposure planner | Placeholder |
| `/reports`, `/reports/new` | Civic reports | Placeholder |
| `/insights` | City insights | Placeholder |
| `/settings` | Settings | Placeholder |
| `/api/health` | Liveness check | Built |
| `/api/air-quality?location=<slug>` | Latest measured and modelled data for an area | Built |
| `/api/forecast?location=<slug>&hours=<n>` | Hourly modelled forecast | Built |
| `/api/cron/ingest` | Provider ingestion (Bearer `CRON_SECRET`) | Built; not scheduled yet |
| `/api/ai/chat` | Air Guardian API (rate-limited) | Built |
| `/api/cron/brief` | Daily Air Brief generation (Bearer `CRON_SECRET`) | Built; run by the hourly workflow |
| `/api/reports` | Reserved | Returns `501 not_implemented` |

## Project structure

```text
src/
  app/            routes: (marketing) landing, (app) product shell, api/
  components/     ui/ primitives · layout/ shell and navigation · feature-area folders
  features/       feature-owned logic (air-quality, ai-guardian, exposure-planner, civic-reports, city-insights)
  lib/            infrastructure clients and helpers (supabase, gemini, maps, http, utils, …)
  services/       provider adapters, normalisation, caching, location
  config/         site config, navigation, validated environment
supabase/         migrations, seed data and pgTAP database tests (see docs/database.md)
tests/            unit/ · integration/ · e2e/
docs/             architecture and development log
```

See [docs/architecture.md](docs/architecture.md), [docs/database.md](docs/database.md) and [docs/air-quality-data.md](docs/air-quality-data.md) and [docs/ai-guardian.md](docs/ai-guardian.md) for the design and [AGENTS.md](AGENTS.md) for the engineering rules all contributors and AI agents follow.

## Environment variables

See [.env.example](.env.example). Only `NEXT_PUBLIC_*` values reach the browser. Server secrets are read through `getServerEnv()` in `src/config/env.ts`, which cannot be imported into client code.

## Deployment (Vercel)

1. Import the GitHub repository in Vercel.
2. Add the environment variables from `.env.example` for each environment. Set `NEXT_PUBLIC_APP_URL` to the deployment URL.
3. Use `/api/health` for uptime monitoring.

## Disclaimer

Hawa AI provides general air-quality information and is not medical advice. Community reports are not official complaints to any authority.
