-- Lane C / C5: LINE group candidate ingest.
-- Additive over 0003_candidates.sql (trip_candidates already exists): add the
-- columns the LINE ingest writes, plus two new tables. Does NOT recreate
-- trip_candidates or alter its existing RLS policies.

-- extend existing trip_candidates for LINE-sourced candidates
alter table public.trip_candidates add column if not exists place_id text;
alter table public.trip_candidates add column if not exists source jsonb;

-- dedupe a place within a trip (only when we have a Google place_id)
create unique index if not exists trip_candidates_trip_place_id_idx
  on public.trip_candidates(trip_id, place_id)
  where place_id is not null;

-- LINE group -> trip binding (one active binding per group)
create table if not exists public.trip_line_groups (
  id uuid primary key default gen_random_uuid(),
  line_group_id text not null,
  trip_id uuid not null references public.trips(id) on delete cascade,
  write_as_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create unique index if not exists trip_line_groups_active_group_idx
  on public.trip_line_groups(line_group_id)
  where status = 'active';

create index if not exists trip_line_groups_trip_id_idx
  on public.trip_line_groups(trip_id);

alter table public.trip_line_groups enable row level security;

drop policy if exists "participant_select_line_groups" on public.trip_line_groups;
create policy "participant_select_line_groups" on public.trip_line_groups
  for select using (public.is_trip_participant(trip_id));

-- raw LINE ingest jobs (audit / idempotency by message_id). Writes go through
-- the service-role admin client after signature verification; no client access.
create table if not exists public.line_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  line_group_id text,
  line_user_id text,
  message_id text not null,
  message_text text,
  event_payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'ignored', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists line_ingest_jobs_message_id_idx
  on public.line_ingest_jobs(message_id);

alter table public.line_ingest_jobs enable row level security;
