import React from 'react';
import SettingsPanelLayout from './SettingsPanelLayout';
import RoleManagement from '../RoleManagement';

interface SettingsUsersPanelProps {
  onBack: () => void;
}

const SettingsUsersPanel: React.FC<SettingsUsersPanelProps> = ({ onBack }) => (
  <SettingsPanelLayout title="Administration des utilisateurs" onBack={onBack}>
    <RoleManagement />
  </SettingsPanelLayout>
);

export default SettingsUsersPanel;
