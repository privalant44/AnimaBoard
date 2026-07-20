import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { PERMISSIONS } from '../auth/roles';
import type { AppRole, ModuleDefinition, Permission } from '../auth/roles';

type MatrixResponse = {
  roles?: AppRole[];
  modules?: ModuleDefinition[];
  matrix?: Record<string, string[]>;
};

const RolePermissionsManagement: React.FC = () => {
  const auth = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [selectedRole, setSelectedRole] = useState<AppRole>('manager');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/role-permissions');
      const data = (await res.json().catch(() => ({}))) as MatrixResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Chargement impossible');
        return;
      }
      const nextRoles = (data.roles || []).filter((r) => r !== 'admin');
      setRoles(nextRoles);
      setModules(data.modules || []);
      setMatrix(data.matrix || {});
      if (nextRoles.length > 0 && !nextRoles.includes(selectedRole)) {
        setSelectedRole(nextRoles[0]);
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    load();
  }, [load]);

  if (!auth?.can(PERMISSIONS.USERS_MANAGE)) return null;

  const editableRoles = roles.length ? roles : (['manager', 'commercial', 'consultation'] as AppRole[]);
  const rolePermissions = new Set(matrix[selectedRole] || []);

  const togglePermission = (permission: Permission) => {
    const next = new Set(rolePermissions);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    setMatrix((prev) => ({ ...prev, [selectedRole]: Array.from(next) }));
    setSavedMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await apiFetch(`/api/auth/role-permissions/${encodeURIComponent(selectedRole)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: matrix[selectedRole] || [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Enregistrement impossible');
        return;
      }
      setSavedMessage('Permissions enregistrées.');
      await load();
      await auth.refreshAccess();
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="role-permissions-section" data-testid="role-permissions-panel">
      <h3>Accès modules et vues par rôle</h3>
      <p className="role-management-hint">
        Cochez les modules et vues accessibles pour chaque rôle. Le profil{' '}
        <strong>administrateur</strong> voit toujours l&apos;ensemble de l&apos;application (module 5
        réservé aux admins).
      </p>

      <div className="role-permissions-toolbar">
        <label htmlFor="role-permissions-role">Rôle</label>
        <select
          id="role-permissions-role"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as AppRole)}
          data-testid="role-permissions-role-select"
        >
          {editableRoles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {error && <p className="role-management-error">{error}</p>}
      {savedMessage && <p className="role-management-success">{savedMessage}</p>}

      {loading ? (
        <p>Chargement…</p>
      ) : (
        <div className="role-permissions-modules">
          {modules.map((module) => (
            <fieldset key={module.id} className="role-permissions-module" data-testid={`module-${module.id}`}>
              <legend>
                Module {module.id} — {module.label}
                {module.adminOnly ? ' (admins uniquement)' : ''}
              </legend>
              {module.adminOnly ? (
                <p className="role-permissions-admin-note">
                  Non configurable : réservé au profil administrateur.
                </p>
              ) : (
                <ul className="role-permissions-list">
                  {module.permissions.map((entry) => (
                    <li key={entry.key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={rolePermissions.has(entry.key)}
                          onChange={() => togglePermission(entry.key)}
                          data-testid={`permission-${selectedRole}-${entry.key}`}
                        />
                        {entry.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ))}
        </div>
      )}
    </section>
  );
};

export default RolePermissionsManagement;
