import React, { useState, useEffect } from 'react';
import './App.css';
import Navigation from './components/Navigation';
import Resources from './components/Resources';
import Forecast from './components/Forecast';
import Report from './components/Report';
import Settings from './components/Settings';

type Tab = 'home' | 'resources' | 'forecast' | 'report' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
