-- Supprimer les tables existantes (dans cet ordre pour les dépendances)
DROP TABLE IF EXISTS public.timesheets_detail;
DROP TABLE IF EXISTS public.timesheets_aggregate;
DROP TABLE IF EXISTS public.forecast_times;
DROP TABLE IF EXISTS public.deliveries;
DROP TABLE IF EXISTS public.projects;

-- Créer la table projects
CREATE TABLE public.projects (
  id bigint PRIMARY KEY,
  reference text,
  name text,
  state int,
  start_date date,
  end_date date,
  client_name text,
  raw jsonb DEFAULT '{}',
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX idx_projects_state ON public.projects(state);

-- Créer la table deliveries
CREATE TABLE public.deliveries (
  id bigint PRIMARY KEY,
  reference text,
  title text NOT NULL DEFAULT '',
  tjm numeric,
  start_date date,
  end_date date,
  project_id bigint,
  resource_id bigint,
  resource_first_name text,
  resource_last_name text,
  state int,
  raw jsonb DEFAULT '{}',
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX idx_deliveries_project ON public.deliveries(project_id);
CREATE INDEX idx_deliveries_resource ON public.deliveries(resource_id);

-- Créer la table timesheets_detail
CREATE TABLE public.timesheets_detail (
  id serial PRIMARY KEY,
  timesheet_id bigint NOT NULL,
  resource_id bigint NOT NULL,
  resource_name text,
  month text NOT NULL,
  delivery_id bigint NOT NULL,
  total_days numeric NOT NULL DEFAULT 0,
  total_hours numeric NOT NULL DEFAULT 0,
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX idx_timesheets_detail_lookup ON public.timesheets_detail(resource_id, delivery_id, month);

-- Créer la table timesheets_aggregate
CREATE TABLE public.timesheets_aggregate (
  id serial PRIMARY KEY,
  resource_id bigint NOT NULL,
  resource_name text,
  delivery_id bigint NOT NULL,
  month text NOT NULL,
  total_days numeric NOT NULL DEFAULT 0,
  total_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(resource_id, delivery_id, month)
);
CREATE INDEX idx_timesheets_aggregate_lookup ON public.timesheets_aggregate(resource_id, delivery_id, month);

-- Créer la table forecast_times
CREATE TABLE public.forecast_times (
  delivery_id bigint NOT NULL,
  month text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (delivery_id, month)
);