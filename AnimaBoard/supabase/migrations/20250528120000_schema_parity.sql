-- Parité schéma dev/prod : colonnes et tables parfois absentes si migrations partielles
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

alter table public.resources add column if not exists temps_travail text;
alter table public.resources add column if not exists statut_interne text;
alter table public.resources add column if not exists commentaires text;
alter table public.deliveries add column if not exists ordered_days numeric;

create table if not exists public.dictionnaire (
  id serial primary key,
  table_name text not null,
  column_name text not null,
  code text not null,
  label text not null,
  created_at timestamptz default now(),
  unique(table_name, column_name, code)
);

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

alter table public.dictionnaire enable row level security;
alter table public.absence enable row level security;
alter table public.french_public_holiday enable row level security;

drop policy if exists "Service role full access" on public.dictionnaire;
create policy "Service role full access" on public.dictionnaire for all using (true) with check (true);
drop policy if exists "Service role full access" on public.absence;
create policy "Service role full access" on public.absence for all using (true) with check (true);
drop policy if exists "Service role full access" on public.french_public_holiday;
create policy "Service role full access" on public.french_public_holiday for all using (true) with check (true);
