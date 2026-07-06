import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { isAuthEnabled } from './msalConfig';
import type { AppRole, Permission } from './roles';
import { canAccessTab, hasPermission, PERMISSIONS } from './roles';
import type { AppTab } from './roles';

export type UserAccessState = {
  role: AppRole | null;
  roleLabel: string;
  permissions: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  can: (permission: Permission) => boolean;
  canTab: (tab: AppTab) => boolean;
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export function useUserAccess(enabled: boolean): UserAccessState {
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLabel, setRoleLabel] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !isAuthEnabled()) {
      setRole(null);
      setRoleLabel('');
      setPermissions(ALL_PERMISSIONS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let res = await apiFetch('/api/auth/me');
      let data = await res.json().catch(() => ({}));
      if (!res.ok && res.status === 401 && (data as { error?: string }).error === 'Authentification requise') {
        await new Promise((r) => setTimeout(r, 400));
        res = await apiFetch('/api/auth/me');
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        const detail = (data as { errorDetail?: string }).errorDetail;
        const message = (data as { error?: string }).error || 'Impossible de charger votre profil';
        setError(detail && process.env.NODE_ENV !== 'production' ? `${message} (${detail})` : message);
        setPermissions([]);
        return;
      }
      const d = data as {
        role?: AppRole;
        roleLabel?: string;
        permissions?: string[];
      };
      setRole(d.role || null);
      setRoleLabel(d.roleLabel || d.role || '');
      setPermissions(Array.isArray(d.permissions) ? d.permissions : []);
    } catch {
      setError('Impossible de joindre le serveur API');
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const can = useCallback(
    (permission: Permission) => hasPermission(permissions, permission),
    [permissions]
  );

  const canTab = useCallback(
    (tab: AppTab) => canAccessTab(permissions, tab),
    [permissions]
  );

  return { role, roleLabel, permissions, loading, error, refresh, can, canTab };
}
