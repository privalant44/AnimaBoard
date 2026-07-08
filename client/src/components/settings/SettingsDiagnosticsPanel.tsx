import React, { useRef, useState } from 'react';
import { apiFetch } from '../../api';
import { deleteCompanyLogo, uploadCompanyLogo } from '../../companyLogo';
import SettingsPanelLayout from './SettingsPanelLayout';
import '../Settings.css';

interface SettingsDiagnosticsPanelProps {
  onBack: () => void;
  onLogoChange: (url: string) => void;
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

const SettingsDiagnosticsPanel: React.FC<SettingsDiagnosticsPanelProps> = ({ onBack, onLogoChange, currentLogo }) => {
  const [logoPreview, setLogoPreview] = useState<string | null>(currentLogo);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<ApiTestResult | null>(null);
  const [loadingDictionary, setLoadingDictionary] = useState(false);
  const [dictionaryData, setDictionaryData] = useState<any>(null);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [opportunitiesData, setOpportunitiesData] = useState<any>(null);
  const [loadingDataFiles, setLoadingDataFiles] = useState<{ [key: string]: boolean }>({});
  const [dataFiles, setDataFiles] = useState<{ [key: string]: any }>({});

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner un fichier image');
      return;
    }

    setLogoUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
        reader.readAsDataURL(file);
      });

      const url = await uploadCompanyLogo(dataUrl);
      setLogoPreview(url);
      onLogoChange(url || '');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erreur lors du téléchargement du logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoUploading(true);
    try {
      await deleteCompanyLogo();
      setLogoPreview(null);
      onLogoChange('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erreur lors de la suppression du logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const testBoondManagerAPI = async () => {
    setTestingApi(true);
    setApiTestResult(null);

    try {
      const response = await apiFetch('/api/boondmanager/test');
      const data = await response.json();

      if (response.ok && data.success) {
        setApiTestResult({
          success: true,
          message: data.message || 'Connexion réussie',
          data: data.data,
          details: {
            hasCredentials: data.hasCredentials,
            apiUrl: data.apiUrl,
            totalResources: data.data?.total || data.data?.data?.length || 0,
          },
        });
      } else {
        setApiTestResult({
          success: false,
          message: data.message || 'Erreur de connexion',
          error: data.error || 'Erreur inconnue',
          errorDetails: data.errorDetails,
          details: {
            hasCredentials: data.hasCredentials,
            apiUrl: data.apiUrl,
          },
        });
      }
    } catch (err) {
      setApiTestResult({
        success: false,
        message: "Erreur lors du test de l'API",
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setTestingApi(false);
    }
  };

  const loadDictionary = async () => {
    setLoadingDictionary(true);
    setDictionaryData(null);

    try {
      const response = await apiFetch('/api/boondmanager/dictionary/resources');
      const data = await response.json();

      if (response.ok && data.success) {
        setDictionaryData(data);
      } else {
        setDictionaryData({ error: data.error, details: data });
      }
    } catch (err) {
      setDictionaryData({
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setLoadingDictionary(false);
    }
  };

  const loadOpportunities = async () => {
    setLoadingOpportunities(true);
    setOpportunitiesData(null);

    try {
      const response = await apiFetch('/api/boondmanager/opportunites');
      const data = await response.json();

      if (response.ok && data.success) {
        setOpportunitiesData(data);
      } else {
        setOpportunitiesData({
          error: data.error || data.message || 'Erreur lors du chargement des opportunités',
          details: data,
        });
      }
    } catch (err) {
      setOpportunitiesData({
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setLoadingOpportunities(false);
    }
  };

  const loadDataFile = async (fileType: 'projects' | 'resources' | 'forecast-report') => {
    setLoadingDataFiles((prev) => ({ ...prev, [fileType]: true }));

    try {
      const endpoint = fileType === 'forecast-report' ? '/api/data/forecast-report' : `/api/data/${fileType}`;
      const response = await apiFetch(endpoint);
      const data = await response.json();

      setDataFiles((prev) => ({ ...prev, [fileType]: data }));
    } catch (err) {
      setDataFiles((prev) => ({
        ...prev,
        [fileType]: {
          success: false,
          error: err instanceof Error ? err.message : 'Erreur inconnue',
        },
      }));
    } finally {
      setLoadingDataFiles((prev) => ({ ...prev, [fileType]: false }));
    }
  };

  return (
    <SettingsPanelLayout title="Tests et consultations" onBack={onBack}>
      <div className="settings-section">
        <h3>Logo de l'entreprise</h3>
        <p className="settings-description">
          Téléchargez le logo affiché pour tous les utilisateurs (connexion et menu).
        </p>

        <div className="logo-upload-area">
          {logoPreview ? (
            <div className="logo-preview-container">
              <img src={logoPreview} alt="Logo Anima Néo" className="logo-preview" />
              <button onClick={handleRemoveLogo} className="remove-logo-btn" disabled={logoUploading}>
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
            disabled={logoUploading}
            style={{ display: 'none' }}
          />
          <label htmlFor="logo-upload" className="upload-button" style={logoUploading ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
            {logoUploading ? 'Téléchargement…' : logoPreview ? 'Changer le logo' : 'Télécharger un logo'}
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>Test de connexion API BoondManager</h3>
        <p className="settings-description">
          Testez la connexion à l'API BoondManager et vérifiez les données récupérées.
        </p>

        <button className="test-api-button" onClick={testBoondManagerAPI} disabled={testingApi}>
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

        <button className="test-api-button" onClick={loadDictionary} disabled={loadingDictionary}>
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
        <h3>Opportunités BoondManager</h3>
        <p className="settings-description">
          Affiche le contenu de l’endpoint <code>/opportunites</code> de BoondManager.
        </p>

        <button className="test-api-button" onClick={loadOpportunities} disabled={loadingOpportunities}>
          {loadingOpportunities ? 'Chargement...' : 'Charger les opportunités'}
        </button>

        {opportunitiesData && (
          <div className={`api-test-result ${opportunitiesData.error ? 'error' : 'success'}`}>
            {opportunitiesData.error ? (
              <>
                <div className="api-test-header">
                  <span className="api-test-icon">❌</span>
                  <h4>Erreur</h4>
                </div>
                <div className="api-test-content">
                  <p><strong>Erreur:</strong> {opportunitiesData.error}</p>
                  {opportunitiesData.details && (
                    <pre className="api-test-json">
                      {JSON.stringify(opportunitiesData.details, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="api-test-header">
                  <span className="api-test-icon">✅</span>
                  <h4>Opportunités BoondManager</h4>
                </div>
                <div className="api-test-content">
                  <p><strong>Nombre d'entrées:</strong> {opportunitiesData.count ?? (opportunitiesData.data?.length || 0)}</p>
                  <div className="api-test-data">
                    <p><strong>Données brutes (premiers 5000 caractères):</strong></p>
                    <pre className="api-test-json">
                      {JSON.stringify(opportunitiesData.data || opportunitiesData.raw || opportunitiesData, null, 2).substring(0, 5000)}
                      {JSON.stringify(opportunitiesData.data || opportunitiesData.raw || opportunitiesData, null, 2).length > 5000 ? '...' : ''}
                    </pre>
                  </div>
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
          <button className="test-api-button" onClick={() => loadDataFile('projects')} disabled={loadingDataFiles.projects}>
            {loadingDataFiles.projects ? 'Chargement...' : '📦 Charger les projets'}
          </button>

          <button className="test-api-button" onClick={() => loadDataFile('resources')} disabled={loadingDataFiles.resources}>
            {loadingDataFiles.resources ? 'Chargement...' : '👥 Charger les ressources'}
          </button>

          <button className="test-api-button" onClick={() => loadDataFile('forecast-report')} disabled={loadingDataFiles['forecast-report']}>
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
    </SettingsPanelLayout>
  );
};

export default SettingsDiagnosticsPanel;
