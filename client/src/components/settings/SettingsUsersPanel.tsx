import React from 'react';
import SettingsPanelLayout from './SettingsPanelLayout';
import RoleManagement from '../RoleManagement';
import RolePermissionsManagement from '../RolePermissionsManagement';

interface SettingsUsersPanelProps {
  onBack: () => void;
}

const SettingsUsersPanel: React.FC<SettingsUsersPanelProps> = ({ onBack }) => (
  <SettingsPanelLayout title="Administration des utilisateurs" onBack={onBack}>
    <RolePermissionsManagement />
    <RoleManagement />
  </SettingsPanelLayout>
);

export default SettingsUsersPanel;
