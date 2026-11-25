-- Hawa AI · 001 · Extensions and shared helpers
--
-- PostGIS lives in the dedicated `extensions` schema, as Supabase recommends.
-- gen_random_uuid() is built into Postgres 13+, so pgcrypto is not required.

create extension if not exists postgis with schema extensions;

-- Internal helpers live in `private`, which is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Keeps updated_at accurate on every UPDATE.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
