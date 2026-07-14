-- Cost control: cache Google place_id values indefinitely.
-- Google Maps Platform allows long-term storage of place_id values; this table
-- intentionally stores only hashed user lookup input + place_id, not Google
-- names, addresses, photos, coordinates, or reviews.
create table if not exists public.place_id_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  lookup_hash text not null,
  place_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  hit_count integer not null default 0,
  unique (provider, lookup_hash)
);

create index if not exists place_id_cache_place_id_idx
  on public.place_id_cache(provider, place_id);

alter table public.place_id_cache enable row level security;
