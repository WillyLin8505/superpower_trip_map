-- Lane C / C3: shared candidate pool
create table if not exists public.trip_candidates (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  place      jsonb not null,
  added_by   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists trip_candidates_trip_id_idx on public.trip_candidates(trip_id);

alter table public.trip_candidates enable row level security;

create policy "participant_select_candidates" on public.trip_candidates
  for select using (public.is_trip_participant(trip_id));
create policy "participant_insert_candidates" on public.trip_candidates
  for insert with check (public.is_trip_participant(trip_id) and added_by = auth.uid());
create policy "adder_or_owner_delete_candidates" on public.trip_candidates
  for delete using (
    added_by = auth.uid()
    or exists (select 1 from public.trips where id = trip_id and owner_id = auth.uid())
  );
