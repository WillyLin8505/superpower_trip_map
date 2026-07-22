-- Google Drive-style trip sharing: private by default, token links optional, email grants explicit.

alter table public.trips
  add column if not exists share_token uuid,
  add column if not exists link_access text not null default 'restricted';

alter table public.trips
  drop constraint if exists trips_link_access_valid;

alter table public.trips
  add constraint trips_link_access_valid
  check (link_access in ('restricted', 'view', 'edit'));

create unique index if not exists trips_share_token_idx
  on public.trips(share_token)
  where share_token is not null;

create table if not exists public.trip_email_permissions (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  email      text not null,
  role       text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, email),
  constraint trip_email_permissions_role_valid
    check (role in ('viewer', 'editor')),
  constraint trip_email_permissions_email_normalized
    check (email = lower(btrim(email)) and position('@' in email) > 1)
);

create index if not exists trip_email_permissions_email_idx
  on public.trip_email_permissions(email);

alter table public.trip_email_permissions enable row level security;

create or replace function public.is_trip_owner(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trips
    where id = t and owner_id = auth.uid()
  );
$$;

create or replace function public.has_trip_email_permission(t uuid, required_role text default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_email_permissions
    where trip_id = t
      and email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (
        required_role is null
        or role = required_role
        or (required_role = 'viewer' and role = 'editor')
      )
  );
$$;

drop policy if exists "owner_select_email_permissions" on public.trip_email_permissions;
drop policy if exists "owner_insert_email_permissions" on public.trip_email_permissions;
drop policy if exists "owner_update_email_permissions" on public.trip_email_permissions;
drop policy if exists "owner_delete_email_permissions" on public.trip_email_permissions;

create policy "owner_select_email_permissions" on public.trip_email_permissions
  for select to authenticated
  using (public.is_trip_owner(trip_id));

create policy "owner_insert_email_permissions" on public.trip_email_permissions
  for insert to authenticated
  with check (public.is_trip_owner(trip_id));

create policy "owner_update_email_permissions" on public.trip_email_permissions
  for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy "owner_delete_email_permissions" on public.trip_email_permissions
  for delete to authenticated
  using (public.is_trip_owner(trip_id));

drop policy if exists "email_permission_select" on public.trips;
drop policy if exists "email_editor_update" on public.trips;

create policy "email_permission_select" on public.trips
  for select to authenticated
  using (public.has_trip_email_permission(id, 'viewer'));

create policy "email_editor_update" on public.trips
  for update to authenticated
  using (public.has_trip_email_permission(id, 'editor'))
  with check (public.has_trip_email_permission(id, 'editor'));

grant select, insert, update, delete on public.trip_email_permissions to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.has_trip_email_permission(uuid, text) to authenticated;
