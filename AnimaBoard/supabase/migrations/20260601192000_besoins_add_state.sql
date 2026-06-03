-- Ajoute la colonne state aux tables besoins et snapshot_besoins.
-- Idempotent pour bases déjà migrées.

alter table public.besoins
  add column if not exists state text;

alter table public.snapshot_besoins
  add column if not exists state text;
