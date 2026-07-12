-- Schéma normalisé : resource_id × scénario (P1, P2…) × mois × jours prévisionnels

drop table if exists public.planned_deliveries;

create table if not exists public.planned_scenario (
  resource_id bigint not null,
  scenario integer not null check (scenario > 0),
  tjm numeric,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (resource_id, scenario)
);

create table if not exists public.planned_forecast (
  resource_id bigint not null,
  scenario integer not null check (scenario > 0),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  days numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (resource_id, scenario, month),
  foreign key (resource_id, scenario)
    references public.planned_scenario (resource_id, scenario)
    on delete cascade
);

create index if not exists idx_planned_forecast_resource_id
  on public.planned_forecast (resource_id);

create index if not exists idx_planned_forecast_month
  on public.planned_forecast (month);

alter table public.planned_scenario enable row level security;
alter table public.planned_forecast enable row level security;

drop policy if exists "Service role full access" on public.planned_scenario;
create policy "Service role full access" on public.planned_scenario
  for all using (true) with check (true);

drop policy if exists "Service role full access" on public.planned_forecast;
create policy "Service role full access" on public.planned_forecast
  for all using (true) with check (true);
