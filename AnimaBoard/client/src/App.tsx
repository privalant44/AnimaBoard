import React, { useState, useEffect } from 'react';
import './App.css';
import { apiFetch } from './api';
import { useAuth } from './auth/AuthProvider';
import { isAuthEnabled } from './auth/msalConfig';
import type { AppTab } from './auth/roles';
import Navigation from './components/Navigation';
import UserAccountMenu from './components/UserAccountMenu';
import Resources from './components/Resources';
import Forecast from './components/Forecast';
import Report from './components/Report';
import Settings from './components/Settings';
import HomeMonthlyRecap from './components/HomeMonthlyRecap';
import HomeBatchStatus from './components/HomeBatchStatus';

type Tab = AppTab;

function App() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  // Vérifier que l'API répond (évite "Failed to fetch" sans explication)
  useEffect(() => {
    apiFetch('/api/env-check')
      .then((res) => setApiReachable(res.ok))
      .catch(() => setApiReachable(false));
  }, []);

  // Rediriger si l'onglet actif n'est pas autorisé pour le rôle
  useEffect(() => {
    if (!isAuthEnabled() || !auth || auth.accessLoading) return;
    if (!auth.canTab(activeTab)) {
      const fallback: Tab[] = ['home', 'resources', 'forecast', 'report', 'settings'];
      const allowed = fallback.find((t) => auth.canTab(t));
      if (allowed) setActiveTab(allowed);
    }
  }, [auth, activeTab]);

  // Charger le logo depuis localStorage au démarrage
  useEffect(() => {
    const savedLogo = localStorage.getItem('animaLogo');
    if (savedLogo) {
      setLogoUrl(savedLogo);
    }
  }, []);

  const handleLogoChange = (newLogoUrl: string) => {
    setLogoUrl(newLogoUrl || null);
  };

  const handleBackToHome = () => {
    setActiveTab('home');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'resources':
        return <Resources onBack={handleBackToHome} />;
      case 'forecast':
        return <Forecast onBack={handleBackToHome} />;
      case 'report':
        return <Report onBack={handleBackToHome} />;
      case 'settings':
        return <Settings onLogoChange={handleLogoChange} currentLogo={logoUrl} />;
      case 'home':
      default:
        return <HomeMonthlyRecap />;
    }
  };

  return (
    <div className="App">
      {apiReachable === false && (
        <div style={{ background: '#c00', color: '#fff', padding: '8px 16px', textAlign: 'center' }}>
          Le serveur API ne répond pas. Lancez-le sur le port 3000 (ex. <code>npm run server</code> dans un terminal à la racine du projet).
        </div>
      )}
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="app-sidebar">
          <div className="app-sidebar-header">
            <div className="logo-container app-sidebar-logo">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo Anima Néo" className="uploaded-logo" />
              ) : (
                <>
                  <div className="logo">AN</div>
                  <div className="logo-text">Anima Néo</div>
                </>
              )}
            </div>
            {isAuthEnabled() && auth && (
              <div className="app-sidebar-user">
                <UserAccountMenu
                  compact={sidebarCollapsed}
                  displayName={auth.displayName}
                  email={auth.email}
                  roleLabel={auth.roleLabel}
                  onLogout={() => auth.logout()}
                />
              </div>
            )}
          </div>
          <Navigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isCollapsed={sidebarCollapsed}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
            canTab={auth?.canTab}
          />
        </aside>
        <section className="app-content">{renderContent()}</section>
        {activeTab === 'home' && <HomeBatchStatus />}
      </div>
    </div>
  );
}

export default App;
