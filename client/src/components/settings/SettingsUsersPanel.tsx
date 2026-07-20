import React from 'react';
import SettingsPanelLayout from './SettingsPanelLayout';
import RoleManagement from '../RoleManagement';
import RolePermissionsManagement from '../RolePermissionsManagement';
import RoleViewPreview from '../RoleViewPreview';

interface SettingsUsersPanelProps {
  onBack: () => void;
}

const SettingsUsersPanel: React.FC<SettingsUsersPanelProps> = ({ onBack }) => (
  <SettingsPanelLayout title="Administration des utilisateurs" onBack={onBack} data-testid="settings-users-panel">
    <RoleViewPreview />
    <RolePermissionsManagement />
    <RoleManagement />
  </SettingsPanelLayout>
);

export default SettingsUsersPanel;
