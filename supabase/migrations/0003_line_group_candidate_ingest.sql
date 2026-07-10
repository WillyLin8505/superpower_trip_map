-- Lane C / C5: LINE group candidate ingest

create table if not exists public.trip_candidates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id text,
  place jsonb not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  source jsonb
);

alter table public.trip_candidates add column if not exists source jsonb;

create index if not exists trip_candidates_trip_id_idx
  on public.trip_candidates(trip_id);

create unique index if not exists trip_candidates_trip_place_id_idx
  on public.trip_candidates(trip_id, place_id)
  where place_id is not null;

alter table public.trip_candidates enable row level security;

drop policy if exists "participant_select_candidates" on public.trip_candidates;
drop policy if exists "participant_insert_candidates" on public.trip_candidates;
drop policy if exists "participant_delete_candidates" on public.trip_candidates;

create policy "participant_select_candidates" on public.trip_candidates
  for select using (public.is_trip_participant(trip_id));

create policy "participant_insert_candidates" on public.trip_candidates
  for insert with check (public.is_trip_participant(trip_id));

create policy "participant_delete_candidates" on public.trip_candidates
  for delete using (public.is_trip_participant(trip_id));

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
