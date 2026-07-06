import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { PERMISSIONS } from '../auth/roles';
import type { AppRole } from '../auth/roles';

type UserRow = {
  email: string;
  role: AppRole;
  display_name?: string | null;
};

const RoleManagement: React.FC = () => {
  const auth = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('consultation');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/users');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Chargement impossible');
        return;
      }
      setUsers((data as { users?: UserRow[] }).users || []);
      setRoles((data as { roles?: AppRole[] }).roles || []);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!auth?.can(PERMISSIONS.USERS_MANAGE)) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, displayName: displayName || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Enregistrement impossible');
        return;
      }
      setEmail('');
      setDisplayName('');
      await load();
      await auth.refreshAccess();
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userEmail: string) => {
    if (!window.confirm(`Retirer le rôle pour ${userEmail} ?`)) return;
    try {
      const res = await apiFetch(`/api/auth/users/${encodeURIComponent(userEmail)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || 'Suppression impossible');
        return;
      }
      await load();
    } catch {
      setError('Erreur réseau');
    }
  };

  return (
    <section className="role-management-section">
      <h3>Utilisateurs et rôles</h3>
      <p className="role-management-hint">
        Associez chaque adresse e-mail Microsoft à un rôle. Sans entrée, le rôle par défaut (
        <code>consultation</code>) s&apos;applique.
      </p>

      <form className="role-management-form" onSubmit={handleSave}>
        <input
          type="email"
          placeholder="email@animaneo.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Nom affiché (optionnel)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {(roles.length ? roles : ['admin', 'manager', 'commercial', 'consultation']).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Ajouter / modifier'}
        </button>
      </form>

      {error && <p className="role-management-error">{error}</p>}

      {loading ? (
        <p>Chargement…</p>
      ) : (
        <table className="role-management-table">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Rôle</th>
              <th>Nom</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4}>Aucun utilisateur enregistré.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.email}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.display_name || '—'}</td>
                  <td>
                    <button type="button" onClick={() => handleDelete(u.email)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default RoleManagement;
