-- Hawa AI · 009 · Anonymous civic reports with AI photo analysis
--
-- Visitors can report visible pollution without an account. Anonymous reports
-- are written only by server code (service role) after validation, photo
-- metadata stripping and AI analysis; the Data API cannot create them.
--
-- Public (anon) readers see only: category, AI label, AI confidence, visible
-- severity, approximate location (rounded by the server to ~110 m), status
-- and time. Descriptions, photos, AI observations and the submitter hash stay
-- private.
--
-- Abuse limits for anonymous reports are enforced here, so they hold across
-- serverless instances: 3 per hour and 10 per day per submitter, 300 per day
-- in total.

------------------------------------------------------------------------------
-- 1. civic_reports: anonymous channel, AI fields, verification status
------------------------------------------------------------------------------

alter table public.civic_reports alter column user_id drop not null;

alter table public.civic_reports drop constraint civic_reports_category_check;
alter table public.civic_reports add constraint civic_reports_category_check check (category in (
  'waste_burning', 'construction_dust', 'vehicle_emissions',
  'industrial_emissions', 'road_dust', 'smoke', 'other'
));

alter table public.civic_reports
  add column submission_channel text not null default 'account'
    check (submission_channel in ('account', 'anonymous')),
  add column verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'dismissed')),
  add column ai_category text check (ai_category in (
    'waste_burning', 'construction_dust', 'vehicle_emissions',
    'industrial_emissions', 'road_dust', 'smoke', 'other', 'none_visible'
  )),
  add column ai_confidence real check (ai_confidence between 0 and 1),
  add column ai_visible_severity text check (ai_visible_severity in ('low', 'moderate', 'high', 'unclear')),
  add column ai_model text check (char_length(ai_model) <= 100),
  add column ai_prompt_version text check (char_length(ai_prompt_version) <= 100),
  -- HMAC of the client address, used only for abuse limits; cleared after 48 hours.
  add column submitter_hash text check (char_length(submitter_hash) between 16 and 128);

alter table public.civic_reports add constraint civic_reports_channel_matches_user check (
  (submission_channel = 'anonymous') = (user_id is null)
);

-- Anonymous reports must carry a Jaipur-area location and a submitter hash.
alter table public.civic_reports add constraint civic_reports_anonymous_requirements check (
  submission_channel <> 'anonymous'
  or (
    latitude between 26.6 and 27.2
    and longitude between 75.5 and 76.1
    and submitter_hash is not null
  )
);

create index civic_reports_submitter_idx on public.civic_reports (submitter_hash, created_at desc)
  where submitter_hash is not null;
create index civic_reports_public_idx on public.civic_reports (created_at desc)
  where status <> 'rejected' and verification_status <> 'dismissed';

------------------------------------------------------------------------------
-- 2. report_media: anonymous storage folder and image hash (duplicate check)
------------------------------------------------------------------------------

alter table public.report_media alter column user_id drop not null;

alter table public.report_media drop constraint report_media_path_matches_owner;
alter table public.report_media add constraint report_media_path_matches_owner check (
  split_part(storage_path, '/', 1) = coalesce(user_id::text, 'anonymous')
  and split_part(storage_path, '/', 2) = report_id::text
  and split_part(storage_path, '/', 3) <> ''
  and split_part(storage_path, '/', 4) = ''
);

alter table public.report_media
  add column sha256 text check (sha256 ~ '^[0-9a-f]{64}$');
create index report_media_sha256_idx on public.report_media (sha256) where sha256 is not null;

------------------------------------------------------------------------------
-- 3. Public read of published reports (selected columns only)
------------------------------------------------------------------------------

grant select (
  id, category, latitude, longitude, status, verification_status,
  ai_category, ai_confidence, ai_visible_severity, created_at
) on public.civic_reports to anon;

create policy "Public reads published community reports"
  on public.civic_reports for select to anon
  using (status <> 'rejected' and verification_status <> 'dismissed' and latitude is not null);

------------------------------------------------------------------------------
-- 4. Abuse limits: signed-in users (unchanged) and anonymous server writes
------------------------------------------------------------------------------

create or replace function private.enforce_user_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  recent integer;
  quota integer;
begin
  if uid is null then
    -- Server-side writes. Anonymous civic reports are throttled per submitter
    -- and in total; other service-role writes are not throttled here.
    -- Nested checks: `new` has no submission_channel field on other tables.
    if tg_table_name <> 'civic_reports' then
      return new;
    end if;
    if new.submission_channel = 'anonymous' then
      select count(*) into recent from public.civic_reports
        where submitter_hash = new.submitter_hash and created_at > now() - interval '1 hour';
      if recent >= 3 then
        raise exception 'Quota exceeded for anonymous reports (hourly)'
          using errcode = 'P0429', hint = 'Try again later.';
      end if;
      select count(*) into recent from public.civic_reports
        where submitter_hash = new.submitter_hash and created_at > now() - interval '24 hours';
      if recent >= 10 then
        raise exception 'Quota exceeded for anonymous reports (daily)'
          using errcode = 'P0429', hint = 'Try again later.';
      end if;
      select count(*) into recent from public.civic_reports
        where submission_channel = 'anonymous' and created_at > now() - interval '24 hours';
      if recent >= 300 then
        raise exception 'Quota exceeded for anonymous reports (global)'
          using errcode = 'P0429', hint = 'Try again later.';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'civic_reports' then
    quota := 20;
    select count(*) into recent from public.civic_reports
      where user_id = uid and created_at > now() - interval '24 hours';
  elsif tg_table_name = 'ai_conversations' then
    quota := 50;
    select count(*) into recent from public.ai_conversations
      where user_id = uid and created_at > now() - interval '24 hours';
  elsif tg_table_name = 'ai_messages' then
    quota := 200;
    select count(*) into recent
      from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
      where c.user_id = uid and m.role = 'user' and m.created_at > now() - interval '24 hours';
  elsif tg_table_name = 'report_media' then
    quota := 5;
    select count(*) into recent from public.report_media where report_id = new.report_id;
  else
    return new;
  end if;

  if recent >= quota then
    raise exception 'Quota exceeded for %', tg_table_name
      using errcode = 'P0429', hint = 'Try again later.';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_user_quota() from public, anon, authenticated;
