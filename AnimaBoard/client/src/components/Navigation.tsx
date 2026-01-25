import React from 'react';
import './Navigation.css';

interface NavigationProps {
  activeTab: 'home' | 'resources' | 'forecast' | 'report' | 'settings';
  onTabChange: (tab: 'home' | 'resources' | 'forecast' | 'report' | 'settings') => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="navigation">
      <button
        className={`nav-button ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
      >
        Accueil
      </button>
      <button
        className={`nav-button ${activeTab === 'resources' ? 'active' : ''}`}
        onClick={() => onTabChange('resources')}
      >
        Ressources
      </button>
      <button
        className={`nav-button ${activeTab === 'forecast' ? 'active' : ''}`}
        onClick={() => onTabChange('forecast')}
      >
        Forecast
      </button>
      <button
        className={`nav-button ${activeTab === 'report' ? 'active' : ''}`}
        onClick={() => onTabChange('report')}
      >
        Rapports
      </button>
      <button
        className={`nav-button ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        Paramètres
      </button>
    </nav>
  );
};

export default Navigation;
