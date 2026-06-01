import React, { useState, useRef } from 'react';
import './Settings.css';
import { apiUrl } from '../api';
import { dispatchDataRefresh } from '../dataRefresh';

interface SettingsProps {
  onLogoChange: (logoUrl: string) => void;
  currentLogo: string | null;
}

interface ApiTestResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  errorDetails?: any;
  details?: any;
}

const Settings: React.FC<SettingsProps> = ({ onLogoChange, currentLogo }) => {
  const [logoPreview, setLogoPreview] = useState<string | null>(currentLogo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<ApiTestResult | null>(null);
  const [loadingDictionary, setLoadingDictionary] = useState(false);
  const [dictionaryData, setDictionaryData] = useState<any>(null);
  const [loadingDataFiles, setLoadingDataFiles] = useState<{ [key: string]: boolean }>({});
  const [dataFiles, setDataFiles] = useState<{ [key: string]: any }>({});
  const [syncingResources, setSyncingResources] = useState(false);
  const [syncingDeliveries, setSyncingDeliveries] = useState(false);
  const [syncingTimeReports, setSyncingTimeReports] = useState(false);
  const [syncingTimesheets, setSyncingTimesheets] = useState(false);
  const [syncingAbsences, setSyncingAbsences] = useState(false);
  const [syncingDictionary, setSyncingDictionary] = useState(false);
  const [resettingTimesheets, setResettingTimesheets] = useState(false);
  const [syncResult, setSyncResult] = useState<{ type: 'resources' | 'deliveries' | 'time-reports' | 'timesheets' | 'timesheets-reset' | 'absences' | 'dictionary' | null; success: boolean; message: string } | null>(null);

  /** Période des 3 derniers mois (YYYY-MM). */
  const getLast3MonthsRange = () => {
    const d = new Date();
    const endYear = d.getFullYear();
    const endMonth = d.getMonth() + 1;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}`;
    const startDate = new Date(endYear, endMonth - 1 - 2, 1);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const start = `${startYear}-${String(startMonth).padStart(2, '0')}`;
    return { startMonth: start, endMonth: end };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Vérifier que c'est une image
      if (!file.type.startsWith('image/')) {
        alert('Veuillez sélectionner un fichier image');
        return;
      }

      // Créer une URL de prévisualisation
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLogoPreview(result);
        // Sauvegarder dans localStorage
        localStorage.setItem('animaLogo', result);
        // Notifier le parent
        onLogoChange(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    localStorage.removeItem('animaLogo');
    onLogoChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const testBoondManagerAPI = async () => {
    setTestingApi(true);
    setApiTestResult(null);
    
    try {
      const response = await fetch(apiUrl('/api/boondmanager/test'));
      const data = await response.json();
      
      if (response.ok && data.success) {
        setApiTestResult({
          success: true,
          message: data.message || 'Connexion réussie',
          data: data.data,
          details: {
            hasCredentials: data.hasCredentials,
            apiUrl: data.apiUrl,
            totalResources: data.data?.total || data.data?.data?.length || 0
          }
        });
      } else {
        setApiTestResult({
          success: false,
          message: data.message || 'Erreur de connexion',
          error: data.error || 'Erreur inconnue',
          errorDetails: data.errorDetails,
          details: {
            hasCredentials: data.hasCredentials,
            apiUrl: data.apiUrl
          }
        });
      }
    } catch (err) {
      setApiTestResult({
        success: false,
        message: 'Erreur lors du test de l\'API',
        error: err instanceof Error ? err.message : 'Erreur inconnue'
      });
    } finally {
      setTestingApi(false);
    }
  };

  const loadDictionary = async () => {
    setLoadingDictionary(true);
    setDictionaryData(null);
    
    try {
      const response = await fetch(apiUrl('/api/boondmanager/dictionary/resources'));
      const data = await response.json();
      
      if (response.ok && data.success) {
        setDictionaryData(data);
      } else {
        setDictionaryData({ error: data.error, details: data });
      }
    } catch (err) {
      setDictionaryData({ 
        error: err instanceof Error ? err.message : 'Erreur inconnue' 
      });
    } finally {
      setLoadingDictionary(false);
    }
  };

  const loadDataFile = async (fileType: 'projects' | 'resources' | 'forecast-report') => {
    setLoadingDataFiles(prev => ({ ...prev, [fileType]: true }));
    
    try {
      const endpoint = fileType === 'forecast-report' ? '/api/data/forecast-report' : `/api/data/${fileType}`;
      const response = await fetch(apiUrl(endpoint));
      const data = await response.json();
      
      setDataFiles(prev => ({ ...prev, [fileType]: data }));
    } catch (err) {
      setDataFiles(prev => ({
        ...prev,
        [fileType]: {
          success: false,
          error: err instanceof Error ? err.message : 'Erreur inconnue'
        }
      }));
    } finally {
      setLoadingDataFiles(prev => ({ ...prev, [fileType]: false }));
    }
  };

  const syncDictionary = async () => {
    setSyncingDictionary(true);
    setSyncResult(null);

    try {
      const response = await fetch(apiUrl('/api/boondmanager/sync/dictionary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSyncResult({
          type: 'dictionary',
          success: true,
          message: data.message || 'Dictionnaire synchronisé'
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de la synchronisation du dictionnaire';
        setSyncResult({ type: 'dictionary', success: false, message: msg });
      }
    } catch (err) {
      setSyncResult({
        type: 'dictionary',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue (vérifiez que le serveur API tourne sur le port 3000)'
      });
    } finally {
      setSyncingDictionary(false);
    }
  };

  const syncResources = async () => {
    setSyncingResources(true);
    setSyncResult(null);
    
    try {
      const response = await fetch(apiUrl('/api/boondmanager/sync/resources'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSyncResult({
          type: 'resources',
          success: true,
          message: data.message || 'Synchronisation réussie'
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de la synchronisation';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'resources',
          success: false,
          message: msg + detail
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'resources',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue (vérifiez que le serveur API tourne sur le port 3000)'
      });
    } finally {
      setSyncingResources(false);
    }
  };

  const syncDeliveries = async () => {
    setSyncingDeliveries(true);
    setSyncResult(null);
    
    try {
      const response = await fetch(apiUrl('/api/boondmanager/sync/deliveries'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSyncResult({
          type: 'deliveries',
          success: true,
          message: data.message || 'Extraction réussie'
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de l\'extraction';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'deliveries',
          success: false,
          message: msg + detail
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'deliveries',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue (serveur API sur port 3000 ?)'
      });
    } finally {
      setSyncingDeliveries(false);
    }
  };

  const syncTimeReports = async () => {
    setSyncingTimeReports(true);
    setSyncResult(null);
    
    try {
      // Utiliser l'année en cours par défaut
      const currentYear = new Date().getFullYear();
      const beginDate = `${currentYear}-01-01`;
      const endDate = `${currentYear}-12-31`;
      
      const response = await fetch(apiUrl('/api/boondmanager/sync/time-reports'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          beginDate,
          endDate
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSyncResult({
          type: 'time-reports',
          success: true,
          message: data.message || 'Extraction des temps saisis réussie'
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de l\'extraction des temps saisis';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'time-reports',
          success: false,
          message: msg + detail
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'time-reports',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue'
      });
    } finally {
      setSyncingTimeReports(false);
    }
  };

  const syncTimesheets = async () => {
    setSyncingTimesheets(true);
    setSyncResult(null);
    const { startMonth, endMonth } = getLast3MonthsRange();
    try {
      const response = await fetch(apiUrl('/api/boondmanager/sync/timesheets'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startMonth,
          endMonth
        })
      });
      
      const text = await response.text();
      let data: { success?: boolean; message?: string; error?: string; errorDetail?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setSyncResult({
          type: 'timesheets',
          success: false,
          message: response.ok
            ? 'Réponse invalide du serveur'
            : `Erreur ${response.status}: le serveur n'a pas renvoyé de JSON (timeout ou erreur Vercel). Vérifiez les logs du déploiement.`
        });
        return;
      }
      
      if (response.ok && data.success) {
        setSyncResult({
          type: 'timesheets',
          success: true,
          message: data.message || 'Synchronisation des feuilles de temps réussie'
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de la synchronisation des feuilles de temps';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'timesheets',
          success: false,
          message: msg + detail
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'timesheets',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue'
      });
    } finally {
      setSyncingTimesheets(false);
    }
  };

  const syncAbsences = async () => {
    setSyncingAbsences(true);
    setSyncResult(null);
    const y = new Date().getFullYear();
    const beginDate = `${y - 1}-01-01`;
    const endDate = `${y}-12-31`;
    try {
      const response = await fetch(apiUrl('/api/boondmanager/sync/absences'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beginDate, endDate })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSyncResult({
          type: 'absences',
          success: true,
          message: data.message || 'Synchronisation des absences réussie'
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de la synchronisation des absences';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({ type: 'absences', success: false, message: msg + detail });
      }
    } catch (err) {
      setSyncResult({
        type: 'absences',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue'
      });
    } finally {
      setSyncingAbsences(false);
    }
  };

  const resetTimesheets = async () => {
    if (!window.confirm('Réinitialiser les feuilles de temps (année n-1 et n) ? Les données seront supprimées. Vous pourrez relancer une synchro (3 derniers mois) ensuite.')) return;
    setResettingTimesheets(true);
    setSyncResult(null);
    const endpoints = ['/api/timesheets-reset', '/api/data/timesheets-reset'];
    const parseResponse = async (response: Response) => {
      const text = await response.text();
      let data: { success?: boolean; message?: string; error?: string } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      return { response, data };
    };
    try {
      let response = await fetch(apiUrl(endpoints[0]), { method: 'POST' });
      if (response.status === 404 && endpoints.length > 1) {
        response = await fetch(apiUrl(endpoints[1]), { method: 'POST' });
      }
      const { response: res, data } = await parseResponse(response);
      if (res.ok && data.success) {
        setSyncResult({ type: 'timesheets-reset', success: true, message: data.message || 'Feuilles de temps réinitialisées.' });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || (res.status === 404 ? 'Route réinitialisation introuvable (404).' : `Erreur lors de la réinitialisation (HTTP ${res.status}).`);
        setSyncResult({ type: 'timesheets-reset', success: false, message: msg });
      }
    } catch (err) {
      setSyncResult({ type: 'timesheets-reset', success: false, message: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      setResettingTimesheets(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h2>Paramètres</h2>
        
        <div className="sync-buttons-section">
          <button 
            className="sync-button sync-resources-button" 
            onClick={syncResources}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary}
          >
            {syncingResources ? '⏳ Actualisation en cours...' : '🔄 Actualiser les ressources'}
          </button>

          <button
            className="sync-button sync-dictionary-button"
            onClick={syncDictionary}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary}
          >
            {syncingDictionary ? '⏳ Synchronisation en cours...' : '📖 Synchroniser le dictionnaire (libellés type / statut)'}
          </button>
          
          <button 
            className="sync-button sync-deliveries-button" 
            onClick={syncDeliveries}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary}
          >
            {syncingDeliveries ? '⏳ Extraction en cours...' : '📋 Actualiser les prestations (extract)'}
          </button>
          
          <button 
            className="sync-button sync-time-reports-button" 
            onClick={syncTimeReports}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary}
          >
            {syncingTimeReports ? '⏳ Extraction en cours...' : '⏰ Actualiser les temps saisis'}
          </button>
          
          <button 
            className="sync-button sync-timesheets-button" 
            onClick={syncTimesheets}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary || resettingTimesheets}
          >
            {syncingTimesheets ? '⏳ Synchronisation en cours...' : '📅 Synchroniser les feuilles de temps (3 derniers mois)'}
          </button>

          <button
            className="sync-button sync-absences-button"
            onClick={syncAbsences}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary || resettingTimesheets}
          >
            {syncingAbsences ? '⏳ Synchronisation en cours...' : '🏖️ Synchroniser les absences (N-1 et année en cours)'}
          </button>
          
          <button 
            className="sync-button sync-timesheets-reset-button" 
            onClick={resetTimesheets}
            disabled={syncingResources || syncingDeliveries || syncingTimeReports || syncingTimesheets || syncingAbsences || syncingDictionary || resettingTimesheets}
          >
            {resettingTimesheets ? '⏳ Réinitialisation...' : '🗑️ Réinitialiser les feuilles de temps (année n-1 et n)'}
          </button>
        </div>

        {syncResult && (
          <div className={`sync-result ${syncResult.success ? 'success' : 'error'}`}>
            <span className="sync-result-icon">
              {syncResult.success ? '✅' : '❌'}
            </span>
            <span className="sync-result-message">{syncResult.message}</span>
          </div>
        )}
        
        <div className="settings-section">
          <h3>Logo de l'entreprise</h3>
          <p className="settings-description">
            Téléchargez le logo qui sera affiché sur la page d'accueil.
          </p>
          
          <div className="logo-upload-area">
            {logoPreview ? (
              <div className="logo-preview-container">
                <img src={logoPreview} alt="Logo Anima Néo" className="logo-preview" />
                <button onClick={handleRemoveLogo} className="remove-logo-btn">
                  Supprimer le logo
                </button>
              </div>
            ) : (
              <div className="logo-upload-placeholder">
                <p>📷</p>
                <p>Aucun logo téléchargé</p>
              </div>
            )}
          </div>

          <div className="upload-controls">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              id="logo-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="logo-upload" className="upload-button">
              {logoPreview ? 'Changer le logo' : 'Télécharger un logo'}
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>Test de connexion API BoondManager</h3>
          <p className="settings-description">
            Testez la connexion à l'API BoondManager et vérifiez les données récupérées.
          </p>
          
          <button 
            className="test-api-button" 
            onClick={testBoondManagerAPI}
            disabled={testingApi}
          >
            {testingApi ? 'Test en cours...' : 'Tester la connexion API'}
          </button>

          {apiTestResult && (
            <div className={`api-test-result ${apiTestResult.success ? 'success' : 'error'}`}>
              <div className="api-test-header">
                <span className="api-test-icon">
                  {apiTestResult.success ? '✅' : '❌'}
                </span>
                <h4>{apiTestResult.success ? 'Connexion réussie' : 'Erreur de connexion'}</h4>
              </div>
              
              <div className="api-test-content">
                <p><strong>Message:</strong> {apiTestResult.message}</p>
                
                {apiTestResult.details && (
                  <div className="api-test-details">
                    <p><strong>Détails:</strong></p>
                    <ul>
                      {apiTestResult.details.hasCredentials !== undefined && (
                        <li>Credentials configurés: {apiTestResult.details.hasCredentials ? 'Oui' : 'Non'}</li>
                      )}
                      {apiTestResult.details.apiUrl && (
                        <li>URL API: {apiTestResult.details.apiUrl}</li>
                      )}
                      {apiTestResult.details.totalResources !== undefined && (
                        <li>Nombre de ressources: {apiTestResult.details.totalResources}</li>
                      )}
                    </ul>
                  </div>
                )}

                {apiTestResult.error && (
                  <div className="api-test-error">
                    <p><strong>Erreur:</strong> {apiTestResult.error}</p>
                    {apiTestResult.errorDetails && (
                      <div className="api-test-error-details">
                        <p><strong>Détails de l'erreur:</strong></p>
                        <pre className="api-test-json">
                          {JSON.stringify(apiTestResult.errorDetails, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {apiTestResult.data && (
                  <div className="api-test-data">
                    <p><strong>Données brutes (premières 2000 caractères):</strong></p>
                    <pre className="api-test-json">
                      {JSON.stringify(apiTestResult.data, null, 2).substring(0, 2000)}
                      {JSON.stringify(apiTestResult.data, null, 2).length > 2000 ? '...' : ''}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Dictionnaire Resources</h3>
          <p className="settings-description">
            Affiche le dictionnaire de la rubrique "resources" avec le mapping typeOf.
          </p>
          
          <button 
            className="test-api-button" 
            onClick={loadDictionary}
            disabled={loadingDictionary}
          >
            {loadingDictionary ? 'Chargement...' : 'Charger le dictionnaire'}
          </button>

          {dictionaryData && (
            <div className={`api-test-result ${dictionaryData.error ? 'error' : 'success'}`}>
              {dictionaryData.error ? (
                <>
                  <div className="api-test-header">
                    <span className="api-test-icon">❌</span>
                    <h4>Erreur</h4>
                  </div>
                  <div className="api-test-content">
                    <p><strong>Erreur:</strong> {dictionaryData.error}</p>
                    {dictionaryData.details && (
                      <pre className="api-test-json">
                        {JSON.stringify(dictionaryData.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="api-test-header">
                    <span className="api-test-icon">✅</span>
                    <h4>Dictionnaire Resources</h4>
                  </div>
                  <div className="api-test-content">
                    {dictionaryData.typeOfTable && dictionaryData.typeOfTable.length > 0 && (
                      <div className="dictionary-table-container">
                        <p><strong>Tableau des valeurs typeOf:</strong></p>
                        <table className="dictionary-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Label</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dictionaryData.typeOfTable.map((item: any, index: number) => (
                              <tr key={index}>
                                <td>{item.code}</td>
                                <td>{item.label}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    
                    {dictionaryData.typeOfMapping && (
                      <div className="api-test-data">
                        <p><strong>Mapping typeOf (JSON):</strong></p>
                        <pre className="api-test-json">
                          {JSON.stringify(dictionaryData.typeOfMapping, null, 2)}
                        </pre>
                      </div>
                    )}

                    {dictionaryData.resourcesDict && (
                      <div className="api-test-data">
                        <p><strong>Structure resourcesDict (premiers 3000 caractères):</strong></p>
                        <pre className="api-test-json">
                          {JSON.stringify(dictionaryData.resourcesDict, null, 2).substring(0, 3000)}
                          {JSON.stringify(dictionaryData.resourcesDict, null, 2).length > 3000 ? '...' : ''}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Consultation des données synchronisées</h3>
          <p className="settings-description">
            Consultez les données stockées dans le cache (KV) après synchronisation depuis BoondManager.
          </p>
          
          <div className="data-files-buttons">
            <button 
              className="test-api-button" 
              onClick={() => loadDataFile('projects')}
              disabled={loadingDataFiles.projects}
            >
              {loadingDataFiles.projects ? 'Chargement...' : '📦 Charger les projets'}
            </button>
            
            <button 
              className="test-api-button" 
              onClick={() => loadDataFile('resources')}
              disabled={loadingDataFiles.resources}
            >
              {loadingDataFiles.resources ? 'Chargement...' : '👥 Charger les ressources'}
            </button>
            
            <button 
              className="test-api-button" 
              onClick={() => loadDataFile('forecast-report')}
              disabled={loadingDataFiles['forecast-report']}
            >
              {loadingDataFiles['forecast-report'] ? 'Chargement...' : '📊 Charger le rapport forecast'}
            </button>
          </div>
          
          {dataFiles.projects && (
            <div className={`api-test-result ${dataFiles.projects.success ? 'success' : 'error'}`}>
              <div className="api-test-header">
                <span className="api-test-icon">{dataFiles.projects.success ? '✅' : '❌'}</span>
                <h4>Données projets</h4>
              </div>
              <div className="api-test-content">
                {dataFiles.projects.success ? (
                  <>
                    <p><strong>Nombre d'entrées:</strong> {dataFiles.projects.count}</p>
                    {Array.isArray(dataFiles.projects.data) && dataFiles.projects.data.length > 0 ? (
                      <div className="data-table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>ID Projet</th>
                              <th>Référence</th>
                              <th>Date début</th>
                              <th>Date fin</th>
                              <th>Nb prestations</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dataFiles.projects.data.map((projectData: any, index: number) => {
                              const project = projectData.project || {};
                              const attrs = project.attributes || {};
                              const deliveries = projectData.deliveries || [];
                              return (
                                <tr key={index}>
                                  <td>{project.id || projectData.id || 'N/A'}</td>
                                  <td>{attrs.reference || 'N/A'}</td>
                                  <td>{attrs.startDate ? new Date(attrs.startDate).toLocaleDateString('fr-FR') : 'N/A'}</td>
                                  <td>{attrs.endDate ? new Date(attrs.endDate).toLocaleDateString('fr-FR') : 'N/A'}</td>
                                  <td>{deliveries.length}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Aucune donnée à afficher</p>
                    )}
                  </>
                ) : (
                  <p><strong>Erreur:</strong> {dataFiles.projects.error}</p>
                )}
              </div>
            </div>
          )}

          {dataFiles.resources && (
            <div className={`api-test-result ${dataFiles.resources.success ? 'success' : 'error'}`}>
              <div className="api-test-header">
                <span className="api-test-icon">{dataFiles.resources.success ? '✅' : '❌'}</span>
                <h4>Données ressources</h4>
              </div>
              <div className="api-test-content">
                {dataFiles.resources.success ? (
                  <>
                    <p><strong>Nombre d'entrées:</strong> {dataFiles.resources.count}</p>
                    {Array.isArray(dataFiles.resources.data) && dataFiles.resources.data.length > 0 ? (
                      <div className="data-table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Nom</th>
                              <th>Prénom</th>
                              <th>Type</th>
                              <th>Statut</th>
                              <th>Visible</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dataFiles.resources.data.map((resource: any, index: number) => (
                              <tr key={index}>
                                <td>{resource.id || 'N/A'}</td>
                                <td>{resource.nom || 'N/A'}</td>
                                <td>{resource.prenom || 'N/A'}</td>
                                <td>{resource.typeOf !== null && resource.typeOf !== undefined ? resource.typeOf : 'N/A'}</td>
                                <td>{resource.state !== null && resource.state !== undefined ? resource.state : 'N/A'}</td>
                                <td>{resource.isVisible ? 'Oui' : 'Non'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Aucune donnée à afficher</p>
                    )}
                  </>
                ) : (
                  <p><strong>Erreur:</strong> {dataFiles.resources.error}</p>
                )}
              </div>
            </div>
          )}

          {dataFiles['forecast-report'] && (
            <div className={`api-test-result ${dataFiles['forecast-report'].success ? 'success' : 'error'}`}>
              <div className="api-test-header">
                <span className="api-test-icon">{dataFiles['forecast-report'].success ? '✅' : '❌'}</span>
                <h4>Données rapport forecast</h4>
              </div>
              <div className="api-test-content">
                {dataFiles['forecast-report'].success ? (
                  <>
                    <p><strong>Nombre d'entrées:</strong> {dataFiles['forecast-report'].count}</p>
                    {Array.isArray(dataFiles['forecast-report'].data) && dataFiles['forecast-report'].data.length > 0 ? (
                      <div className="data-table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Nom</th>
                              <th>Prénom</th>
                              <th>Référence</th>
                              <th>Titre</th>
                              <th>Date début</th>
                              <th>Date fin</th>
                              <th>TJM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dataFiles['forecast-report'].data.map((row: any, index: number) => (
                              <tr key={index}>
                                <td>{row.nom || 'N/A'}</td>
                                <td>{row.prenom || 'N/A'}</td>
                                <td>{row.reference || 'N/A'}</td>
                                <td>{row.titre || 'N/A'}</td>
                                <td>{row.dateDebut ? new Date(row.dateDebut).toLocaleDateString('fr-FR') : 'N/A'}</td>
                                <td>{row.dateFin ? new Date(row.dateFin).toLocaleDateString('fr-FR') : 'N/A'}</td>
                                <td>{row.tjm ? `${row.tjm} €` : 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Aucune donnée à afficher</p>
                    )}
                  </>
                ) : (
                  <p><strong>Erreur:</strong> {dataFiles['forecast-report'].error}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
