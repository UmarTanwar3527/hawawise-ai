-- Hawa AI · database security and integrity tests (pgTAP)
--
-- Runs inside a transaction and rolls back: no fixtures persist.
-- Run with: npm run db:test
--
-- Identities are simulated the way PostgREST does it: switch to the `anon`
-- or `authenticated` role and set the JWT claims that auth.uid() reads.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select * from no_plan();

------------------------------------------------------------------------------
-- Fixtures (as the migration owner)
------------------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'rls-user-a@hawa.test', 'authenticated', 'authenticated', '{"full_name": "User A"}'),
  ('22222222-2222-4222-8222-222222222222', 'rls-user-b@hawa.test', 'authenticated', 'authenticated', '{"avatar_url": "javascript:alert(1)"}');

insert into data_sources (id, provider, source_type, display_name)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'rls_test_provider', 'modelled_grid', 'RLS test provider');

insert into locations (id, slug, name, latitude, longitude, location_type, coordinate_source)
values ('aaaaaaaa-0000-4000-8000-000000000002', 'rls-test-area', 'RLS test area', 26.9, 75.8, 'neighbourhood', 'test fixture');

insert into locations (slug, name, latitude, longitude, location_type, coordinate_source, is_active)
values ('rls-inactive-area', 'Inactive area', 26.8, 75.7, 'neighbourhood', 'test fixture', false);

insert into provider_payloads (id, source_id, endpoint, payload)
values ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'test', '{}');

-- Test fixture only; rolled back at the end of this file.
insert into aqi_readings (id, location_id, source_id, payload_id, data_kind, observed_at)
values ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002',
        'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003',
        'modelled', '2026-01-01 10:00:00+00');

insert into aqi_index_values (reading_id, aqi_scale, aqi_value, value_origin)
values ('aaaaaaaa-0000-4000-8000-000000000004', 'ind_cpcb', 1, 'provider_reported');

-- User A's private data
insert into civic_reports (id, user_id, category, description)
values ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'waste_burning', 'A report');

insert into ai_conversations (id, user_id, title)
values ('aaaaaaaa-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'A chat');

insert into ai_messages (id, conversation_id, role, content)
values ('aaaaaaaa-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000006', 'assistant', 'Server-written answer');

insert into ai_evidence (message_id, source_name)
values ('aaaaaaaa-0000-4000-8000-000000000007', 'test source');

insert into user_alerts (id, user_id, type, message)
values ('aaaaaaaa-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'system', 'Hello A');

insert into report_media (report_id, user_id, storage_path, mime_type, size_bytes)
values ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005/photo.jpg',
        'image/jpeg', 100);

insert into storage.objects (bucket_id, name)
values ('report-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005/photo.jpg');

-- Anonymous reports (written by the server; no auth.uid()).
insert into civic_reports (id, user_id, submission_channel, category, description, latitude, longitude,
                           submitter_hash, ai_category, ai_confidence, ai_visible_severity)
values ('aaaaaaaa-0000-4000-8000-000000000009', null, 'anonymous', 'smoke', 'Private anonymous description',
        26.912, 75.787, 'fixture-hash-published', 'smoke', 0.8, 'moderate');
insert into civic_reports (id, user_id, submission_channel, category, latitude, longitude, submitter_hash, verification_status)
values ('aaaaaaaa-0000-4000-8000-00000000000a', null, 'anonymous', 'other', 26.9, 75.8, 'fixture-hash-dismissed', 'dismissed');
insert into report_media (report_id, user_id, storage_path, mime_type, size_bytes, sha256)
values ('aaaaaaaa-0000-4000-8000-000000000009', null,
        'anonymous/aaaaaaaa-0000-4000-8000-000000000009/photo.jpg', 'image/jpeg', 100, repeat('a', 64));

------------------------------------------------------------------------------
-- Schema and integrity
------------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS is enabled on every public table'
);

select ok(
  (select extensions.st_dwithin(
     geom,
     extensions.st_setsrid(extensions.st_makepoint(75.8, 26.9), 4326)::extensions.geography,
     1)
   from locations where slug = 'rls-test-area'),
  'geom is derived from latitude/longitude in the correct (lon, lat) order'
);

