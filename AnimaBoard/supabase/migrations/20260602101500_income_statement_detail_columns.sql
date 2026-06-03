-- Détail structure compte de résultat stocké par mois
alter table public.pennylane_income_statement_monthly
  add column if not exists ca_anima_neo numeric not null default 0,
  add column if not exists ca_sous_traitance numeric not null default 0,
  add column if not exists salaires numeric not null default 0,
  add column if not exists cotisations_sociales numeric not null default 0,
  add column if not exists autres_charges numeric not null default 0;

create index if not exists idx_pl_income_statement_year_month_detail
  on public.pennylane_income_statement_monthly (year, month);
