-- Hawa AI · 006 · Transparency for calculated AQI values
--
-- Stores the inputs behind a Hawa AI-calculated AQI (sub-indices, averages,
-- hours used, excluded pollutants and why), so the UI can explain how the
-- number was reached. Must be null for provider-reported values.

alter table public.aqi_index_values
  add column calculation_details jsonb,
  add constraint aqi_index_values_details_only_when_calculated check (
    calculation_details is null or value_origin = 'hawa_calculated'
  );