select is(
  (select full_name from user_profiles where id = '11111111-1111-4111-8111-111111111111'),
  'User A',
  'signup trigger creates a profile from user metadata'
);

select is(
  (select language from user_preferences where user_id = '22222222-2222-4222-8222-222222222222'),
  'en',
  'signup trigger creates default preferences'
);

select throws_ok(
  $$insert into aqi_readings (location_id, source_id, observed_at)
    values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', now() - interval '2 hours')$$,
  '23502', null,
  'data_kind must be set explicitly (no default)'
);

select throws_ok(
  $$insert into aqi_readings (location_id, source_id, data_kind, observed_at)
    values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'modelled', '2026-01-01 10:00:00+00')$$,
  '23505', null,
  'the same observation cannot be ingested twice'
);

select throws_ok(
  $$insert into aqi_readings (location_id, source_id, data_kind, observed_at)
    values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'modelled', now() + interval '1 day')$$,
  '23514', null,
  'an observation cannot be dated after it was fetched'
);

select throws_ok(
  $$insert into aqi_index_values (reading_id, aqi_scale, aqi_value, value_origin)
    values ('aaaaaaaa-0000-4000-8000-000000000004', 'us_epa', 10, 'provider_reported')$$,
  '23514', null,
  'unknown AQI scale codes are rejected'
);

select throws_ok(
  $$insert into aqi_index_values (reading_id, aqi_scale, aqi_value, value_origin)
    values ('aaaaaaaa-0000-4000-8000-000000000004', 'ind_cpcb', 2, 'provider_reported')$$,
  '23505', null,
  'a reading holds at most one value per AQI scale'
);

select throws_ok(
  $$insert into pollutant_values (reading_id, pollutant, value)
    values ('aaaaaaaa-0000-4000-8000-000000000004', 'pm25', 1)$$,
  '23502', null,
  'pollutant values require a unit'
);

select throws_ok(
  $$insert into pollutant_values (pollutant, value, unit) values ('pm25', 1, 'ug_m3')$$,
  '23514', null,
  'pollutant values must belong to exactly one reading or forecast'
);

select throws_ok(
  $$insert into report_media (report_id, user_id, storage_path, mime_type, size_bytes)
    values ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222/aaaaaaaa-0000-4000-8000-000000000005/x.jpg', 'image/jpeg', 1)$$,
  '23514', null,
  'report media paths must start with the owner and report ids'
);

select throws_ok(
  $$insert into aqi_index_values (reading_id, aqi_scale, aqi_value)
    values ('aaaaaaaa-0000-4000-8000-000000000004', 'uaqi', 10)$$,
  '23502', null,
  'AQI values must state whether they were provider-reported or calculated'
);

select throws_ok(
  $$insert into aqi_index_values (reading_id, aqi_scale, aqi_value, value_origin)
    values ('aaaaaaaa-0000-4000-8000-000000000004', 'uaqi', 10, 'hawa_calculated')$$,
  '23514', null,
  'calculated AQI values must name their calculation method'
);

select ok(
  (select not public from storage.buckets where id = 'report-media'),
  'report-media bucket is private'
);

select is(
  (select avatar_url from user_profiles where id = '22222222-2222-4222-8222-222222222222'),
  null,
  'signup drops non-https avatar URLs'
);

select throws_ok(
  $$update user_profiles set avatar_url = 'http://example.com/a.png' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null,
  'avatar URLs must be https'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  0,
  'no public view bypasses RLS (all views use security_invoker)'
);

select ok(
  not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')
  and not has_function_privilege('anon', 'private.enforce_user_quota()', 'execute'),
  'internal helper functions are not executable by client roles'
);

create table public.rls_default_privilege_probe (id int);
select ok(
  not has_table_privilege('anon', 'public.rls_default_privilege_probe', 'select')
  and not has_table_privilege('authenticated', 'public.rls_default_privilege_probe', 'select'),
  'new public tables are not granted to anon/authenticated by default'
);
drop table public.rls_default_privilege_probe;

------------------------------------------------------------------------------
-- Anonymous visitor
------------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

select isnt_empty($$select 1 from locations where slug = 'rls-test-area'$$,
  'anon can read active locations');
