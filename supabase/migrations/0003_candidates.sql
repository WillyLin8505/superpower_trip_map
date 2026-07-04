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
-- 共享候選池：任何目前的 participant 都能移除任一候選（含把候選放進某天的 move 語義）。
-- participant 檢查同時擋掉「已被移出 trip 的前成員仍能刪自己加的候選」漏洞，
-- 並讓 CandidatePanel 對所有候選顯示的「移除／放進」對每個成員都真正生效（不會靜默失敗）。
create policy "participant_delete_candidates" on public.trip_candidates
  for delete using (public.is_trip_participant(trip_id));
