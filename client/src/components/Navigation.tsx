import React, { useMemo } from 'react';
import './Navigation.css';
import type { AppTab } from '../auth/roles';

const NAV_ITEMS: Array<{ key: AppTab; label: string; iconPath: string }> = [
  {
    key: 'home',
    label: 'Accueil',
    iconPath:
      'M3.75 10.3a.75.75 0 0 1 .26-.57l7.5-6.5a.75.75 0 0 1 .98 0l7.5 6.5a.75.75 0 1 1-.98 1.14L18 9.95v8.05a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75V14h-2v4a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 6 18V9.95l-1.01.92a.75.75 0 0 1-1.24-.57Z',
  },
  {
    key: 'resources',
    label: 'Ressources',
    iconPath:
      'M7.25 11a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5Zm9.5 0a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5ZM3.5 18a3.5 3.5 0 0 1 3.5-3.5h.5A3.5 3.5 0 0 1 11 18v.25a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V18Zm9.5 0a3.5 3.5 0 0 1 3.5-3.5h.5a3.5 3.5 0 0 1 3.5 3.5v.25a.75.75 0 0 1-.75.75h-6a.75.75 0 0 1-.75-.75V18Z',
  },
  {
    key: 'forecast',
    label: 'Forecast',
    iconPath:
      'M4.75 18.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 1.5 0v10.26l3.12-3.12a.75.75 0 0 1 1.06 0l1.82 1.82 4.87-4.87h-2.12a.75.75 0 0 1 0-1.5h3.94a.75.75 0 0 1 .75.75v3.94a.75.75 0 0 1-1.5 0v-2.12l-5.4 5.4a.75.75 0 0 1-1.06 0L9.15 14.73l-3.87 3.87a.75.75 0 0 1-.53.22Z',
  },
  {
    key: 'report',
    label: 'Rapports',
    iconPath:
      'M5 3.75A1.75 1.75 0 0 0 3.25 5.5v13A1.75 1.75 0 0 0 5 20.25h10A1.75 1.75 0 0 0 16.75 18.5v-10a.75.75 0 0 1 1.5 0v10A3.25 3.25 0 0 1 15 21.75H5A3.25 3.25 0 0 1 1.75 18.5v-13A3.25 3.25 0 0 1 5 2.25h6.5a.75.75 0 0 1 0 1.5H5Zm5.75 5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm0 4a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm-6 0A.75.75 0 0 1 5.5 12h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Zm0-4A.75.75 0 0 1 5.5 8h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z',
  },
  {
    key: 'settings',
    label: 'Paramètres',
    iconPath:
      'M10.93 2.73a1 1 0 0 1 1.14 0l1.08.79a1 1 0 0 0 .98.11l1.28-.54a1 1 0 0 1 1.04.23l1.16 1.16a1 1 0 0 1 .23 1.04l-.54 1.28a1 1 0 0 0 .11.98l.79 1.08a1 1 0 0 1 0 1.14l-.79 1.08a1 1 0 0 0-.11.98l.54 1.28a1 1 0 0 1-.23 1.04l-1.16 1.16a1 1 0 0 1-1.04.23l-1.28-.54a1 1 0 0 0-.98.11l-1.08.79a1 1 0 0 1-1.14 0l-1.08-.79a1 1 0 0 0-.98-.11l-1.28.54a1 1 0 0 1-1.04-.23l-1.16-1.16a1 1 0 0 1-.23-1.04l.54-1.28a1 1 0 0 0-.11-.98l-.79-1.08a1 1 0 0 1 0-1.14l.79-1.08a1 1 0 0 0 .11-.98l-.54-1.28a1 1 0 0 1 .23-1.04l1.16-1.16a1 1 0 0 1 1.04-.23l1.28.54a1 1 0 0 0 .98-.11l1.08-.79Zm.57 5.02a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z',
  },
];

interface NavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  canTab?: (tab: AppTab) => boolean;
  isCollapsed?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  isCollapsed = false,
  sidebarCollapsed = false,
  onToggleSidebar,
  canTab,
}) => {
  const items = useMemo(() => {
    const visible = canTab ? NAV_ITEMS.filter((i) => canTab(i.key)) : NAV_ITEMS;
    return visible.length > 0 ? visible : NAV_ITEMS;
  }, [canTab]);

  const homeItem = items[0];
  const restItems = items.slice(1);

  if (!homeItem) return null;

  return (
    <nav className={`navigation ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div className="nav-home-row">
        {onToggleSidebar && (
          <button
            type="button"
            className="nav-button nav-button--sidebar-toggle"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Déplier la barre latérale' : 'Plier la barre latérale'}
            title={sidebarCollapsed ? 'Déplier la barre' : 'Plier la barre'}
          >
            <svg
              className={`nav-button-icon nav-button-icon--sidebar-toggle ${sidebarCollapsed ? 'is-collapsed' : 'is-expanded'}`}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M15.78 6.97a.75.75 0 0 1 0 1.06L11.81 12l3.97 3.97a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 0Z" />
              <path d="M12.78 6.97a.75.75 0 0 1 0 1.06L8.81 12l3.97 3.97a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </button>
        )}
        <button
          className={`nav-button nav-button--home ${activeTab === homeItem.key ? 'active' : ''}`}
          onClick={() => onTabChange(homeItem.key)}
          title={isCollapsed ? homeItem.label : undefined}
          aria-label={homeItem.label}
          data-testid={`nav-tab-${homeItem.key}`}
        >
          <svg className="nav-button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={homeItem.iconPath} />
          </svg>
          {!isCollapsed && <span className="nav-button-label">{homeItem.label}</span>}
        </button>
      </div>
      {restItems.map((item) => (
        <button
          key={item.key}
          className={`nav-button ${activeTab === item.key ? 'active' : ''}`}
          onClick={() => onTabChange(item.key)}
          title={isCollapsed ? item.label : undefined}
          aria-label={item.label}
          data-testid={`nav-tab-${item.key}`}
        >
          <svg className="nav-button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.iconPath} />
          </svg>
          {!isCollapsed && <span className="nav-button-label">{item.label}</span>}
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
