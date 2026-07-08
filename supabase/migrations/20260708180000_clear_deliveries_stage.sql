-- Vidage fiable de deliveries_stage (PostgREST n'autorise pas DELETE sans filtre exploitable partout).
create or replace function public.clear_deliveries_stage()
returns void
language sql
security definer
set search_path = public
as $$
  truncate table public.deliveries_stage;
$$;
