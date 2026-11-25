-- Hawa AI · 011 · Hourly ingestion and daily-brief schedule inside Supabase
--
-- GitHub Actions schedules are best-effort and did not fire reliably, so the
-- database schedules the two cron endpoints itself:
--   :20  GET <base>/api/cron/ingest   (OpenAQ + Open-Meteo ingestion)
--   :30  GET <base>/api/cron/brief    (AI daily brief, only if data changed)
--
-- No secrets are stored in this migration. The base URL and the cron secret
-- live in Supabase Vault (names: hawa_base_url, hawa_cron_secret) and are set
-- out of band with `npm run db:schedule -- <https base url>`. Until both exist
-- the job does nothing except log a warning.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.trigger_hawa_job(path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret text;
  request_id bigint;
begin
  -- Only the two scheduled endpoints can ever be called.
  if path not in ('/api/cron/ingest', '/api/cron/brief') then
    raise exception 'Unsupported job path: %', path using errcode = '22023';
  end if;

  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'hawa_base_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'hawa_cron_secret';
  if base_url is null or secret is null then
    raise warning 'Hawa scheduled job skipped: Vault secrets hawa_base_url and hawa_cron_secret are not set';
    return null;
  end if;
  if base_url !~ '^https://[a-z0-9.-]+$' then
    raise warning 'Hawa scheduled job skipped: hawa_base_url must be an https origin without a path';
    return null;
  end if;

  select net.http_get(
    url := base_url || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function private.trigger_hawa_job(text) from public, anon, authenticated;

-- Re-runnable: replace any earlier jobs with the same names.
select cron.unschedule(jobid) from cron.job where jobname in ('hawa-ingest', 'hawa-brief');
select cron.schedule('hawa-ingest', '20 * * * *', $job$select private.trigger_hawa_job('/api/cron/ingest')$job$);
select cron.schedule('hawa-brief', '30 * * * *', $job$select private.trigger_hawa_job('/api/cron/brief')$job$);
