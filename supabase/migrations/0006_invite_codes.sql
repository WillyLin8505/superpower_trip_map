-- Lane C: six-digit share codes for LINE/group binding.
alter table public.trips add column if not exists invite_code text;

alter table public.trips
  drop constraint if exists trips_invite_code_six_digits;

alter table public.trips
  add constraint trips_invite_code_six_digits
  check (invite_code is null or invite_code ~ '^[0-9]{6}$');

create unique index if not exists trips_invite_code_idx
  on public.trips(invite_code)
  where invite_code is not null;
