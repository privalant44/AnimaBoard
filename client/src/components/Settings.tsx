import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PERMISSIONS } from '../auth/roles';
import SettingsDataSyncPanel from './settings/SettingsDataSyncPanel';
import SettingsDiagnosticsPanel from './settings/SettingsDiagnosticsPanel';
import SettingsBatchLogsPanel from './settings/SettingsBatchLogsPanel';
import SettingsUsersPanel from './settings/SettingsUsersPanel';
import './Settings.css';

interface SettingsProps {
  onLogoChange: (logoUrl: string) => void;
  currentLogo: string | null;
}

type SettingsView = 'hub' | 'data-sync' | 'diagnostics' | 'batch-logs' | 'users';

const Settings: React.FC<SettingsProps> = ({ onLogoChange, currentLogo }) => {
  const auth = useAuth();
  const [view, setView] = useState<SettingsView>('hub');
  const canManageUsers = !auth || auth.can(PERMISSIONS.USERS_MANAGE);

  if (view === 'data-sync') {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <SettingsDataSyncPanel onBack={() => setView('hub')} />
        </div>
      </div>
    );
  }

  if (view === 'diagnostics') {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <SettingsDiagnosticsPanel
            onBack={() => setView('hub')}
            onLogoChange={onLogoChange}
            currentLogo={currentLogo}
          />
        </div>
      </div>
    );
  }

  if (view === 'batch-logs') {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <SettingsBatchLogsPanel onBack={() => setView('hub')} />
        </div>
      </div>
    );
  }

  if (view === 'users') {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <SettingsUsersPanel onBack={() => setView('hub')} />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h2>Paramètres</h2>
        <div className="settings-hub-grid">
          <button type="button" className="settings-hub-card" onClick={() => setView('data-sync')}>
            <span className="settings-hub-card-icon" aria-hidden="true">🔄</span>
            <span className="settings-hub-card-title">Actualisation des données</span>
          </button>
          <button type="button" className="settings-hub-card" onClick={() => setView('diagnostics')}>
            <span className="settings-hub-card-icon" aria-hidden="true">🔍</span>
            <span className="settings-hub-card-title">Tests et consultations</span>
          </button>
          <button type="button" className="settings-hub-card" onClick={() => setView('batch-logs')}>
            <span className="settings-hub-card-icon" aria-hidden="true">📋</span>
            <span className="settings-hub-card-title">Journaux batch</span>
          </button>
          {canManageUsers && (
            <button type="button" className="settings-hub-card" onClick={() => setView('users')}>
              <span className="settings-hub-card-icon" aria-hidden="true">👥</span>
              <span className="settings-hub-card-title">Administration utilisateurs</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
