-- AnimaBoard: Script complet pour base de production Supabase
-- Exécuter dans Supabase Dashboard > SQL Editor

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
  temps_travail text,
  statut_interne text,
  commentaires text,
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
  ordered_days numeric,
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

-- Dictionnaire (correspondances code -> libellé)
create table if not exists public.dictionnaire (
  id serial primary key,
  table_name text not null,
  column_name text not null,
  code text not null,
  label text not null,
  created_at timestamptz default now(),
  unique(table_name, column_name, code)
);

-- Données détaillées feuilles de temps (un blob par sync)
create table if not exists public.timesheets_data (
  id serial primary key,
  data jsonb not null default '{}',
  metadata jsonb not null default '{}',
  synced_at timestamptz default now()
);
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
create index if not exists idx_timesheets_aggregate_lookup on public.timesheets_aggregate (resource_id, delivery_id, month);

-- Détail des feuilles de temps
-- - delivery_id != 0 : lignes production par prestation
-- - delivery_id = 0  : ligne de synthèse mensuelle par ressource (prod + interne)
create table if not exists public.timesheets_detail (
  id serial primary key,
  timesheet_id bigint not null,
  resource_id bigint not null,
  resource_name text,
  month text not null,
  delivery_id bigint not null,
  total_days_prod numeric not null default 0,
  total_days_int numeric not null default 0,
  total_hours numeric not null default 0,
  synced_at timestamptz default now()
);
create index if not exists idx_timesheets_detail_lookup
  on public.timesheets_detail (resource_id, delivery_id, month);

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

-- Fonction pour vider forecast_times
create or replace function public.clear_forecast_times()
returns void language sql security definer as $$
  delete from public.forecast_times;
$$;

-- Désactiver RLS pour permettre les opérations serveur
alter table public.app_metadata enable row level security;
alter table public.resources enable row level security;
alter table public.deliveries enable row level security;
alter table public.projects enable row level security;
alter table public.dictionnaire enable row level security;
alter table public.timesheets_data enable row level security;
alter table public.timesheets_aggregate enable row level security;
alter table public.timesheets_detail enable row level security;
alter table public.forecast_times enable row level security;
alter table public.forecast_report enable row level security;
alter table public.temps_missions enable row level security;
alter table public.resources_metadata enable row level security;

-- Policies pour service_role (accès complet)
create policy "Service role full access" on public.app_metadata for all using (true) with check (true);
create policy "Service role full access" on public.resources for all using (true) with check (true);
create policy "Service role full access" on public.deliveries for all using (true) with check (true);
create policy "Service role full access" on public.projects for all using (true) with check (true);
create policy "Service role full access" on public.dictionnaire for all using (true) with check (true);
create policy "Service role full access" on public.timesheets_data for all using (true) with check (true);
create policy "Service role full access" on public.timesheets_aggregate for all using (true) with check (true);
create policy "Service role full access" on public.timesheets_detail for all using (true) with check (true);
create policy "Service role full access" on public.forecast_times for all using (true) with check (true);
create policy "Service role full access" on public.forecast_report for all using (true) with check (true);
create policy "Service role full access" on public.temps_missions for all using (true) with check (true);
create policy "Service role full access" on public.resources_metadata for all using (true) with check (true);
