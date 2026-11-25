-- Hawa AI · 002 · Core schema
--
-- Data-integrity rules (see docs/database.md):
--   * AQI values always carry their scale code; scales are never mixed.
--   * Observations (aqi_readings) and forecasts (pollution_forecasts) are separate.
--   * data_kind has no default: it must be set from provider metadata.
--   * Pollutant values always carry their unit (providers report different units).
--   * Observation time and fetch time are stored separately.

------------------------------------------------------------------------------
-- Users
------------------------------------------------------------------------------

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  avatar_url text check (char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'hi')),
  preferred_activities text[] not null default '{}'
    check (cardinality(preferred_activities) <= 20),
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Providers and places
------------------------------------------------------------------------------

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9_]+$'),
  source_type text not null
    check (source_type in ('modelled_grid', 'station_network', 'official_reference')),
  display_name text not null,
  -- Attribution text exactly as the provider's terms require; null until verified.
  attribution text,
  website_url text check (website_url ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_type)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  city text not null default 'Jaipur',
  state text not null default 'Rajasthan',
  country_code char(2) not null default 'IN',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  -- Derived from latitude/longitude so the two can never disagree.
  geom extensions.geography(point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  location_type text not null
    check (location_type in ('city_centre', 'neighbourhood', 'landmark', 'monitoring_station')),
  -- Where the coordinates came from (e.g. a geocoder result or a provider station record).
  coordinate_source text not null,
  -- Monitoring stations must reference the provider record they come from.
  source_id uuid references public.data_sources (id),
  external_ref text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_station_has_source check (
    location_type <> 'monitoring_station'
    or (source_id is not null and external_ref is not null)
  ),
  constraint locations_external_ref_unique unique (source_id, external_ref)
);

create index locations_geom_idx on public.locations using gist (geom);

------------------------------------------------------------------------------
-- Environmental data
------------------------------------------------------------------------------

-- Raw provider responses, kept for debugging, audit and provider migration.
-- Restricted: readable by the service role only. Never store API keys here.
create table public.provider_payloads (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources (id),
  endpoint text not null,
  request_params jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index provider_payloads_expires_idx on public.provider_payloads (expires_at);
create index provider_payloads_source_idx on public.provider_payloads (source_id, fetched_at desc);

-- One observation event: a location, a provider and the time the data applies to.
create table public.aqi_readings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  source_id uuid not null references public.data_sources (id),
  payload_id uuid references public.provider_payloads (id) on delete set null,
  -- No default: must be set explicitly from provider metadata.
  data_kind text not null check (data_kind in ('measured', 'modelled', 'estimated')),
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- An observation cannot apply to a time after it was fetched (5 min clock-skew allowance).
  constraint aqi_readings_not_future check (observed_at <= fetched_at + interval '5 minutes'),
  -- Idempotency: re-ingesting the same observation must not duplicate it.
  constraint aqi_readings_unique_observation unique (location_id, source_id, observed_at)
);

create index aqi_readings_location_time_idx
  on public.aqi_readings (location_id, observed_at desc);
create index aqi_readings_source_idx on public.aqi_readings (source_id);
create index aqi_readings_payload_idx on public.aqi_readings (payload_id);

-- One forecast point: the conditions a provider predicts for `forecast_for`.
create table public.pollution_forecasts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  source_id uuid not null references public.data_sources (id),
  payload_id uuid references public.provider_payloads (id) on delete set null,
  forecast_for timestamptz not null,
  -- When this forecast run was issued or retrieved; separates successive runs.
  issued_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pollution_forecasts_unique_point
    unique (location_id, source_id, forecast_for, issued_at)
);

create index forecasts_location_time_idx
  on public.pollution_forecasts (location_id, forecast_for);
create index forecasts_source_idx on public.pollution_forecasts (source_id);
create index forecasts_payload_idx on public.pollution_forecasts (payload_id);

-- AQI values. A single provider response may include several scales
-- (e.g. ind_cpcb and uaqi), so each is stored separately with its scale code.
-- Each row belongs to exactly one reading or one forecast.
create table public.aqi_index_values (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid references public.aqi_readings (id) on delete cascade,
  forecast_id uuid references public.pollution_forecasts (id) on delete cascade,
  aqi_scale text not null check (aqi_scale in ('ind_cpcb', 'uaqi')),
  aqi_value numeric not null check (aqi_value >= 0),
  aqi_category text,
  dominant_pollutant text,
  constraint aqi_index_values_one_parent check (num_nonnulls(reading_id, forecast_id) = 1)
);

