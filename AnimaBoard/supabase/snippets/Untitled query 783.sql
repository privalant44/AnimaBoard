-- Prestations (deliveries) — une ligne par prestation
create table if not exists public.deliveries (
  id text primary key,
  reference text,
  title text not null default '',
  tjm numeric,
  start_date date,
  end_date date,
  project_id text,
  resource_id text,
  resource_first_name text,
  resource_last_name text,
  state int,
  raw jsonb default '{}',
  synced_at timestamptz default now()
);
create index if not exists idx_deliveries_project on public.deliveries(project_id);
create index if not exists idx_deliveries_resource on public.deliveries(resource_id);