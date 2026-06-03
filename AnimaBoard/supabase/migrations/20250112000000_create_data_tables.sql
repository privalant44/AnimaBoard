-- AnimaBoard: tables pour ressources, prestations, feuilles de temps, etc.
-- Exécuter dans l’ordre (Supabase Dashboard SQL Editor ou CLI).

-- Métadonnées diverses (sync, etc.)
create table if not exists public.app_metadata (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Ressources (sync BoondManager)
create table if not exists public.resources (
  id bigint primary key,
  nom text not null default '',
  prenom text not null default '',
  type_of int,
  state int,
  is_visible boolean not null default true,
  contracts jsonb default '[]',
  raw jsonb default '{}',
  synced_at timestamptz default now()
);

-- Prestations (deliveries) — une ligne par prestation
create table if not exists public.deliveries (
  id bigint primary key,
  reference text,
  title text not null default '',
  tjm numeric,
  start_date date,
  end_date date,
  project_id bigint,
  resource_id bigint,
  resource_first_name text,
  resource_last_name text,
  state int,
  raw jsonb default '{}',
  synced_at timestamptz default now()
);
create index if not exists idx_deliveries_project on public.deliveries(project_id);
create index if not exists idx_deliveries_resource on public.deliveries(resource_id);

-- Projets (sync BoondManager) — une ligne par projet
create table if not exists public.projects (
  id bigint primary key,
  reference text,
  name text,
  state int,
  start_date date,
  end_date date,
  client_name text,
  raw jsonb default '{}',
  synced_at timestamptz default now()
);

-- Ancienne table deliveries_store (obsolète, gardée pour migration)
create table if not exists public.deliveries_store (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  metadata jsonb not null default '{}',
  synced_at timestamptz default now()
);
insert into public.deliveries_store (id, data, metadata)
values (1, '[]', '{}')
on conflict (id) do nothing;

-- Données détaillées feuilles de temps (un blob par sync)
create table if not exists public.timesheets_data (
  id serial primary key,
  data jsonb not null default '{}',
  metadata jsonb not null default '{}',
  synced_at timestamptz default now()
);
-- Une seule ligne utilisée (id = 1)
insert into public.timesheets_data (id, data, metadata)
values (1, '{}', '{}')
on conflict (id) do nothing;

-- Agrégat feuilles de temps (ressource × prestation × mois)
create table if not exists public.timesheets_aggregate (
  id serial primary key,
  resource_id bigint not null,
  resource_name text,
  delivery_id bigint not null,
  month text not null,
  total_days numeric not null default 0,
  total_hours numeric not null default 0,
  created_at timestamptz default now(),
  unique(resource_id, delivery_id, month)
);

-- Temps prévisionnels (prestation × mois)
create table if not exists public.forecast_times (
  delivery_id bigint not null,
  month text not null,
  value numeric not null default 0,
  updated_at timestamptz default now(),
  primary key (delivery_id, month)
);

-- Rapport forecast (lignes synthèse)
create table if not exists public.forecast_report (
  id serial primary key,
  nom text,
  prenom text,
  reference text,
  titre text,
  date_debut date,
  date_fin date,
  tjm numeric,
  generated_at timestamptz default now()
);

-- Extraction temps missions (CSV)
create table if not exists public.temps_missions (
  id serial primary key,
  ressource text,
  projet text,
  prestation text,
  mois text,
  nombre_de_jours text,
  extracted_at timestamptz default now()
);

-- Métadonnées ressources (objet libre)
create table if not exists public.resources_metadata (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Détail des feuilles de temps
-- - delivery_id != 0 : lignes production par prestation
-- - delivery_id = 0  : ligne de synthèse mensuelle par ressource (prod + interne)
create table if not exists public.timesheets_detail (
  id serial primary key,
  timesheet_id bigint not null,
  resource_id  bigint not null,
  resource_name text,
  month text not null,          -- ex: '2025-01'
  delivery_id bigint not null,
  total_days_prod numeric not null default 0,
  total_days_int numeric not null default 0,
  total_hours numeric not null default 0,
  synced_at timestamptz default now()
);
create index if not exists idx_timesheets_detail_lookup
  on public.timesheets_detail (resource_id, delivery_id, month);

-- Index utiles
create index if not exists idx_timesheets_aggregate_lookup on public.timesheets_aggregate (resource_id, delivery_id, month);

-- Fonction pour vider forecast_times (Supabase n'autorise pas DELETE sans filtre)
create or replace function public.clear_forecast_times()
returns void language sql security definer as $$
  delete from public.forecast_times;
$$;
