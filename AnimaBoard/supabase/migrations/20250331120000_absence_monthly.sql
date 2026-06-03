-- Absences agrégées par collaborateur (resource) et par mois calendaire (YYYY-MM)
-- Alimentée par sync Boond GET /absences

create table if not exists public.absence (
  resource_id bigint not null,
  month text not null,
  days numeric not null default 0,
  synced_at timestamptz default now(),
  primary key (resource_id, month)
);

create index if not exists idx_absence_month on public.absence (month);

alter table public.absence enable row level security;

drop policy if exists "Service role full access" on public.absence;
create policy "Service role full access" on public.absence for all using (true) with check (true);
