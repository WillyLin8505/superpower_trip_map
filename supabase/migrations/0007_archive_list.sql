-- TASK-022: archive parking-lot. Reuses trip_candidates (C5) with a `list`
-- column distinguishing LINE/manual candidates from archived places.
-- Renumbered from the spec's 0006 — 0006_invite_codes.sql already exists on main.
alter table public.trip_candidates
  add column if not exists list text not null default 'candidate'
  check (list in ('candidate', 'archived'));

create index if not exists trip_candidates_trip_list_idx
  on public.trip_candidates(trip_id, list);
