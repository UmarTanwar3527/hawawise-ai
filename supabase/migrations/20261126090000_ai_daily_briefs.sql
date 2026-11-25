-- Hawa AI · 008 · AI Daily Air Brief
--
-- Briefs are generated server-side (service role) from stored data on a
-- schedule, never on page load. One row per distinct data signature, so the
-- same data never produces a second brief. Publicly readable; no client writes.

create table public.ai_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'jaipur' check (scope ~ '^[a-z0-9-]+$'),
  -- Summary of the data the brief was based on (IST day + station categories).
  data_signature text not null check (char_length(data_signature) <= 1000),
  -- Latest station hour the brief used.
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  model text not null,
  prompt_version text not null,
  -- {headline, summary, highlights[], guidance[], warnings[], language}
  content jsonb not null,
  -- Evidence built from the tool results used, never written by the model.
  evidence jsonb not null default '[]'::jsonb,
  constraint ai_daily_briefs_unique_signature unique (scope, data_signature)
);

create index ai_daily_briefs_scope_time_idx on public.ai_daily_briefs (scope, generated_at desc);

alter table public.ai_daily_briefs enable row level security;
revoke all on public.ai_daily_briefs from anon, authenticated;
grant select on public.ai_daily_briefs to anon, authenticated;

create policy "Daily briefs are public"
  on public.ai_daily_briefs for select to anon, authenticated
  using (true);
