-- Permissions configurables par rôle (modules et vues)
create table if not exists public.app_role_permissions (
  role text not null check (role in ('manager', 'commercial', 'consultation')),
  permission text not null,
  primary key (role, permission)
);

create index if not exists idx_app_role_permissions_role on public.app_role_permissions (role);

comment on table public.app_role_permissions is 'Cases cochées par rôle pour l''accès aux modules et vues (admin = tout, non stocké)';

alter table public.app_role_permissions enable row level security;

drop policy if exists "Service role full access" on public.app_role_permissions;
create policy "Service role full access"
  on public.app_role_permissions
  for all
  using (true)
  with check (true);

-- Valeurs par défaut alignées sur lib/roles.js ROLE_PERMISSIONS
insert into public.app_role_permissions (role, permission) values
  ('manager', 'view:home:financial'),
  ('manager', 'view:home:besoins'),
  ('manager', 'view:home:treasury'),
  ('manager', 'tab:resources'),
  ('manager', 'view:forecast:personal'),
  ('manager', 'view:forecast:scenarios'),
  ('manager', 'view:report:forecast'),
  ('manager', 'view:report:income'),
  ('commercial', 'view:home:financial'),
  ('commercial', 'view:forecast:personal'),
  ('commercial', 'view:forecast:scenarios'),
  ('commercial', 'view:report:forecast'),
  ('commercial', 'view:report:income'),
  ('consultation', 'view:forecast:personal')
on conflict (role, permission) do nothing;
