-- Exemples d'assignation de rôles AnimaBoard (après migration 20260604100000_app_user_roles.sql)

insert into public.app_user_roles (email, role, display_name) values
  ('admin@animaneo.fr', 'admin', 'Administrateur'),
  ('manager@animaneo.fr', 'manager', 'Manager'),
  ('commercial@animaneo.fr', 'commercial', 'Commercial'),
  ('consultant@animaneo.fr', 'consultation', 'Consultant')
on conflict (email) do update
  set role = excluded.role,
      display_name = excluded.display_name,
      updated_at = now();

-- select email, role, display_name, updated_at from public.app_user_roles order by email;
