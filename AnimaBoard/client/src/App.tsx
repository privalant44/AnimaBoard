import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { apiUrl } from './api';
import Navigation from './components/Navigation';
import Resources from './components/Resources';
import Forecast from './components/Forecast';
import Report from './components/Report';
import Settings from './components/Settings';

type Tab = 'home' | 'resources' | 'forecast' | 'report' | 'settings';

/** Retourne startMonth et endMonth pour les 3 derniers mois (format YYYY-MM). */
function getLast3MonthsRange(): { startMonth: string; endMonth: string } {
  const d = new Date();
  const endYear = d.getFullYear();
  const endMonth = d.getMonth() + 1;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}`;
  const startDate = new Date(endYear, endMonth - 1 - 2, 1);
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}`;
  return { startMonth: start, endMonth: end };
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const autoSyncRan = useRef(false);

  // Vérifier que l'API répond (évite "Failed to fetch" sans explication)
  useEffect(() => {
    fetch(apiUrl('/api/health'))
      .then((res) => setApiReachable(res.ok))
      .catch(() => setApiReachable(false));
  }, []);

  // À la connexion au portail : sync automatique ressources + prestations + feuilles de temps (3 derniers mois)
  useEffect(() => {
    if (apiReachable !== true || autoSyncRan.current) return;
    autoSyncRan.current = true;
    setAutoSyncStatus('running');

    const run = async () => {
      try {
        await fetch(apiUrl('/api/boondmanager/sync/resources'), { method: 'POST' });
        await fetch(apiUrl('/api/boondmanager/sync/deliveries'), { method: 'POST' });
        const { startMonth, endMonth } = getLast3MonthsRange();
        await fetch(apiUrl('/api/boondmanager/sync/timesheets'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startMonth, endMonth })
        });
        setAutoSyncStatus('done');
      } catch {
        setAutoSyncStatus('error');
      }
    };
    run();
  }, [apiReachable]);

  // Masquer les bandeaux "done" / "error" après quelques secondes
  useEffect(() => {
    if (autoSyncStatus !== 'done' && autoSyncStatus !== 'error') return;
    const delay = autoSyncStatus === 'done' ? 5000 : 8000;
    const t = window.setTimeout(() => setAutoSyncStatus('idle'), delay);
    return () => window.clearTimeout(t);
  }, [autoSyncStatus]);

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
        return (
          <main className="app-main">
            <p className="welcome-message">Bienvenue sur votre tableau de bord</p>
          </main>
        );
    }
  };

  return (
    <div className="App">
      {apiReachable === false && (
        <div style={{ background: '#c00', color: '#fff', padding: '8px 16px', textAlign: 'center' }}>
          Le serveur API ne répond pas. Lancez-le sur le port 3000 (ex. <code>npm run server</code> dans un terminal à la racine du projet).
        </div>
      )}
      {autoSyncStatus === 'running' && (
        <div style={{ background: '#1a73e8', color: '#fff', padding: '8px 16px', textAlign: 'center' }}>
          Synchronisation automatique en cours (ressources, prestations, feuilles de temps)…
        </div>
      )}
      {autoSyncStatus === 'done' && (
        <div style={{ background: '#0d7d3d', color: '#fff', padding: '8px 16px', textAlign: 'center' }}>
          Données à jour (ressources, prestations, feuilles de temps des 3 derniers mois).
        </div>
      )}
      {autoSyncStatus === 'error' && (
        <div style={{ background: '#9e5a00', color: '#fff', padding: '8px 16px', textAlign: 'center' }}>
          Une erreur est survenue lors de la synchronisation automatique. Vous pouvez relancer manuellement depuis Paramètres.
        </div>
      )}
      {activeTab !== 'resources' && activeTab !== 'forecast' && activeTab !== 'report' && (
        <>
          <header className="app-header">
            <div className="logo-container">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo Anima Néo" className="uploaded-logo" />
              ) : (
                <>
                  <div className="logo">AN</div>
                  <div className="logo-text">Anima Néo</div>
                </>
              )}
            </div>
            <h1 className="main-title">Tableau de Bord Anima Néo</h1>
          </header>
          <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      )}
      {renderContent()}
    </div>
  );
}

export default App;
