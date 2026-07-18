-- 0011_saved_places.sql — cross-trip personal collection imported from Google Takeout.
-- RLS mirrors 0009_user_place_index.sql: each user only ever sees/writes their own rows.
create table if not exists public.saved_places (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  list_name  text not null,
  source     text not null check (source in ('takeout_starred','takeout_list','takeout_labeled')),
  place_id   text not null,
  place      jsonb not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, list_name, place_id)
);
create index if not exists saved_places_owner_idx on public.saved_places(owner_id);

alter table public.saved_places enable row level security;

drop policy if exists saved_places_select_own on public.saved_places;
create policy saved_places_select_own on public.saved_places
  for select using (auth.uid() = owner_id);

drop policy if exists saved_places_insert_own on public.saved_places;
create policy saved_places_insert_own on public.saved_places
  for insert with check (auth.uid() = owner_id);

drop policy if exists saved_places_update_own on public.saved_places;
create policy saved_places_update_own on public.saved_places
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists saved_places_delete_own on public.saved_places;
create policy saved_places_delete_own on public.saved_places
  for delete using (auth.uid() = owner_id);
