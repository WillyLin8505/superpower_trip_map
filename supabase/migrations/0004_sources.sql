-- TASK-013: recommendation sources move from config/sources.json (read-only FS on Vercel) to Supabase.
create table if not exists public.sources (
  id                uuid primary key default gen_random_uuid(),
  url               text not null,
  label             text not null,
  last_fetched_at   timestamptz,
  last_fetch_status text check (last_fetch_status in ('ok', 'error')),
  created_at        timestamptz not null default now()
);

alter table public.sources enable row level security;

-- Read: any authenticated user (the recommendation pipeline reads this server-side).
create policy "authenticated_select_sources" on public.sources
  for select using (auth.role() = 'authenticated');

-- Write: no client-side insert/update/delete policy. All mutations go through
-- server actions using the service-role admin client, gated by requireAdmin()
-- (ADMIN_EMAILS allowlist) in the application layer — RLS intentionally does
-- not grant write access to any authenticated-user role.
