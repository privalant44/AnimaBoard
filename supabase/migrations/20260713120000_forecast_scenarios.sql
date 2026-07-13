-- Catalogue global des scénarios prévisionnels (numéro, titre, description)

create table if not exists public.forecast_scenarios (
  number integer primary key check (number > 0),
  title text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.forecast_scenarios enable row level security;

drop policy if exists "Service role full access" on public.forecast_scenarios;
create policy "Service role full access" on public.forecast_scenarios
  for all using (true) with check (true);
