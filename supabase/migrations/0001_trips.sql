-- Lane C / C1: trips table + owner-only RLS
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default '未命名行程',
  plan        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trips_owner_id_idx on public.trips(owner_id);

alter table public.trips enable row level security;

create policy "owner_select" on public.trips
  for select using (auth.uid() = owner_id);
create policy "owner_insert" on public.trips
  for insert with check (auth.uid() = owner_id);
create policy "owner_update" on public.trips
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_delete" on public.trips
  for delete using (auth.uid() = owner_id);
