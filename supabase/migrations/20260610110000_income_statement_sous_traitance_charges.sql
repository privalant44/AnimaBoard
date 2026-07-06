-- Charges sous-traitance (compte 6110000) pour le détail du compte de résultat.
alter table public.pennylane_income_statement_monthly
  add column if not exists sous_traitance_charges numeric not null default 0;
