# Hawa AI — engineering rules for AI coding agents

These rules apply to every agent (Claude Code, Antigravity/Gemini, Copilot, Cursor) and every human contributor.

**Principle: data first, AI second, actionable intelligence third.** If the environmental data is unreliable, the product is unreliable.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Stack

Next.js 16 (App Router, `cacheComponents` and `partialPrefetching` enabled) · React 19 · TypeScript strict · Tailwind CSS 4 · Zod 4 · Vitest · Playwright · Supabase (Postgres, PostGIS, Auth, Storage, RLS) · Gemini API · Google Maps Platform · Vercel.

Next.js 16 notes that commonly trip agents:

- `error.tsx` receives `{ error: unknown, retry }` (not `reset`).
- With Cache Components, `GET` route handlers are prerendered unless they read request data. Call `await connection()` (from `next/server`) for request-time handlers.
- Components that read runtime data (`cookies()`, `headers()`, uncached fetches) need a `<Suspense>` boundary or `"use cache"`.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| E2E (desktop, tablet, mobile) | `npm run test:e2e` |
| All static checks | `npm run check` |
| DB dry run / apply / test / types | `npm run db:rehearse` / `db:push` / `db:test` / `db:types` |

Run `npm run check` before reporting work as done, and `npm run test:e2e` for UI changes. Report the actual output. Never claim tests passed unless they were run.

## Architecture

- **Modular monolith.** Feature logic lives in `src/features/<feature>/` (components, services, schemas, types). Each feature owns its business logic, validation and types.
- **`src/components/ui`** holds presentational primitives only, with no provider-specific or AI-specific logic.
- **`src/components/layout`** holds the application frame (shell, navigation, placeholders).
- **`src/services/providers`** holds external data adapters behind a common provider interface. **`src/services/normalisation`** maps provider payloads to internal models.
- **`src/lib`** holds infrastructure clients (Supabase, Gemini, Maps) and cross-cutting helpers.
- **`src/config`** holds static configuration and validated environment access.
- **The browser never calls Gemini, Air Quality, OpenAQ or any privileged API directly.** All privileged calls go through `src/app/api/*` or server code.

## Environmental data rules (non-negotiable)

1. Never fabricate AQI values, pollutant concentrations, stations, forecasts or sources. This includes "demo" data in the UI.
2. Every value carries its **AQI scale code** (`ind_cpcb`, `uaqi`, …), **provider**, **observation time**, **fetch time** and **provenance** (`measured` / `modelled` / `forecast`).
3. Never silently substitute Universal AQI (`uaqi`) for India CPCB AQI (`ind_cpcb`). Use the CPCB category helpers only for `ind_cpcb` values.
4. Modelled grid estimates are never presented as station measurements. Forecasts are never presented as observations.
5. Missing pollutants are shown as unavailable and are never estimated. When a provider fails, render an explicit unavailable state (`EmptyState` or `ErrorState`).
6. Jaipur neighbourhoods in the UI are interface areas, not monitoring stations, unless a verified station is linked.
7. Sources: OpenAQ stations (measured) are primary. Open-Meteo is modelled and forecast only, never used to calculate an AQI. A CPCB AQI calculated by Hawa AI must be labelled as calculated (`value_origin = 'hawa_calculated'`). See `docs/air-quality-data.md`.
8. Providers are called only from the ingestion job (`/api/cron/ingest`), never per visitor request.

## AI rules

- One orchestrator (`src/features/ai-guardian/agents/orchestrator.ts`) with allowlisted tools that call the existing service layer, not several independent agents. See `docs/ai-guardian.md`.
- Evidence, tool activity and staleness warnings are built server-side from actual tool results, never written by the model. Every AQI or concentration figure in a model answer must pass the grounding check.
- AI output is generated on the server only. Briefs are generated on a schedule, never on page load. Standard tests mock Gemini; never make live AI calls in `npm test`.
- The model requests tools; our server validates the arguments and executes the tools. Never execute arbitrary model-generated requests.
- No medical diagnosis, and no claim that an activity is completely safe based on AQI alone.
- Civic reports are community submissions, not official complaints.

## Security

- Secrets stay server-side. Read them only through `getServerEnv()` (`src/config/env.ts`, guarded by `server-only`). Only `NEXT_PUBLIC_*` values reach the browser.
- Never commit `.env.local` or any real key. Keep `.env.example` in sync when adding variables.
- Validate every external input (request bodies, query parameters, provider payloads, model tool arguments) with Zod.
- Keep RLS enabled on every exposed table. Never disable it for convenience or write unrestricted policies.
- API errors use `jsonError` and `notImplemented` (`src/lib/http/api-response.ts`) and never leak stack traces, secrets or raw upstream payloads.

## Database

- Every schema change is a new file in `supabase/migrations/`. Never edit an applied migration.
- New tables: enable RLS, revoke from `anon`/`authenticated`, grant only the columns needed, and add pgTAP tests. See `docs/database.md`.
- Environmental values are written only by server code using the admin client (`src/lib/supabase/admin.ts`). User-facing queries use the RLS-bound clients.

## UI conventions

- Use the design tokens in `src/app/globals.css` (`bg-canvas`, `text-ink`, `bg-primary`, `bg-navy`, AQI status colours). Do not hard-code hex values in components.
- `cn()` does not merge conflicting Tailwind classes. Control a component's `display` on a wrapper element rather than overriding it through `className`.
- Every page needs one `h1` (use `PageHeader`) and must work at 360 px width without horizontal scroll.
- Placeholders must be labelled "Development placeholder" and must not show sample values.
- Keep text contrast at WCAG 2.1 AA or better, keep focus states visible, and use semantic landmarks.

## Dependencies

Do not add a library when a few lines of code will do. Justify every new dependency in the pull request description.
