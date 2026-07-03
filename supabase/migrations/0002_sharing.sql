-- Lane C / C2: sharing + membership

alter table public.trips add column if not exists invite_token uuid;

create unique index if not exists trips_invite_token_idx
  on public.trips(invite_token)
  where invite_token is not null;

create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'editor' check (role = 'editor'),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_id_idx
  on public.trip_members(user_id);

create or replace function public.is_trip_participant(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trips where id = t and owner_id = auth.uid()
  )
  or exists (
    select 1 from public.trip_members where trip_id = t and user_id = auth.uid()
  );
$$;

drop policy if exists "owner_select" on public.trips;
drop policy if exists "owner_update" on public.trips;

create policy "participant_select" on public.trips
  for select using (public.is_trip_participant(id));

create policy "participant_update" on public.trips
  for update using (public.is_trip_participant(id))
  with check (public.is_trip_participant(id));

revoke update on public.trips from authenticated;
grant update (title, plan, updated_at) on public.trips to authenticated;

alter table public.trip_members enable row level security;

create policy "participant_select_members" on public.trip_members
  for select using (public.is_trip_participant(trip_id));

create policy "self_or_owner_delete" on public.trip_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.trips
      where id = trip_id and owner_id = auth.uid()
    )
  );
