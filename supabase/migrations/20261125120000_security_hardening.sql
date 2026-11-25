-- Hawa AI · 007 · Security hardening (Day 1 engineering audit)
--
-- 1. Future objects in `public` are no longer granted to anon/authenticated
--    by default; each migration must grant explicitly.
-- 2. Per-user abuse limits on direct Data API writes (reports, media,
--    conversations, messages, report images).
-- 3. Storage: delete only while the report is open; exact path depth.
-- 4. Profile avatar URLs must be https.

------------------------------------------------------------------------------
-- 1. Default privileges
------------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, public;

------------------------------------------------------------------------------
-- 2. Abuse limits (apply only to signed-in users; the service role has no auth.uid())
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
    return new; -- server-side writes (service role) are not throttled here
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

create trigger enforce_user_quota before insert on public.civic_reports
  for each row execute function private.enforce_user_quota();
create trigger enforce_user_quota before insert on public.ai_conversations
  for each row execute function private.enforce_user_quota();
create trigger enforce_user_quota before insert on public.ai_messages
  for each row execute function private.enforce_user_quota();
create trigger enforce_user_quota before insert on public.report_media
  for each row execute function private.enforce_user_quota();

------------------------------------------------------------------------------
-- 3. Storage policies: exact path depth, at most 5 images per report,
--    and no deletion once a report is under review.
------------------------------------------------------------------------------

-- Counting images inside a storage.objects policy would re-enter the same
-- policy (infinite recursion), so the count runs in a narrow definer function.
create or replace function private.report_image_count(report_folder text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from storage.objects
  where bucket_id = 'report-media' and (storage.foldername(name))[2] = report_folder;
$$;

-- Functions are executable by PUBLIC by default; lock the schema down and
-- expose only this helper to signed-in users.
revoke execute on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.report_image_count(text) to authenticated;

drop policy "Report media: owners upload to their open reports" on storage.objects;
drop policy "Report media: owners delete their files" on storage.objects;

create policy "Report media: owners upload to their open reports"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-media'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.civic_reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid())
        and r.status = 'submitted'
    )
    and private.report_image_count((storage.foldername(name))[2]) < 5
  );

create policy "Report media: owners delete files of open reports"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.civic_reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid())
        and r.status = 'submitted'
    )
  );

------------------------------------------------------------------------------
-- 4. Avatar URLs: https only (also sanitised at signup)
------------------------------------------------------------------------------

update public.user_profiles set avatar_url = null where avatar_url !~ '^https://';
alter table public.user_profiles
  add constraint user_profiles_avatar_https check (avatar_url is null or avatar_url ~ '^https://');

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  avatar text := left(new.raw_user_meta_data ->> 'avatar_url', 2048);
begin
  insert into public.user_profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(new.raw_user_meta_data ->> 'full_name', 120),
    case when avatar ~ '^https://' then avatar else null end
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;
