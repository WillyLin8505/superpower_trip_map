-- User-owned long-term place index for app recommendations.
-- Stores only stable minimal fields: place_id, name, lat, lng, category.
create table if not exists public.user_place_index (
  owner_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  category text not null check (category in ('attraction', 'restaurant', 'dessert', 'accommodation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, place_id, category)
);

alter table public.user_place_index enable row level security;

drop policy if exists user_place_index_select_own on public.user_place_index;
create policy user_place_index_select_own
  on public.user_place_index for select
  using (auth.uid() = owner_id);

drop policy if exists user_place_index_insert_own on public.user_place_index;
create policy user_place_index_insert_own
  on public.user_place_index for insert
  with check (auth.uid() = owner_id);

drop policy if exists user_place_index_update_own on public.user_place_index;
create policy user_place_index_update_own
  on public.user_place_index for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists user_place_index_delete_own on public.user_place_index;
create policy user_place_index_delete_own
  on public.user_place_index for delete
  using (auth.uid() = owner_id);

create index if not exists user_place_index_owner_category_idx
  on public.user_place_index(owner_id, category);
