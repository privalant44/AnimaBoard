-- Renomme total_days -> total_days_prod et ajoute total_days_int
-- pour distinguer jours production vs non-production.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timesheets_detail'
      and column_name = 'total_days'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timesheets_detail'
      and column_name = 'total_days_prod'
  ) then
    alter table public.timesheets_detail
      rename column total_days to total_days_prod;
  end if;
end $$;

alter table public.timesheets_detail
  add column if not exists total_days_prod numeric not null default 0;

alter table public.timesheets_detail
  add column if not exists total_days_int numeric not null default 0;
