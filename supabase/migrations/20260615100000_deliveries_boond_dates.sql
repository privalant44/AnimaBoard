-- Dates Boond (création / dernière modification) sur les prestations
alter table public.deliveries
  add column if not exists creation_date timestamptz,
  add column if not exists update_date timestamptz;

create index if not exists idx_deliveries_update_date on public.deliveries(update_date);
