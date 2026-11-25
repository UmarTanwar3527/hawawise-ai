# Database

Supabase Postgres 17 with PostGIS (in the `extensions` schema). Migrations live in `supabase/migrations/`, reference data in `supabase/seed.sql`, and security tests in `supabase/tests/database/`.

## Commands

All commands read `SUPABASE_DB_URL` from `.env.local` (Supabase → **Connect** → *Session pooler* connection string, including the database password). The value is never printed.

| Command | What it does |
| --- | --- |
| `npm run db:rehearse` | Applies every migration, the seed and the tests in **one transaction**, then rolls back. Use it before the first push to a database. |
| `npm run db:push` | Applies pending migrations and the seed. Records them in Supabase's migration history. |
| `npm run db:test` | Runs the pgTAP security and integrity tests. Transactional: leaves no data. |
| `npm run db:types` | Regenerates `src/lib/supabase/database.types.ts`. |

## Data model

```text
auth.users ─┬─ user_profiles (1:1)        ─ created by signup trigger
            ├─ user_preferences (1:1)     ─ created by signup trigger
            ├─ ai_conversations ── ai_messages ── ai_evidence ─┐
            ├─ civic_reports ── report_media ──► storage: report-media
            └─ user_alerts                                    │
                                                              │ (optional links)
data_sources ─┬─ provider_payloads (restricted)               │
              ├─ aqi_readings ────────┬─ aqi_index_values ◄───┤
locations ────┴─ pollution_forecasts ─┴─ pollutant_values ◄───┘
```

### Environmental data rules enforced by the schema

| Rule | How it is enforced |
| --- | --- |
| AQI scales are never mixed | AQI values live in `aqi_index_values`, one row per scale (`ind_cpcb`, `uaqi`), each tagged with its scale code. Unknown codes are rejected. |
| Observations and forecasts are separate | `aqi_readings` and `pollution_forecasts` are separate tables. Child values belong to exactly one of them. |
| Provenance is explicit | `aqi_readings.data_kind` (`measured`/`modelled`/`estimated`) is required and has no default. |
| Units are explicit | `pollutant_values.unit` is required (`ug_m3`, `mg_m3`, `ppb`, `ppm`). Values are stored as reported; there is no conversion at rest. |
| Freshness is recorded | `observed_at` and `fetched_at` are stored separately. An observation cannot be dated after its fetch. Forecasts carry `issued_at`. |
| Idempotent ingestion | Unique on (location, source, observed_at) for readings and (location, source, forecast_for, issued_at) for forecasts. |
| Coordinates cannot drift | `locations.geom` is generated from latitude/longitude. |
| Stations are traceable | `monitoring_station` locations must reference a data source and external id. |
| Raw payloads kept for audit | `provider_payloads` (7-day expiry set by ingestion), readable only by the service role. |
| Calculated vs reported AQI | `aqi_index_values.value_origin` (`provider_reported` / `hawa_calculated`) is required. Calculated values must name `calculation_method` and may store `calculation_details`. `is_lower_bound` marks values such as "401+". |
| Integration health | `provider_sync_logs` records each ingestion run (service role only). |

## Access control

RLS is enabled on every table. Grants start from zero for `anon` and `authenticated` and are re-granted per table, down to individual columns where users may write. The service role (server only) bypasses RLS.

| Table | anon | authenticated user |
| --- | --- | --- |
| data_sources, locations | read active rows | read active rows |
| aqi_readings, pollution_forecasts, aqi_index_values, pollutant_values | read | read |
| provider_payloads, provider_sync_logs | none | none |
| user_profiles | none | read and update own (name, avatar) |
| user_preferences | none | read and update own |
| ai_conversations | none | full CRUD on own (title only) |
| ai_messages | none | read own; insert own with role `user` only |
| ai_evidence | none | read own |
| civic_reports | none | read own; create; edit and delete own while `submitted`. Cannot set `user_id`, `status` or `ai_classification`. |
| report_media | none | read own; attach and remove on own `submitted` reports |
| user_alerts | none | read own; update `read_at` only |
| storage `report-media` (private, 5 MB, JPEG/PNG/WebP) | none | upload to `<own id>/<own submitted report id>/…`; read and delete own; no overwrite |

Written only by the server (service role): environmental data, raw payloads, assistant and system messages, evidence, alerts, report status and AI classifications.

## Adding a table

Supabase's default privileges grant new `public` tables to `anon` and `authenticated`. Every migration that adds a table must:

1. `alter table … enable row level security;`
2. `revoke all on … from anon, authenticated;`, then grant only the operations and columns needed.
3. Add policies that use `(select auth.uid())` (evaluated once per query).
4. Add tests to `supabase/tests/database/`.

## Seed data

`supabase/seed.sql` holds the data-source registry and Jaipur interface areas only. It contains **no measurements**. Area coordinates are approximate anchors from OpenStreetMap Nominatim (© OpenStreetMap contributors, ODbL), retrieved 2026-11-24. C-Scheme and Malviya Nagar have no area record in OSM, so landmark points are used and should be refined. These areas are not monitoring stations.

## Known follow-ups

- **Retention:** schedule deletion of expired `provider_payloads` (for example with `pg_cron`) and define a retention period for AI conversations.
- **Storage cleanup:** deleting a report removes its `report_media` rows but not the stored files. Add a cleanup job.
- **Moderation:** report review roles and workflow (status changes currently need the service role).
- **Later tables:** `provider_sync_logs`, `ai_tool_calls`, knowledge tables with embeddings, `audit_logs`.
