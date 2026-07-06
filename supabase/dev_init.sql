-- AnimaBoard — schéma complet pour base de développement (Supabase / Postgres)
-- À exécuter dans SQL Editor (nouveau projet dev) ou : supabase db execute / psql
-- Idempotent : CREATE IF NOT EXISTS + politiques recréées si besoin

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.app_metadata (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

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

create table if not exists public.projects (
  id bigint primary key,
  reference text,
  name text,
  state int,
  start_date date,
  end_date date,
  client_name text,
  creation_date timestamptz,
  update_date timestamptz,
  raw jsonb default '{}',
  synced_at timestamptz default now()
);

-- Ancienne table JSON (migration legacy, optionnelle)
create table if not exists public.deliveries_store (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  metadata jsonb not null default '{}',
  synced_at timestamptz default now()
);
insert into public.deliveries_store (id, data, metadata)
values (1, '[]', '{}')
on conflict (id) do nothing;

create table if not exists public.dictionnaire (
  id serial primary key,
  table_name text not null,
  column_name text not null,
  code text not null,
  label text not null,
  created_at timestamptz default now(),
  unique(table_name, column_name, code)
);

create table if not exists public.timesheets_data (
  id serial primary key,
  data jsonb not null default '{}',
  metadata jsonb not null default '{}',
  synced_at timestamptz default now()
);
insert into public.timesheets_data (id, data, metadata)
values (1, '{}', '{}')
on conflict (id) do nothing;

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
create index if not exists idx_timesheets_aggregate_lookup
  on public.timesheets_aggregate (resource_id, delivery_id, month);

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

create table if not exists public.forecast_times (
  delivery_id bigint not null,
  month text not null,
  value numeric not null default 0,
  updated_at timestamptz default now(),
  primary key (delivery_id, month)
);

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

create table if not exists public.temps_missions (
  id serial primary key,
  ressource text,
  projet text,
  prestation text,
  mois text,
  nombre_de_jours text,
  extracted_at timestamptz default now()
);

create table if not exists public.resources_metadata (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Absences Boond agrégées par collaborateur et mois (YYYY-MM)
create table if not exists public.absence (
  resource_id bigint not null,
  month text not null,
  days numeric not null default 0,
  synced_at timestamptz default now(),
  primary key (resource_id, month)
);
create index if not exists idx_absence_month on public.absence (month);

create table if not exists public.french_public_holiday (
  holiday_date date not null primary key,
  label text not null default '',
  year smallint not null
);
create index if not exists idx_french_public_holiday_year on public.french_public_holiday (year);

-- Colonnes ajoutées dans des migrations anciennes (si table créée sans elles)
alter table public.resources add column if not exists temps_travail text;
alter table public.resources add column if not exists statut_interne text;
alter table public.resources add column if not exists commentaires text;
alter table public.deliveries add column if not exists ordered_days numeric;
alter table public.deliveries add column if not exists creation_date timestamptz;
alter table public.deliveries add column if not exists update_date timestamptz;
alter table public.projects add column if not exists creation_date timestamptz;
alter table public.projects add column if not exists update_date timestamptz;

-- ---------------------------------------------------------------------------
-- RPC utilisée par lib/db.js (forecast)
-- ---------------------------------------------------------------------------

create or replace function public.clear_forecast_times()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.forecast_times;
$$;

-- ---------------------------------------------------------------------------
-- RLS : accès via service_role (clé utilisée par le serveur Node)
-- ---------------------------------------------------------------------------

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
alter table public.deliveries_store enable row level security;
alter table public.absence enable row level security;
alter table public.french_public_holiday enable row level security;

do $$
declare
  t text;
  tables text[] := array[
    'app_metadata','resources','deliveries','projects','dictionnaire',
    'timesheets_data','timesheets_aggregate','timesheets_detail',
    'forecast_times','forecast_report','temps_missions','resources_metadata',
    'deliveries_store','absence','french_public_holiday'
  ];
begin
  foreach t in array tables
  loop
    execute format(
      'drop policy if exists "Service role full access" on public.%I',
      t
    );
    execute format(
      'create policy "Service role full access" on public.%I for all using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Accès anonyme / utilisateur authentifié : à ajuster selon ton besoin (ex. lectures API).
-- Tant que le backend utilise uniquement la service_role_key, les policies ci-dessus suffisent.
