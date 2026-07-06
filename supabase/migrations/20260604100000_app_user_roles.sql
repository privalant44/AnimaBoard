-- Rôles applicatifs par e-mail (Microsoft Entra ID ou compte local mappé).
-- Rôles : admin, manager, commercial, consultation

create table if not exists public.app_user_roles (
  email text primary key,
  role text not null check (role in ('admin', 'manager', 'commercial', 'consultation')),
  display_name text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_user_roles_role on public.app_user_roles (role);

comment on table public.app_user_roles is 'Rôle AnimaBoard par adresse e-mail de connexion';

alter table public.app_user_roles enable row level security;

drop policy if exists "Service role full access" on public.app_user_roles;
create policy "Service role full access"
  on public.app_user_roles
  for all
  to service_role
  using (true)
  with check (true);

-- Exemples (adapter les e-mails) :
-- insert into public.app_user_roles (email, role, display_name) values
--   ('p.rivalant@animaneo.fr', 'admin', 'Philippe'),
--   ('manager@animaneo.fr', 'manager', 'Manager'),
--   ('commercial@animaneo.fr', 'commercial', 'Commercial'),
--   ('consultant@animaneo.fr', 'consultation', 'Consultant')
-- on conflict (email) do update set role = excluded.role, display_name = excluded.display_name, updated_at = now();
