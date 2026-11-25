-- Hawa AI · 010 · Allow clearing submitter hashes after 48 hours
--
-- Migration 009 required submitter_hash on every anonymous report through a
-- CHECK constraint, which would block the retention job from clearing it.
-- The hash is now required only when an anonymous report is inserted
-- (enforced by the quota trigger), and the location rule stays a constraint.

alter table public.civic_reports drop constraint civic_reports_anonymous_requirements;
alter table public.civic_reports add constraint civic_reports_anonymous_requirements check (
  submission_channel <> 'anonymous'
  or (latitude between 26.6 and 27.2 and longitude between 75.5 and 76.1)
);

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
      if new.submitter_hash is null then
        raise exception 'Anonymous reports need a submitter hash'
          using errcode = '23514';
      end if;
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
