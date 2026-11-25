# Hawa AI

Evidence-grounded urban air-quality intelligence, piloting in **Jaipur, Rajasthan**.

> **Status: Day 1, steps 1–2.** App shell, routes, design system and tests are in place. The Supabase database is live: schema, Row Level Security, private storage and Jaipur reference locations, verified by 53 pgTAP security tests. Air-quality providers and the AI assistant are **not connected yet**. Pages show labelled placeholders and never sample data.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Zod · Vitest · Playwright. Planned: Supabase (Postgres, PostGIS, Auth, Storage), Gemini API, Google Maps Platform, Google Air Quality API, OpenAQ. Deployment target: Vercel.

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
| `/dashboard` | Air dashboard | Layout with "not connected" panels |
| `/map` | Pollution map | Placeholder |
| `/guardian` | Air Guardian (AI) | Placeholder |
| `/planner` | Exposure planner | Placeholder |
| `/reports`, `/reports/new` | Civic reports | Placeholder |
| `/insights` | City insights | Placeholder |
| `/settings` | Settings | Placeholder |
| `/api/health` | Liveness check | Built |
| `/api/air-quality`, `/api/forecast`, `/api/ai/chat`, `/api/reports` | Reserved | Return `501 not_implemented` |

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

See [docs/architecture.md](docs/architecture.md) and [docs/database.md](docs/database.md) for the design and [AGENTS.md](AGENTS.md) for the engineering rules all contributors and AI agents follow.

## Environment variables

See [.env.example](.env.example). Only `NEXT_PUBLIC_*` values reach the browser. Server secrets are read through `getServerEnv()` in `src/config/env.ts`, which cannot be imported into client code.

## Deployment (Vercel)

1. Import the GitHub repository in Vercel.
2. Add the environment variables from `.env.example` for each environment. Set `NEXT_PUBLIC_APP_URL` to the deployment URL.
3. Use `/api/health` for uptime monitoring.

## Disclaimer

Hawa AI provides general air-quality information and is not medical advice. Community reports are not official complaints to any authority.