select isnt_empty($$select 1 from aqi_readings where id = 'aaaaaaaa-0000-4000-8000-000000000004'$$,
  'anon can read readings');
select isnt_empty($$select 1 from aqi_index_values where reading_id = 'aaaaaaaa-0000-4000-8000-000000000004'$$,
  'anon can read AQI values');
select throws_ok($$select 1 from provider_payloads$$, '42501', null,
  'anon cannot read raw provider payloads');
select results_eq(
  $$select id::text from civic_reports order by id$$,
  $$values ('aaaaaaaa-0000-4000-8000-000000000009')$$,
  'anon sees only published reports (not dismissed, not account reports)');
select lives_ok(
  $$select id, category, latitude, longitude, status, verification_status, ai_category, ai_confidence, ai_visible_severity, created_at from civic_reports$$,
  'anon can read the public report columns');
select throws_ok($$select description from civic_reports$$, '42501', null,
  'anon cannot read report descriptions');
select throws_ok($$select submitter_hash from civic_reports$$, '42501', null,
  'anon cannot read submitter hashes');
select throws_ok($$select ai_classification from civic_reports$$, '42501', null,
  'anon cannot read AI observations');
select throws_ok($$select user_id from civic_reports$$, '42501', null,
  'anon cannot read report owners');
select throws_ok($$select 1 from report_media$$, '42501', null,
  'anon cannot read report media');
select throws_ok(
  $$insert into civic_reports (category, latitude, longitude) values ('other', 26.9, 75.8)$$,
  '42501', null,
  'anon cannot create reports through the Data API');
select throws_ok($$select 1 from user_profiles$$, '42501', null,
  'anon cannot read profiles');
select throws_ok($$select 1 from ai_messages$$, '42501', null,
  'anon cannot read AI messages');
select throws_ok($$select 1 from provider_sync_logs$$, '42501', null,
  'anon cannot read provider sync logs');
select lives_ok($$select 1 from ai_daily_briefs$$, 'anon can read AI daily briefs');
select throws_ok(
  $$insert into ai_daily_briefs (data_signature, data_as_of, model, prompt_version, content)
    values ('x', now(), 'm', 'p', '{}')$$,
  '42501', null,
  'anon cannot write AI daily briefs');
select is_empty($$select 1 from locations where slug = 'rls-inactive-area'$$,
  'anon cannot see inactive locations');
select throws_ok(
  $$insert into locations (slug, name, latitude, longitude, location_type, coordinate_source)
    values ('anon-area', 'x', 1, 1, 'neighbourhood', 'x')$$,
  '42501', null,
  'anon cannot write environmental reference data');

reset role;

------------------------------------------------------------------------------
-- User B (must not see or change anything of User A)
------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

select is_empty($$select 1 from civic_reports$$, 'B cannot see A''s reports');
select is_empty($$select 1 from report_media$$, 'B cannot see A''s report media');
select is_empty($$select 1 from ai_conversations$$, 'B cannot see A''s conversations');
select is_empty($$select 1 from ai_messages$$, 'B cannot see A''s messages');
select is_empty($$select 1 from ai_evidence$$, 'B cannot see A''s evidence');
select is_empty($$select 1 from user_alerts$$, 'B cannot see A''s alerts');
select is_empty($$select 1 from user_profiles where id = '11111111-1111-4111-8111-111111111111'$$,
  'B cannot see A''s profile');
select isnt_empty($$select 1 from user_profiles where id = '22222222-2222-4222-8222-222222222222'$$,
  'B can see their own profile');
select is_empty($$select 1 from storage.objects where bucket_id = 'report-media'$$,
  'B cannot see A''s stored images');
select throws_ok($$select 1 from provider_payloads$$, '42501', null,
  'signed-in users cannot read raw provider payloads');
select throws_ok($$select 1 from provider_sync_logs$$, '42501', null,
  'signed-in users cannot read provider sync logs');

select throws_ok(
  $$insert into civic_reports (user_id, category) values ('11111111-1111-4111-8111-111111111111', 'other')$$,
  '42501', null,
  'B cannot file a report as A');
select throws_ok(
  $$insert into civic_reports (category, status) values ('other', 'resolved')$$,
  '42501', null,
  'users cannot set report status');