create unique index aqi_index_values_reading_scale_idx
  on public.aqi_index_values (reading_id, aqi_scale) where reading_id is not null;
create unique index aqi_index_values_forecast_scale_idx
  on public.aqi_index_values (forecast_id, aqi_scale) where forecast_id is not null;

-- Pollutant concentrations with explicit units. Values are stored as the
-- provider reports them; no unit conversion is applied at rest.
create table public.pollutant_values (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid references public.aqi_readings (id) on delete cascade,
  forecast_id uuid references public.pollution_forecasts (id) on delete cascade,
  pollutant text not null
    check (pollutant in ('pm25', 'pm10', 'no2', 'so2', 'co', 'o3', 'nh3', 'no', 'nox')),
  value numeric not null check (value >= 0),
  unit text not null check (unit in ('ug_m3', 'mg_m3', 'ppb', 'ppm')),
  -- Averaging period as stated by the provider, e.g. '1h' or '24h'; null if not stated.
  averaging_period text,
  constraint pollutant_values_one_parent check (num_nonnulls(reading_id, forecast_id) = 1)
);

create unique index pollutant_values_reading_idx
  on public.pollutant_values (reading_id, pollutant) where reading_id is not null;
create unique index pollutant_values_forecast_idx
  on public.pollutant_values (forecast_id, pollutant) where forecast_id is not null;

------------------------------------------------------------------------------
-- AI assistant
------------------------------------------------------------------------------

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 20000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_evidence (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.ai_messages (id) on delete cascade,
  source_name text not null,
  source_url text check (source_url ~ '^https?://'),
  excerpt text check (char_length(excerpt) <= 4000),
  -- Links to the environmental data an answer relied on, when applicable.
  reading_id uuid references public.aqi_readings (id) on delete set null,
  forecast_id uuid references public.pollution_forecasts (id) on delete set null,
  accessed_at timestamptz not null default now()
);

create index ai_evidence_message_idx on public.ai_evidence (message_id);

------------------------------------------------------------------------------
-- Civic reports (community submissions, not official complaints)
------------------------------------------------------------------------------

create table public.civic_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  category text not null check (category in (
    'waste_burning', 'construction_dust', 'vehicle_emissions',
    'industrial_emissions', 'road_dust', 'other'
  )),
  description text check (char_length(description) <= 2000),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  ai_classification jsonb,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_reports_coordinates_pair check ((latitude is null) = (longitude is null))
);

create index civic_reports_user_idx on public.civic_reports (user_id, created_at desc);
create index civic_reports_location_idx on public.civic_reports (location_id);

-- Storage path convention: <user_id>/<report_id>/<file name>
create table public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.civic_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  classification jsonb,
  created_at timestamptz not null default now(),
  constraint report_media_path_matches_owner check (
    split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) = report_id::text
    and split_part(storage_path, '/', 3) <> ''
    and split_part(storage_path, '/', 4) = ''
  )
);

create index report_media_report_idx on public.report_media (report_id);
create index report_media_user_idx on public.report_media (user_id);

------------------------------------------------------------------------------
-- Alerts
------------------------------------------------------------------------------

create table public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null
    check (type in ('aqi_threshold', 'forecast_warning', 'report_status', 'system')),
  message text not null check (char_length(message) between 1 and 1000),
  location_id uuid references public.locations (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index user_alerts_user_idx on public.user_alerts (user_id, created_at desc);
create index user_alerts_location_idx on public.user_alerts (location_id);

------------------------------------------------------------------------------
-- updated_at triggers
------------------------------------------------------------------------------

create trigger set_updated_at before update on public.user_profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.data_sources
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.locations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.ai_conversations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.civic_reports
  for each row execute function private.set_updated_at();

------------------------------------------------------------------------------
-- New users get a profile and default preferences
------------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(new.raw_user_meta_data ->> 'full_name', 120),
    left(new.raw_user_meta_data ->> 'avatar_url', 2048)
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
