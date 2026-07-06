-- Tables Besoins / Snapshot_Besoins pour historiser les opportunités.
-- Idempotent pour pouvoir être rejoué sans effet de bord.

create table if not exists public.besoins (
  id bigint primary key,
  titre text not null default '',
  date_creation timestamptz,
  date_mise_a_jour timestamptz,
  type_of text,
  synced_at timestamptz not null default now()
);

create table if not exists public.snapshot_besoins (
  snapshot_id bigserial primary key,
  id bigint not null,
  titre text not null default '',
  date_creation timestamptz,
  date_mise_a_jour timestamptz,
  type_of text,
  date_snap timestamptz not null default now()
);

create index if not exists idx_snapshot_besoins_date_snap on public.snapshot_besoins (date_snap desc);
create index if not exists idx_snapshot_besoins_id on public.snapshot_besoins (id);

alter table public.besoins enable row level security;
alter table public.snapshot_besoins enable row level security;

drop policy if exists "Service role full access" on public.besoins;
create policy "Service role full access" on public.besoins for all using (true) with check (true);

drop policy if exists "Service role full access" on public.snapshot_besoins;
create policy "Service role full access" on public.snapshot_besoins for all using (true) with check (true);