select lives_ok(
  $$insert into civic_reports (category, description) values ('other', 'B report')$$,
  'B can file their own report');
select lives_ok(
  $$update civic_reports set description = 'tampered' where id = 'aaaaaaaa-0000-4000-8000-000000000005'$$,
  'an update aimed at A''s report runs but matches no visible rows');
select throws_ok(
  $$update civic_reports set status = 'resolved'$$,
  '42501', null,
  'users cannot change report status');

select lives_ok($$insert into ai_conversations (title) values ('B chat')$$,
  'B can start a conversation');
select lives_ok(
  $$insert into ai_messages (conversation_id, role, content)
    select id, 'user', 'Hello' from ai_conversations$$,
  'B can add a user message to their own conversation');
select throws_ok(
  $$insert into ai_messages (conversation_id, role, content)
    select id, 'assistant', 'Forged answer' from ai_conversations$$,
  '42501', null,
  'users cannot write assistant messages');
select throws_ok(
  $$insert into ai_messages (conversation_id, role, content)
    values ('aaaaaaaa-0000-4000-8000-000000000006', 'user', 'Intrusion')$$,
  '42501', null,
  'B cannot post into A''s conversation');

select throws_ok(
  $$insert into aqi_readings (location_id, source_id, data_kind, observed_at)
    values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'measured', now())$$,
  '42501', null,
  'users cannot write environmental readings');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('report-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005/evil.jpg')$$,
  '42501', null,
  'B cannot upload into A''s storage folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('report-media', '22222222-2222-4222-8222-222222222222/aaaaaaaa-0000-4000-8000-000000000005/x.jpg')$$,
  '42501', null,
  'B cannot upload into their own folder using A''s report id');
select lives_ok($$update ai_conversations set title = 'hijacked'$$,
  'an update aimed at A''s conversation matches no visible rows');
select lives_ok($$update user_alerts set read_at = now()$$,
  'an update aimed at A''s alert matches no visible rows');
select lives_ok($$update user_profiles set full_name = 'hijacked' where id = '11111111-1111-4111-8111-111111111111'$$,
  'an update aimed at A''s profile matches no visible rows');
select throws_ok($$update civic_reports set ai_classification = '{}'$$, '42501', null,
  'users cannot set AI classifications');
select throws_ok($$update ai_messages set content = 'edited'$$, '42501', null,
  'users cannot edit messages');
select throws_ok($$delete from ai_messages$$, '42501', null,
  'users cannot delete individual messages');
select throws_ok($$insert into ai_evidence (message_id, source_name) values ('aaaaaaaa-0000-4000-8000-000000000007', 'x')$$,
  '42501', null, 'users cannot write AI evidence');
select throws_ok($$insert into user_alerts (user_id, type, message) values ('22222222-2222-4222-8222-222222222222', 'system', 'x')$$,
  '42501', null, 'users cannot create alerts');
select throws_ok($$update aqi_index_values set aqi_value = 1$$, '42501', null,
  'users cannot change AQI values');
select throws_ok($$insert into pollutant_values (reading_id, pollutant, value, unit) values ('aaaaaaaa-0000-4000-8000-000000000004', 'pm10', 1, 'ug_m3')$$,
  '42501', null, 'users cannot write pollutant values');
select throws_ok($$delete from pollution_forecasts$$, '42501', null,
  'users cannot delete forecasts');
select throws_ok($$update data_sources set is_active = false$$, '42501', null,
  'users cannot change data sources');
select throws_ok($$delete from ai_daily_briefs$$, '42501', null,
  'signed-in users cannot delete AI daily briefs');

reset role;

------------------------------------------------------------------------------
-- User A (owner)
------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is(
  (select count(*)::int from civic_reports), 1,
  'A sees exactly their own report (not B''s)');
select isnt_empty($$select 1 from ai_messages where role = 'assistant'$$,
  'A can read server-written assistant messages');
select isnt_empty($$select 1 from ai_evidence$$, 'A can read evidence for their messages');
select isnt_empty($$select 1 from report_media$$, 'A can read their report media');
select isnt_empty($$select 1 from storage.objects where bucket_id = 'report-media'$$,
  'A can read their stored images');
