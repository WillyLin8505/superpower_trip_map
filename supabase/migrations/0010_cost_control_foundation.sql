-- Cost-control foundation:
-- 1) Source-aware user place index so Google-derived coordinates are not stored indefinitely.
-- 2) Public open-data POI table for Overture/OSM/Wikidata candidates.
-- 3) API usage event log for provider/SKU-level spend visibility.

alter table public.user_place_index
  add column if not exists source text not null default 'google',
  add column if not exists expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_place_index_source_check'
      and conrelid = 'public.user_place_index'::regclass
  ) then
    alter table public.user_place_index
      add constraint user_place_index_source_check
      check (source in ('google', 'overture', 'osm', 'wikidata', 'user'));
  end if;
end $$;

update public.user_place_index
set expires_at = coalesce(expires_at, now() + interval '30 days')
where source = 'google';

alter table public.user_place_index
  drop constraint if exists user_place_index_pkey;

alter table public.user_place_index
  add constraint user_place_index_pkey
  primary key (owner_id, source, place_id, category);

create index if not exists user_place_index_owner_source_category_idx
  on public.user_place_index(owner_id, source, category);

create table if not exists public.poi_places (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('overture', 'osm', 'wikidata', 'user')),
  source_place_id text not null,
  name_primary text not null,
  name_zh text,
  name_local text,
  lat double precision not null,
  lng double precision not null,
  category text not null check (category in ('attraction', 'restaurant', 'dessert', 'accommodation')),
  confidence double precision,
  license text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_place_id, category)
);

alter table public.poi_places enable row level security;

drop policy if exists poi_places_select_public on public.poi_places;
create policy poi_places_select_public
  on public.poi_places for select
  using (true);

create index if not exists poi_places_category_lat_lng_idx
  on public.poi_places(category, lat, lng);

create index if not exists poi_places_source_idx
  on public.poi_places(source);

create table if not exists public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  sku_hint text,
  method text not null default 'GET',
  units integer not null default 1 check (units > 0),
  cache_hit boolean not null default false,
  estimated_cost_usd numeric(12, 6),
  status_code integer,
  request_hash text,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.api_usage_events enable row level security;

create index if not exists api_usage_events_provider_endpoint_created_idx
  on public.api_usage_events(provider, endpoint, created_at desc);

create index if not exists api_usage_events_user_created_idx
  on public.api_usage_events(user_id, created_at desc);

create index if not exists api_usage_events_trip_created_idx
  on public.api_usage_events(trip_id, created_at desc);
