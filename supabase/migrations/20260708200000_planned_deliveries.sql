-- Prestations prévisionnelles manuelles (par collaborateur, hors sync Boond)

create table if not exists public.planned_deliveries (
  id uuid primary key default gen_random_uuid(),
  resource_id bigint not null,
  tjm numeric,
  forecast jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_planned_deliveries_resource_id
  on public.planned_deliveries (resource_id);

alter table public.planned_deliveries enable row level security;

drop policy if exists "Service role full access" on public.planned_deliveries;
create policy "Service role full access" on public.planned_deliveries
  for all using (true) with check (true);
