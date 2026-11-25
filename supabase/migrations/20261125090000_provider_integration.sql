-- Hawa AI · 005 · Provider integration (OpenAQ stations + Open-Meteo model)
--
-- Decisions (2026-11-25):
--   * Primary source: OpenAQ station measurements (CPCB/RSPCB monitors).
--   * Modelled estimates and forecasts: Open-Meteo Air Quality API.
--   * Google Air Quality API is deferred (no billing account yet).
--   * Neither source provides an official CPCB AQI number, so Hawa AI may
--     calculate one from station data. A calculated value must always be
--     distinguishable from a provider-reported one.

------------------------------------------------------------------------------
-- AQI values: record where each number came from
------------------------------------------------------------------------------

-- The table is empty at this point, so NOT NULL without a default is safe and
-- forces every writer to state the origin explicitly.
alter table public.aqi_index_values
  add column value_origin text not null
    check (value_origin in ('provider_reported', 'hawa_calculated')),
  add column calculation_method text,
  -- True when the value is a floor (e.g. "401+" in the CPCB Severe band).
  add column is_lower_bound boolean not null default false,
  add constraint aqi_index_values_method_matches_origin check (
    (value_origin = 'hawa_calculated') = (calculation_method is not null)
  );

-- Replace partial unique indexes with constraints that ON CONFLICT can target
-- (needed for idempotent upserts through the Data API).
drop index public.aqi_index_values_reading_scale_idx;
drop index public.aqi_index_values_forecast_scale_idx;
alter table public.aqi_index_values
  add constraint aqi_index_values_parent_scale_key
    unique nulls not distinct (reading_id, forecast_id, aqi_scale);
create index aqi_index_values_forecast_idx on public.aqi_index_values (forecast_id);

drop index public.pollutant_values_reading_idx;
drop index public.pollutant_values_forecast_idx;
alter table public.pollutant_values
  add constraint pollutant_values_parent_pollutant_key
    unique nulls not distinct (reading_id, forecast_id, pollutant),
  -- Share of expected sub-hourly samples present in the average (provider-reported).
  add column coverage_percent numeric check (coverage_percent between 0 and 100);
create index pollutant_values_forecast_idx on public.pollutant_values (forecast_id);

------------------------------------------------------------------------------
-- Locations: provider metadata for monitoring stations
------------------------------------------------------------------------------

-- Non-sensitive provider facts (network, operator). Publicly readable.
alter table public.locations
  add column metadata jsonb not null default '{}'::jsonb;

------------------------------------------------------------------------------
-- Data sources
------------------------------------------------------------------------------

insert into public.data_sources (provider, source_type, display_name, website_url, is_active)
values ('open_meteo', 'modelled_grid', 'Open-Meteo Air Quality API', 'https://open-meteo.com', true)
on conflict (provider, source_type) do update set
  display_name = excluded.display_name,
  website_url = excluded.website_url,
  is_active = excluded.is_active;

update public.data_sources
set is_active = false
where provider = 'google_air_quality';

------------------------------------------------------------------------------
-- Provider sync log (integration health). Service role only.
------------------------------------------------------------------------------

create table public.provider_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  records_written integer not null default 0 check (records_written >= 0),
  -- Sanitised summary only: never raw responses, URLs with keys or stack traces.
  details jsonb not null default '{}'::jsonb
);

create index provider_sync_logs_source_idx
  on public.provider_sync_logs (source_id, started_at desc);

alter table public.provider_sync_logs enable row level security;
revoke all on public.provider_sync_logs from anon, authenticated;
