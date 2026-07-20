import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PERMISSIONS } from '../auth/roles';
import SettingsDataSyncPanel from './settings/SettingsDataSyncPanel';
import SettingsDiagnosticsPanel from './settings/SettingsDiagnosticsPanel';
import SettingsBatchLogsPanel from './settings/SettingsBatchLogsPanel';
import SettingsUsersPanel from './settings/SettingsUsersPanel';
import SettingsTreasuryPlanPanel from './settings/SettingsTreasuryPlanPanel';
import './Settings.css';

interface SettingsProps {
  onLogoChange: (logoUrl: string) => void;
  currentLogo: string | null;
}

type SettingsView = 'hub' | 'data-sync' | 'diagnostics' | 'batch-logs' | 'users' | 'treasury-plan';

const Settings: React.FC<SettingsProps> = ({ onLogoChange, currentLogo }) => {
  const auth = useAuth();
  const [view, setView] = useState<SettingsView>('hub');
  const [batchLogsBackView, setBatchLogsBackView] = useState<SettingsView>('hub');
  const canManageUsers = !auth || auth.can(PERMISSIONS.USERS_MANAGE);

  const openBatchLogs = (returnView: SettingsView) => {
    setBatchLogsBackView(returnView);
    setView('batch-logs');
  };

  if (view === 'data-sync') {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <SettingsDataSyncPanel
            onBack={() => setView('hub')}
            onOpenBatchLogs={() => openBatchLogs('data-sync')}
          />
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
          <SettingsBatchLogsPanel onBack={() => setView(batchLogsBackView)} />
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

  if (view === 'treasury-plan') {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <SettingsTreasuryPlanPanel onBack={() => setView('hub')} />
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
            <span className="settings-hub-card-icon" aria-hidden="true">{'\u{1F504}'}</span>
            <span className="settings-hub-card-title">Actualisation des données</span>
          </button>
          <button type="button" className="settings-hub-card" onClick={() => setView('diagnostics')}>
            <span className="settings-hub-card-icon" aria-hidden="true">{'\u{1F50D}'}</span>
            <span className="settings-hub-card-title">Tests et consultations</span>
          </button>
          <button type="button" className="settings-hub-card" onClick={() => openBatchLogs('hub')}>
            <span className="settings-hub-card-icon" aria-hidden="true">{'\u{1F4CB}'}</span>
            <span className="settings-hub-card-title">Journaux batch</span>
          </button>
          <button type="button" className="settings-hub-card" onClick={() => setView('treasury-plan')}>
            <span className="settings-hub-card-icon" aria-hidden="true">{'\u{1F4B0}'}</span>
            <span className="settings-hub-card-title">Plan de trésorerie</span>
          </button>
          {canManageUsers && (
            <button
              type="button"
              className="settings-hub-card"
              onClick={() => setView('users')}
              data-testid="settings-hub-users"
            >
              <span className="settings-hub-card-icon" aria-hidden="true">{'\u{1F465}'}</span>
              <span className="settings-hub-card-title">Administration utilisateurs</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
