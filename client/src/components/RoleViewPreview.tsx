import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { PERMISSIONS, ROLE_LABELS, ROLES } from '../auth/roles';
import type { AppRole } from '../auth/roles';

type PreviewTab = {
  key: string;
  label: string;
  visible: boolean;
};

type PreviewView = {
  key: string;
  label: string;
  visible: boolean;
};

type PreviewModule = {
  id: number;
  label: string;
  adminOnly?: boolean;
  visible: boolean;
  views: PreviewView[];
};

type RolePreviewResponse = {
  role?: AppRole;
  roleLabel?: string;
  permissions?: string[];
  tabs?: PreviewTab[];
  modules?: PreviewModule[];
  restrictForecastToPersonal?: boolean;
  error?: string;
};

const RoleViewPreview: React.FC = () => {
  const auth = useAuth();
  const [selectedRole, setSelectedRole] = useState<AppRole>('manager');
  const [preview, setPreview] = useState<RolePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (role: AppRole) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/auth/role-permissions/${encodeURIComponent(role)}/preview`);
      const data = (await res.json().catch(() => ({}))) as RolePreviewResponse;
      if (!res.ok) {
        setError(data.error || 'Aperçu impossible');
        setPreview(null);
        return;
      }
      setPreview(data);
    } catch {
      setError('Erreur réseau');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview(selectedRole);
  }, [loadPreview, selectedRole]);

  if (!auth?.can(PERMISSIONS.USERS_MANAGE)) return null;

  return (
    <section className="role-preview-section" data-testid="role-view-preview">
      <h3>Simulation de vue par rôle</h3>
      <p className="role-management-hint">
        Visualisez les onglets et vues accessibles pour chaque rôle, puis activez la simulation pour
        parcourir l&apos;application comme si vous aviez ce profil.
      </p>

      <div className="role-preview-toolbar">
        <label htmlFor="role-preview-role">Rôle à simuler</label>
        <select
          id="role-preview-role"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as AppRole)}
          data-testid="role-preview-role-select"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="settings-action-button"
          onClick={() => auth.startRoleSimulation(selectedRole)}
          disabled={loading}
          data-testid="role-preview-start-simulation"
        >
          Simuler ce rôle
        </button>
      </div>

      {error && <p className="role-management-error">{error}</p>}
      <p className="role-preview-note" data-testid="role-preview-window-note">
        La simulation s&apos;ouvre dans une nouvelle fenêtre du navigateur avec la vue exacte du rôle
        sélectionné.
      </p>

      {loading ? (
        <p>Chargement de l&apos;aperçu…</p>
      ) : preview ? (
        <div className="role-preview-content">
          <div className="role-preview-block">
            <h4>Onglets visibles</h4>
            <ul className="role-preview-tabs">
              {(preview.tabs || []).map((tab) => (
                <li
                  key={tab.key}
                  className={tab.visible ? 'role-preview-item--visible' : 'role-preview-item--hidden'}
                  data-testid={`role-preview-tab-${tab.key}`}
                >
                  {tab.visible ? '✓' : '✗'} {tab.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="role-preview-block">
            <h4>Modules et vues</h4>
            <div className="role-preview-modules">
              {(preview.modules || []).map((module) => (
                <fieldset
                  key={module.id}
                  className={`role-preview-module ${module.visible ? 'role-preview-module--visible' : 'role-preview-module--hidden'}`}
                  data-testid={`role-preview-module-${module.id}`}
                >
                  <legend>
                    Module {module.id} — {module.label}
                    {module.adminOnly ? ' (admins uniquement)' : ''}
                  </legend>
                  <ul className="role-preview-views">
                    {module.views.map((view) => (
                      <li
                        key={view.key}
                        className={view.visible ? 'role-preview-item--visible' : 'role-preview-item--hidden'}
                        data-testid={`role-preview-view-${view.key}`}
                      >
                        {view.visible ? '✓' : '✗'} {view.label}
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ))}
            </div>
          </div>

          {preview.restrictForecastToPersonal && (
            <p className="role-preview-note" data-testid="role-preview-forecast-note">
              Ce rôle ne voit que son forecast personnel (données filtrées par adresse e-mail).
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default RoleViewPreview;
