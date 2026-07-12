-- Stage table pour reconstruire `public.deliveries` à partir des données Boond.
-- Objectif : pouvoir faire un delete/insert "propre" sur une plage d'IDs.

drop table if exists public.deliveries_stage;
create table public.deliveries_stage (like public.deliveries including all);

create index if not exists idx_deliveries_stage_project on public.deliveries_stage(project_id);
create index if not exists idx_deliveries_stage_resource on public.deliveries_stage(resource_id);

-- Autoriser l'accès service_role (scripts backend) comme pour les autres tables.
alter table public.deliveries_stage enable row level security;
drop policy if exists "Service role full access" on public.deliveries_stage;
create policy "Service role full access" on public.deliveries_stage for all using (true) with check (true);

