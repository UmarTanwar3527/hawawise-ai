-- Hawa AI · 003 · Row Level Security and grants
--
-- Model:
--   * Environmental reference data is publicly readable and never publicly writable.
--   * Private user data is visible only to its owner.
--   * Server-produced data (assistant messages, evidence, alerts, AI
--     classifications, report status) is written only by the service role,
--     which bypasses RLS. Users can never forge it.
--   * Grants are least-privilege and column-scoped where users may write.
--     RLS policies decide which rows; grants decide which operations and columns.

------------------------------------------------------------------------------
-- Enable RLS everywhere
------------------------------------------------------------------------------

alter table public.user_profiles      enable row level security;
alter table public.user_preferences   enable row level security;
alter table public.data_sources       enable row level security;
alter table public.locations          enable row level security;
alter table public.provider_payloads  enable row level security;
alter table public.aqi_readings       enable row level security;
alter table public.pollution_forecasts enable row level security;
alter table public.aqi_index_values   enable row level security;
alter table public.pollutant_values   enable row level security;
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.ai_evidence        enable row level security;
alter table public.civic_reports      enable row level security;
alter table public.report_media       enable row level security;
alter table public.user_alerts        enable row level security;

------------------------------------------------------------------------------
-- Start from zero for client roles, then grant only what is needed
------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

------------------------------------------------------------------------------
-- Public environmental data: read-only for everyone
------------------------------------------------------------------------------

grant select on
  public.data_sources,
  public.locations,
  public.aqi_readings,
  public.pollution_forecasts,
  public.aqi_index_values,
  public.pollutant_values
to anon, authenticated;

create policy "Active data sources are public"
  on public.data_sources for select to anon, authenticated
  using (is_active);

create policy "Active locations are public"
  on public.locations for select to anon, authenticated
  using (is_active);

create policy "Readings are public"
  on public.aqi_readings for select to anon, authenticated
  using (true);

create policy "Forecasts are public"
  on public.pollution_forecasts for select to anon, authenticated
  using (true);

create policy "AQI values are public"
  on public.aqi_index_values for select to anon, authenticated
  using (true);

create policy "Pollutant values are public"
  on public.pollutant_values for select to anon, authenticated
  using (true);

-- provider_payloads: no grants and no policies. Service role only.

------------------------------------------------------------------------------
-- Profiles and preferences (rows are created by the signup trigger)
------------------------------------------------------------------------------

grant select on public.user_profiles to authenticated;
grant update (full_name, avatar_url) on public.user_profiles to authenticated;

create policy "Users read their own profile"
  on public.user_profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users update their own profile"
  on public.user_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.user_preferences to authenticated;
grant update (language, preferred_activities, notifications_enabled)
  on public.user_preferences to authenticated;

create policy "Users read their own preferences"
  on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users update their own preferences"
  on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- AI conversations
------------------------------------------------------------------------------

grant select, delete on public.ai_conversations to authenticated;
grant insert (title), update (title) on public.ai_conversations to authenticated;

create policy "Users read their own conversations"
  on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users create their own conversations"
  on public.ai_conversations for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users rename their own conversations"
  on public.ai_conversations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users delete their own conversations"
  on public.ai_conversations for delete to authenticated
  using (user_id = (select auth.uid()));

-- Users may only add their own 'user' messages. Assistant and system
-- messages are written by the server with the service role.
grant select on public.ai_messages to authenticated;
grant insert (conversation_id, role, content) on public.ai_messages to authenticated;

create policy "Users read messages in their conversations"
  on public.ai_messages for select to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users add their own messages"
  on public.ai_messages for insert to authenticated
  with check (
    role = 'user'
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

grant select on public.ai_evidence to authenticated;

create policy "Users read evidence for their messages"
  on public.ai_evidence for select to authenticated
  using (
    exists (
      select 1
      from public.ai_messages m
      join public.ai_conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = (select auth.uid())
    )
  );

------------------------------------------------------------------------------
-- Civic reports: private to their author
------------------------------------------------------------------------------

-- Users cannot set user_id (defaults to auth.uid()), status or ai_classification.
grant select, delete on public.civic_reports to authenticated;
grant insert (location_id, category, description, latitude, longitude)
  on public.civic_reports to authenticated;
grant update (location_id, category, description, latitude, longitude)
  on public.civic_reports to authenticated;

create policy "Users read their own reports"
  on public.civic_reports for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users submit their own reports"
  on public.civic_reports for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users edit their own reports until review starts"
  on public.civic_reports for update to authenticated
  using (user_id = (select auth.uid()) and status = 'submitted')
  with check (user_id = (select auth.uid()) and status = 'submitted');

create policy "Users delete their own reports until review starts"
  on public.civic_reports for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'submitted');

grant select, delete on public.report_media to authenticated;
grant insert (report_id, storage_path, mime_type, size_bytes)
  on public.report_media to authenticated;

create policy "Users read their own report media"
  on public.report_media for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users attach media to their own open reports"
  on public.report_media for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.civic_reports r
      where r.id = report_id
        and r.user_id = (select auth.uid())
        and r.status = 'submitted'
    )
  );

create policy "Users remove media from their own open reports"
  on public.report_media for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.civic_reports r
      where r.id = report_id
        and r.user_id = (select auth.uid())
        and r.status = 'submitted'
    )
  );

------------------------------------------------------------------------------
-- Alerts: created by the server; users can only mark them read
------------------------------------------------------------------------------

grant select on public.user_alerts to authenticated;
grant update (read_at) on public.user_alerts to authenticated;

create policy "Users read their own alerts"
  on public.user_alerts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users mark their own alerts read"
  on public.user_alerts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
