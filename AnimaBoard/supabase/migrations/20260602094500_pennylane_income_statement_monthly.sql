-- Stockage dédié des comptes de résultat Pennylane (granularité mensuelle)
create table if not exists public.pennylane_income_statement_monthly (
  year smallint not null,
  month text not null,
  produits numeric not null default 0,
  charges numeric not null default 0,
  resultat numeric not null default 0,
  entries_count integer not null default 0,
  lines_count integer not null default 0,
  ca_anima_neo numeric not null default 0,
  ca_sous_traitance numeric not null default 0,
  salaires numeric not null default 0,
  cotisations_sociales numeric not null default 0,
  autres_charges numeric not null default 0,
  by_account jsonb not null default '{}'::jsonb,
  method text not null default 'ledger_entry_lines',
  filter_accounts text not null default '',
  synced_at timestamptz not null default now(),
  primary key (year, month)
);

create index if not exists idx_pl_income_statement_year
  on public.pennylane_income_statement_monthly (year, month);

create index if not exists idx_pl_income_statement_synced_at
  on public.pennylane_income_statement_monthly (synced_at desc);

alter table public.pennylane_income_statement_monthly enable row level security;

drop policy if exists "Service role full access" on public.pennylane_income_statement_monthly;
create policy "Service role full access"
  on public.pennylane_income_statement_monthly
  for all
  using (true)
  with check (true);
