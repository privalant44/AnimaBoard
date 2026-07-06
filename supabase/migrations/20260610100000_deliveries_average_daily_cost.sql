-- Coût journalier moyen Boond (averageDailyCost) pour le calcul de marge sur timesheets.
alter table public.deliveries
  add column if not exists average_daily_cost numeric;
