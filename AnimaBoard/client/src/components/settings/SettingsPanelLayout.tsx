import React from 'react';

interface SettingsPanelLayoutProps {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}

const SettingsPanelLayout: React.FC<SettingsPanelLayoutProps> = ({ title, onBack, children }) => (
  <div className="settings-panel">
    <button type="button" className="settings-back-button" onClick={onBack}>
      ← Retour
    </button>
    <h3 className="settings-panel-title">{title}</h3>
    {children}
  </div>
);

export default SettingsPanelLayout;
