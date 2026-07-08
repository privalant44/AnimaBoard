-- Commentaire libre sur les prestations prévisionnelles manuelles

alter table public.planned_deliveries
  add column if not exists description text;
