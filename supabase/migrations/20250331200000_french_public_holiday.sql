-- Jours fériés France métropole (remplies par scripts/seed-french-holidays.js)

create table if not exists public.french_public_holiday (
  holiday_date date not null primary key,
  label text not null default '',
  year smallint not null
);

create index if not exists idx_french_public_holiday_year on public.french_public_holiday (year);

alter table public.french_public_holiday enable row level security;

drop policy if exists "Service role full access" on public.french_public_holiday;
create policy "Service role full access" on public.french_public_holiday for all using (true) with check (true);
