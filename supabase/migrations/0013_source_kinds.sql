alter table public.sources
  add column if not exists kind text not null default 'recommendation',
  add column if not exists enabled boolean not null default true,
  add column if not exists config jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.sources
    add constraint sources_kind_check
    check (kind in ('recommendation', 'image'));
exception
  when duplicate_object then null;
end $$;

create index if not exists sources_kind_enabled_idx
  on public.sources (kind, enabled, created_at);