select lives_ok(
  $$update user_alerts set read_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000008'$$,
  'A can mark an alert read');
select throws_ok(
  $$update user_alerts set message = 'changed'$$,
  '42501', null,
  'users cannot edit alert content');
select lives_ok(
  $$update civic_reports set description = 'Edited by A' where id = 'aaaaaaaa-0000-4000-8000-000000000005'$$,
  'A can edit their submitted report');

reset role;

select is(
  (select description from civic_reports where id = 'aaaaaaaa-0000-4000-8000-000000000005'),
  'Edited by A',
  'A''s edit applied and B''s tampering did not');
select isnt(
  (select read_at from user_alerts where id = 'aaaaaaaa-0000-4000-8000-000000000008'),
  null,
  'alert was marked read');

-- Once review starts, the author can no longer edit.
update civic_reports set status = 'under_review' where id = 'aaaaaaaa-0000-4000-8000-000000000005';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
update civic_reports set description = 'Late edit' where id = 'aaaaaaaa-0000-4000-8000-000000000005';
reset role;

select is(
  (select description from civic_reports where id = 'aaaaaaaa-0000-4000-8000-000000000005'),
  'Edited by A',
  'reports under review cannot be edited by their author');

-- Media cannot be attached to a report under review.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$insert into report_media (report_id, storage_path, mime_type, size_bytes)
    values ('aaaaaaaa-0000-4000-8000-000000000005',
            '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005/late.jpg', 'image/jpeg', 10)$$,
  '42501', null,
  'media cannot be attached once a report is under review');

-- Per-user quota: the 21st report within 24 hours is refused.
select lives_ok(
  $$insert into civic_reports (category) select 'other' from generate_series(1, 19)$$,
  'a user can file up to 20 reports a day');
select throws_ok(
  $$insert into civic_reports (category) values ('other')$$,
  'P0429', null,
  'the 21st report within 24 hours is refused');
reset role;

------------------------------------------------------------------------------
-- Anonymous reports: integrity and abuse limits (server writes)
------------------------------------------------------------------------------

-- Server writes run without a JWT (auth.uid() is null).
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$insert into civic_reports (user_id, submission_channel, category, latitude, longitude)
    values (null, 'anonymous', 'other', 26.9, 75.8)$$,
  '23514', null,
  'anonymous reports need a submitter hash');
select throws_ok(
  $$insert into civic_reports (user_id, submission_channel, category, latitude, longitude, submitter_hash)
    values (null, 'anonymous', 'other', 28.6, 77.2, 'fixture-hash-delhi')$$,
  '23514', null,
  'anonymous reports must be in the Jaipur area');
select throws_ok(
  $$insert into civic_reports (user_id, submission_channel, category, latitude, longitude, submitter_hash)
    values ('11111111-1111-4111-8111-111111111111', 'anonymous', 'other', 26.9, 75.8, 'fixture-hash-owner')$$,
  '23514', null,
  'an anonymous report cannot have an owner');
select throws_ok(
  $$insert into report_media (report_id, user_id, storage_path, mime_type, size_bytes)
    values ('aaaaaaaa-0000-4000-8000-000000000009', null,
            '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000009/x.jpg', 'image/jpeg', 10)$$,
  '23514', null,
  'anonymous media must live in the anonymous folder');
select lives_ok(
  $$update civic_reports set submitter_hash = null where id = 'aaaaaaaa-0000-4000-8000-000000000009'$$,
  'the retention job can clear a submitter hash');
select lives_ok(
  $$insert into civic_reports (user_id, submission_channel, category, latitude, longitude, submitter_hash)
    select null, 'anonymous', 'other', 26.9, 75.8, 'fixture-hash-quota' from generate_series(1, 3)$$,
  'an anonymous submitter can file 3 reports an hour');
select throws_ok(
  $$insert into civic_reports (user_id, submission_channel, category, latitude, longitude, submitter_hash)
    values (null, 'anonymous', 'other', 26.9, 75.8, 'fixture-hash-quota')$$,
  'P0429', null,
  'the 4th anonymous report within an hour is refused');

select * from finish();

rollback;
