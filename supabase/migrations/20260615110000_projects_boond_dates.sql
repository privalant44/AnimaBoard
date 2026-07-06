-- Dates Boond (création / dernière modification) sur les projets
alter table public.projects
  add column if not exists creation_date timestamptz,
  add column if not exists update_date timestamptz;

create index if not exists idx_projects_update_date on public.projects(update_date);
