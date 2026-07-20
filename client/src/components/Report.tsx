import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './Report.css';
import { apiFetch } from '../api';
import { DATA_REFRESH_EVENT } from '../dataRefresh';
import { useUserAccess } from '../auth/useUserAccess';
import { PERMISSIONS } from '../auth/roles';
import { isAuthEnabled } from '../auth/msalConfig';
import {
  buildScenarioFilterOptions,
  formatPlannedScenarioFilterLabel,
  getPlannedDaysForMonth,
  parseScenarioFilter,
  type PlannedForecastItem,
} from '../utils/plannedScenarios';
import { hasDateRetourPrevisionnelle, isMonthBeforeProvisionalReturn } from '../utils/resourceStatus';
import { getActiveReturnDate, type ResourceMetadataEntry } from '../utils/resourceReturnDate';

interface Project {
  id: string | number;
  reference: string;
  title: string;
  startDate: string;
  endDate: string;
  tjm: number | null;
  orderedDays?: number | null;
}

interface ResourceWithProjects {
  id: number;
  nom: string;
  prenom: string;
  type?: string;
  statut?: string;
  projects: Project[];
}

interface ForecastData {
  [deliveryId: string]: {
    forecast: { [month: string]: number };
  };
}

interface ReportProps {
  onBack: () => void;
  initialReport?: ReportSection;
}

type ReportSection = 'menu' | 'forecast-year' | 'pennylane-pl';

interface IncomeStatementRow {
  month: string;
  produits: number;
  charges: number;
  resultat: number;
  entriesCount?: number;
  caAnimaNeo: number;
  caSousTraitance: number;
  salaires: number;
  cotisationsSociales: number;
  autresCharges: number;
  dontSousTraitance: number;
}

interface IncomeStatementResponse {
  year: number;
  source: string;
  method: string;
  filterAccounts?: string;
  description: string;
  comments?: string;
  monthly: IncomeStatementRow[];
  totals: Omit<IncomeStatementRow, 'month' | 'entriesCount'>;
  counts: { months: number; ledgerLinesClass6Or7?: number };
  lastSyncAt?: string | null;
}

// Fonction pour charger les filtres depuis localStorage
const loadReportFiltersFromStorage = () => {
  try {
    const savedTypeFilter = localStorage.getItem('report_typeFilter');
    const savedStatutFilter = localStorage.getItem('report_statutFilter');
    const savedScenarioFilter = localStorage.getItem('report_scenarioFilter');
    
    return {
      typeFilter: savedTypeFilter ? JSON.parse(savedTypeFilter) : [],
      statutFilter: savedStatutFilter ? JSON.parse(savedStatutFilter) : [],
      scenarioFilter: savedScenarioFilter || 'none',
    };
  } catch (error) {
    console.error('Erreur lors du chargement des filtres depuis localStorage:', error);
    return {
      typeFilter: [],
      statutFilter: [],
      scenarioFilter: 'none',
    };
  }
};

const Report: React.FC<ReportProps> = ({ onBack, initialReport }) => {
  const userAccess = useUserAccess(isAuthEnabled());
  const canViewForecastReport =
    !isAuthEnabled() || userAccess.canView(PERMISSIONS.VIEW_REPORT_FORECAST);
  const canViewPennylane =
    !isAuthEnabled() ||
    userAccess.canView(PERMISSIONS.VIEW_REPORT_INCOME) ||
    userAccess.can(PERMISSIONS.DATA_FINANCE);

  // Charger les filtres depuis localStorage au démarrage
  const savedFilters = loadReportFiltersFromStorage();
  
  const [resources, setResources] = useState<ResourceWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData>({});
  const [timesheetsAggregate, setTimesheetsAggregate] = useState<{
    [resourceId: string]: {
      [deliveryId: string]: {
        [month: string]: { days: number; hours: number };
      };
    };
  }>({});
  const [plannedDeliveriesByResource, setPlannedDeliveriesByResource] = useState<{
    [resourceId: string]: PlannedForecastItem[];
  }>({});
  const [resourcesMetadata, setResourcesMetadata] = useState<Record<number, ResourceMetadataEntry>>({});
  
  // États pour les filtres
  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters.typeFilter);
  const [statutFilter, setStatutFilter] = useState<string[]>(savedFilters.statutFilter);
  const [scenarioFilter, setScenarioFilter] = useState<string>(savedFilters.scenarioFilter);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [statutDropdownOpen, setStatutDropdownOpen] = useState<boolean>(false);
  const [activeReport, setActiveReport] = useState<ReportSection>(initialReport || 'menu');
  const [plYear, setPlYear] = useState<number>(() => new Date().getFullYear());
  const [plData, setPlData] = useState<IncomeStatementResponse | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plError, setPlError] = useState<string | null>(null);
  const [plRefreshing, setPlRefreshing] = useState(false);
  const [plProduitsDetailOpen, setPlProduitsDetailOpen] = useState(true);
  const [plChargesDetailOpen, setPlChargesDetailOpen] = useState(true);
  const [snapBesoinsLoading, setSnapBesoinsLoading] = useState(false);
  const [snapBesoinsStatus, setSnapBesoinsStatus] = useState<string | null>(null);
  const [snapBesoinsError, setSnapBesoinsError] = useState<string | null>(null);
  const [dictionaryFilterOptions, setDictionaryFilterOptions] = useState<{ types: string[]; states: string[] }>({
    types: [],
    states: [],
  });

  // Obtenir tous les mois de l'année en cours
  const getCurrentYearMonths = (): string[] => {
    const currentYear = new Date().getFullYear();
    const months: string[] = [];
    for (let month = 1; month <= 12; month++) {
      months.push(`${currentYear}-${String(month).padStart(2, '0')}`);
    }
    return months;
  };

  // Charger toutes les données utiles à la vue Report en un seul appel.
  const loadResourcesMetadata = useCallback(async () => {
    try {
      const response = await apiFetch('/api/data/resources-metadata');
      if (!response.ok) return;
      const result = await response.json();
      if (result.success && result.data) {
        const metadata: Record<number, ResourceMetadataEntry> = {};
        Object.keys(result.data).forEach((key) => {
          metadata[Number(key)] = result.data[key];
        });
        setResourcesMetadata(metadata);
      }
    } catch (error) {
      console.warn('⚠️  Impossible de charger les métadonnées des ressources:', error);
    }
  }, []);

  const loadReportBootstrap = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const bootstrapResponse = await apiFetch('/api/data/forecast-bootstrap');
      const bootstrapBody = await bootstrapResponse.json().catch(() => ({}));
      if (!bootstrapResponse.ok || !bootstrapBody?.success) {
        throw new Error(bootstrapBody?.error || 'Impossible de charger les données Report.');
      }

      const payload = bootstrapBody.data || {};
      const resourcesList = Array.isArray(payload.resourcesLocal) ? payload.resourcesLocal : [];
      const deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];
      const dictOpts = payload.dictionaryOptions || {};
      setDictionaryFilterOptions({
        types: Array.isArray(dictOpts.types) ? dictOpts.types : [],
        states: Array.isArray(dictOpts.states) ? dictOpts.states : [],
      });

      // Forecast prévisionnel déjà indexé par deliveryId.
      const forecastTimes = payload.forecastByDeliveryId || {};
      setForecastData(
        Object.keys(forecastTimes).reduce((acc: ForecastData, deliveryId: string) => {
          acc[String(deliveryId)] = { forecast: forecastTimes[deliveryId] || {} };
          return acc;
        }, {})
      );

      // Agrégat saisi déjà indexé par resourceId/deliveryId/mois.
      setTimesheetsAggregate(payload.timesheetsAggregate || {});
      setPlannedDeliveriesByResource(payload.plannedDeliveriesByResource || {});

      // Grouper les prestations par ressource
      const deliveriesByResource: { [key: string]: Project[] } = {};
      deliveries.forEach((delivery: any) => {
        const resourceId = String(delivery.resourceId || delivery.resource_id || '');
        if (!resourceId) return;

        const project: Project = {
          id: delivery.id,
          reference: delivery.id || 'N/A',
          title: delivery.title || 'Sans titre',
          startDate: delivery.startDate || '',
          endDate: delivery.endDate || '',
          tjm: delivery.tjm !== null && delivery.tjm !== undefined
            ? Number(delivery.tjm)
            : (delivery.averageDailyPriceExcludingTax !== null && delivery.averageDailyPriceExcludingTax !== undefined
              ? Number(delivery.averageDailyPriceExcludingTax)
              : null),
          orderedDays: delivery.orderedDays !== null && delivery.orderedDays !== undefined && !isNaN(Number(delivery.orderedDays))
            ? Number(delivery.orderedDays)
            : null
        };

        if (!deliveriesByResource[resourceId]) {
          deliveriesByResource[resourceId] = [];
        }
        deliveriesByResource[resourceId].push(project);
      });

      // Créer la liste de TOUTES les ressources (avec ou sans prestations)
      const resourcesWithProjects: ResourceWithProjects[] = resourcesList.map((resource: any) => {
        const resourceId = String(resource.id || '');
        const firstName = resource.prenom || resource.firstName || '';
        const lastName = resource.nom || resource.lastName || '';
        
        // typeLabel et stateLabel sont déjà résolus par /resources-local
        const type = resource.typeLabel || '';
        const statut = resource.stateLabel || '';
        
        // Récupérer les prestations de cette ressource (peut être vide)
        const projects = deliveriesByResource[resourceId] || [];
        
        return {
          id: Number(resourceId),
          nom: lastName,
          prenom: firstName,
          type,
          statut,
          projects
        };
      });

      // Trier par nom de famille puis prénom
      resourcesWithProjects.sort((a, b) => {
        if (a.nom !== b.nom) {
          return a.nom.localeCompare(b.nom);
        }
        return a.prenom.localeCompare(b.prenom);
      });

      console.log(`📊 ${resourcesWithProjects.length} ressources affichées (toutes)`);
      setResources(resourcesWithProjects);
    } catch (err) {
      console.error('❌ Erreur lors du chargement des données:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReportBootstrapRef = useRef(loadReportBootstrap);
  const loadResourcesMetadataRef = useRef(loadResourcesMetadata);
  loadReportBootstrapRef.current = loadReportBootstrap;
  loadResourcesMetadataRef.current = loadResourcesMetadata;

  useEffect(() => {
    if (!initialReport) return;
    setActiveReport(initialReport);
  }, [initialReport]);

  useEffect(() => {
    const onRefresh = () => {
      void loadReportBootstrapRef.current();
      void loadResourcesMetadataRef.current();
    };
    window.addEventListener(DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onRefresh);
  }, []);

  useEffect(() => {
    void loadReportBootstrap();
    void loadResourcesMetadata();
  }, [loadReportBootstrap, loadResourcesMetadata]);

  const loadIncomeStatement = useCallback(
    async (forceSync = false) => {
      if (activeReport !== 'pennylane-pl') return;
      setPlLoading(true);
      setPlError(null);
      try {
        if (forceSync) {
          const syncResponse = await apiFetch('/api/dashboard/income-statement/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const syncBody = await syncResponse.json().catch(() => ({}));
          if (!syncResponse.ok) {
            const detail =
              (syncBody && (syncBody.errorDetail || syncBody.error)) || `Erreur ${syncResponse.status}`;
            throw new Error(detail);
          }
        }
        const response = await apiFetch(`/api/dashboard/income-statement?year=${plYear}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((body && (body.errorDetail || body.error)) || `Erreur ${response.status}`);
        }
        setPlData(body as IncomeStatementResponse);
      } catch (e) {
        setPlData(null);
        setPlError(e instanceof Error ? e.message : 'Erreur lors du chargement');
      } finally {
        setPlLoading(false);
      }
    },
    [activeReport, plYear]
  );

  useEffect(() => {
    void loadIncomeStatement(false);
  }, [loadIncomeStatement]);

  const handleRefreshIncomeStatement = useCallback(async () => {
    try {
      setPlRefreshing(true);
      await loadIncomeStatement(true);
    } finally {
      setPlRefreshing(false);
    }
  }, [loadIncomeStatement]);

  const handleSnapBesoins = useCallback(async () => {
    try {
      setSnapBesoinsLoading(true);
      setSnapBesoinsError(null);
      setSnapBesoinsStatus('Traitement en cours...');

      const response = await apiFetch('/api/boondmanager/sync/besoins/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || body?.message || `Erreur ${response.status}`);
      }

      const syncedCount = Number(body?.details?.syncedCount ?? 0);
      setSnapBesoinsStatus(`Sync OK (${syncedCount} besoins).`);
    } catch (e) {
      console.error('❌ Erreur sync besoins:', e);
      setSnapBesoinsStatus(null);
      setSnapBesoinsError(e instanceof Error ? e.message : 'Erreur lors de la synchronisation');
    } finally {
      setSnapBesoinsLoading(false);
    }
  }, []);

  // Sauvegarder les filtres dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem('report_typeFilter', JSON.stringify(typeFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre type:', error);
    }
  }, [typeFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('report_statutFilter', JSON.stringify(statutFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre statut:', error);
    }
  }, [statutFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('report_scenarioFilter', scenarioFilter);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre scénario:', error);
    }
  }, [scenarioFilter]);

  const parsedScenarioFilter = useMemo(() => parseScenarioFilter(scenarioFilter), [scenarioFilter]);

  const scenarioOptions = useMemo(() => {
    const set = new Set<number>();
    Object.values(plannedDeliveriesByResource).forEach((items) => {
      items.forEach((item) => set.add(item.scenario));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [plannedDeliveriesByResource]);

  useEffect(() => {
    if (scenarioFilter === 'none') return;
    const n = parseInt(scenarioFilter, 10);
    if (!Number.isFinite(n) || !scenarioOptions.includes(n)) {
      setScenarioFilter('none');
    }
  }, [scenarioFilter, scenarioOptions]);

  const scenarioFilterSelectOptions = useMemo(
    () => buildScenarioFilterOptions(scenarioOptions.length ? Math.max(...scenarioOptions) : 0),
    [scenarioOptions]
  );

  // Filtrer les ressources par type et statut
  const filteredResources = useMemo(() => {
    let filtered = resources;

    // Appliquer le filtre par type (multi-sélection)
    if (typeFilter.length > 0) {
      filtered = filtered.filter(r => {
        const resourceType = r.type || '';
        return typeFilter.includes(resourceType);
      });
    }

    // Appliquer le filtre par statut (multi-sélection)
    if (statutFilter.length > 0) {
      filtered = filtered.filter(r => {
        const resourceStatut = r.statut || '';
        return statutFilter.includes(resourceStatut);
      });
    }

    return filtered;
  }, [resources, typeFilter, statutFilter]);

  // Obtenir la liste unique des types pour le filtre
  const uniqueTypes = useMemo(() => {
    const set = new Set<string>(dictionaryFilterOptions.types);
    resources.forEach((r) => {
      if (r.type) set.add(r.type);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [resources, dictionaryFilterOptions.types]);

  const uniqueStatuts = useMemo(() => {
    const set = new Set<string>(dictionaryFilterOptions.states);
    resources.forEach((r) => {
      if (r.statut) set.add(r.statut);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [resources, dictionaryFilterOptions.states]);

  // Fermer les dropdowns quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.filter-dropdown-container')) {
        setTypeDropdownOpen(false);
        setStatutDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Jours saisis uniquement (sans prévisionnel Boond ni scénarios manuels)
  const getActualDays = (resourceId: number, month: string): number => {
    const resourceIdStr = String(resourceId);
    let totalActual = 0;
    const resourceData = timesheetsAggregate[resourceIdStr];
    if (resourceData) {
      Object.keys(resourceData).forEach((deliveryId) => {
        const deliveryData = resourceData[deliveryId];
        if (deliveryData && deliveryData[month]) {
          totalActual += deliveryData[month].days || 0;
        }
      });
    }
    return totalActual;
  };

  // Calculer la valeur totale (saisis + prévisionnels Boond + scénarios manuels) pour une ressource et un mois
  const getTotalValue = (resourceId: number, month: string): number => {
    const resource = resources.find(r => r.id === resourceId);
    let totalActual = getActualDays(resourceId, month);
    let totalForecast = 0;

    if (resource && resource.projects) {
      resource.projects.forEach((project) => {
        const deliveryId = String(project.id);
        const deliveryForecast = forecastData[deliveryId];
        if (deliveryForecast && deliveryForecast.forecast) {
          totalForecast += deliveryForecast.forecast[month] || 0;
        }
      });
    }

    const plannedDays = getPlannedDaysForMonth(
      plannedDeliveriesByResource[String(resourceId)],
      month,
      parsedScenarioFilter
    );

    return totalActual + totalForecast + plannedDays;
  };

  const shouldGrayCell = (resource: ResourceWithProjects, month: string): boolean => {
    if (!hasDateRetourPrevisionnelle(resource.statut)) return false;
    const returnDate = getActiveReturnDate(resource.statut, resourcesMetadata[resource.id]);
    if (!returnDate || !isMonthBeforeProvisionalReturn(month, returnDate)) return false;
    return getActualDays(resource.id, month) === 0;
  };

  // Fonction pour convertir hex en RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  // Fonction pour calculer la luminosité relative d'une couleur RGB (0-1)
  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((val) => {
      const channel = val / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const isDarkColor = (color: string): boolean => {
    const rgb = hexToRgb(color);
    return getLuminance(rgb.r, rgb.g, rgb.b) < 0.5;
  };

  // Échelle fixe — synthèse forecast (jours saisis + prévisionnels)
  const getCellColor = (value: number): string => {
    if (value <= 4) return '#EE423F';
    if (value <= 9) return '#FAC7C6';
    if (value <= 14) return '#FFBD2E';
    return '#B1E8E6';
  };

  // Formater le nom du mois
  const formatMonthName = (month: string): string => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString('fr-FR', { month: 'short' });
  };

  const formatCurrencyPl = (value: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatDateTimeFr = (value: string | null | undefined): string => {
    if (!value) return 'Non disponible';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Non disponible';
    return d.toLocaleString('fr-FR');
  };

  const months = getCurrentYearMonths();

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Rapports</h2>
          <div className="report-header-actions">
            {snapBesoinsError ? (
              <span className="snap-besoins-status snap-besoins-status--error">{snapBesoinsError}</span>
            ) : (
              snapBesoinsStatus && <span className="snap-besoins-status">{snapBesoinsStatus}</span>
            )}
            <button
              type="button"
              className="snap-besoins-button"
              onClick={() => void handleSnapBesoins()}
              disabled={snapBesoinsLoading}
            >
              {snapBesoinsLoading ? 'Sync Besoins...' : 'Sync Besoins'}
            </button>
          </div>
        </div>
        <div className="report-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Chargement des données...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-page">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Rapports</h2>
          <div className="report-header-actions">
            {snapBesoinsError ? (
              <span className="snap-besoins-status snap-besoins-status--error">{snapBesoinsError}</span>
            ) : (
              snapBesoinsStatus && <span className="snap-besoins-status">{snapBesoinsStatus}</span>
            )}
            <button
              type="button"
              className="snap-besoins-button"
              onClick={() => void handleSnapBesoins()}
              disabled={snapBesoinsLoading}
            >
              {snapBesoinsLoading ? 'Sync Besoins...' : 'Sync Besoins'}
            </button>
          </div>
        </div>
        <div className="report-container">
          <div className="error-state">
            <p className="error-message">{error}</p>
            <button className="retry-button" onClick={() => void loadReportBootstrap()}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page">
      <div className="report-header">
        <button className="back-button" onClick={onBack}>
          ← Retour
        </button>
        <h2>Rapports</h2>
        <div className="report-header-actions">
          {snapBesoinsError ? (
            <span className="snap-besoins-status snap-besoins-status--error">{snapBesoinsError}</span>
          ) : (
            snapBesoinsStatus && <span className="snap-besoins-status">{snapBesoinsStatus}</span>
          )}
          <button
            type="button"
            className="snap-besoins-button"
            onClick={() => void handleSnapBesoins()}
            disabled={snapBesoinsLoading}
          >
            {snapBesoinsLoading ? 'Sync Besoins...' : 'Sync Besoins'}
          </button>
        </div>
      </div>
      <div className="report-container" data-testid="report-page">
        {activeReport === 'menu' ? (
          <div className="report-menu">
            <p className="report-menu-intro">Sélectionnez un rapport à afficher.</p>
            <div className="report-menu-buttons">
              {canViewForecastReport && (
              <button
                type="button"
                className="report-menu-button"
                onClick={() => setActiveReport('forecast-year')}
                data-testid="report-view-forecast"
              >
                <span className="report-menu-button-title">Synthèse Forecast</span>
                <span className="report-menu-button-desc">
                  Année {new Date().getFullYear()} — par ressource et par mois (jours saisis + prévisionnels)
                </span>
              </button>
              )}
              {canViewPennylane && (
                <button
                  type="button"
                  className="report-menu-button"
                  onClick={() => setActiveReport('pennylane-pl')}
                  data-testid="report-view-income"
                >
                  <span className="report-menu-button-title">Compte de Résultat</span>
                  <span className="report-menu-button-desc">
                    Produits et charges par mois (Pennylane)
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : activeReport === 'pennylane-pl' ? (
          !canViewPennylane ? (
            <p className="pl-error">
              Accès refusé au compte de résultat Pennylane. Demandez le rôle manager, commercial ou admin
              (permission finance).
            </p>
          ) : (
          <>
            <button
              type="button"
              className="report-back-to-menu"
              onClick={() => setActiveReport('menu')}
            >
              ← Autres rapports
            </button>
            <div className="report-title pl-cr-title">
              <h3>Compte de Résultat</h3>
              <div className="pl-toolbar pl-toolbar--inline-title">
                <label className="pl-year-label">
                  Année
                  <select
                    className="pl-year-select"
                    value={plYear}
                    onChange={(e) => setPlYear(parseInt(e.target.value, 10))}
                  >
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="pl-refresh-icon-button"
                  onClick={() => void handleRefreshIncomeStatement()}
                  disabled={plRefreshing || plLoading}
                  title="Mettre à jour les données Pennylane"
                  aria-label="Mettre à jour les données Pennylane"
                >
                  {plRefreshing ? '⏳' : '↻'}
                </button>
              </div>
            </div>

            {plLoading && (
              <div className="pl-loading">
                <div className="loading-spinner" />
                <p>
                  {plRefreshing
                    ? 'Synchronisation Pennylane en cours…'
                    : 'Chargement du compte de résultat…'}
                </p>
              </div>
            )}
            {plError && <p className="pl-error">{plError}</p>}

            {!plLoading && plData && (
              <>
                <div className="report-table-container pl-table-wrap pl-cr-table-wrap">
                  <table className="report-table pl-table pl-cr-table">
                    <thead>
                      <tr>
                        <th className="report-table-header pl-cr-axis" aria-hidden />
                        {plData.monthly.map((row) => (
                          <th key={row.month} className="report-table-header pl-cr-month">
                            {formatMonthName(row.month)}
                          </th>
                        ))}
                        <th className="report-table-header pl-cr-total">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="pl-cr-row-total-produits">
                        <th scope="row" className="report-table-cell pl-cr-rowhead">
                          <button
                            type="button"
                            className="pl-cr-toggle"
                            onClick={() => setPlProduitsDetailOpen((v) => !v)}
                            aria-expanded={plProduitsDetailOpen}
                            aria-controls="pl-cr-detail-produits"
                            aria-label={
                              plProduitsDetailOpen
                                ? 'Masquer le détail des produits'
                                : 'Afficher le détail des produits'
                            }
                            id="pl-cr-toggle-produits"
                          >
                            <span className="pl-cr-toggle-icon" aria-hidden>
                              {plProduitsDetailOpen ? '▼' : '▶'}
                            </span>
                            Produits
                          </button>
                        </th>
                        {plData.monthly.map((row) => (
                          <td key={row.month} className="report-table-cell pl-num">
                            {formatCurrencyPl(row.produits)}
                          </td>
                        ))}
                        <td className="report-table-cell pl-num pl-cr-total-cell">
                          <strong>{formatCurrencyPl(plData.totals.produits)}</strong>
                        </td>
                      </tr>
                      {plProduitsDetailOpen &&
                        <>
                          <tr className="pl-cr-detail-row" id="pl-cr-detail-produits">
                            <th
                              scope="row"
                              className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                              title="Produits — CA Anima Néo"
                            >
                              CA Anima Néo
                            </th>
                            {plData.monthly.map((row) => (
                              <td key={row.month} className="report-table-cell pl-num">
                                {formatCurrencyPl(row.caAnimaNeo)}
                              </td>
                            ))}
                            <td className="report-table-cell pl-num pl-cr-total-cell">
                              <strong>{formatCurrencyPl(plData.totals.caAnimaNeo)}</strong>
                            </td>
                          </tr>
                          <tr className="pl-cr-detail-row">
                            <th
                              scope="row"
                              className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                              title="Produits — CA Sous-traitance"
                            >
                              CA Sous-traitance
                            </th>
                            {plData.monthly.map((row) => (
                              <td key={row.month} className="report-table-cell pl-num">
                                {formatCurrencyPl(row.caSousTraitance)}
                              </td>
                            ))}
                            <td className="report-table-cell pl-num pl-cr-total-cell">
                              <strong>{formatCurrencyPl(plData.totals.caSousTraitance)}</strong>
                            </td>
                          </tr>
                        </>
                      }
                      <tr className="pl-cr-row-total-charges">
                        <th scope="row" className="report-table-cell pl-cr-rowhead">
                          <button
                            type="button"
                            className="pl-cr-toggle"
                            onClick={() => setPlChargesDetailOpen((v) => !v)}
                            aria-expanded={plChargesDetailOpen}
                            aria-controls="pl-cr-detail-charges"
                            aria-label={
                              plChargesDetailOpen
                                ? 'Masquer le détail des charges'
                                : 'Afficher le détail des charges'
                            }
                            id="pl-cr-toggle-charges"
                          >
                            <span className="pl-cr-toggle-icon" aria-hidden>
                              {plChargesDetailOpen ? '▼' : '▶'}
                            </span>
                            Charges
                          </button>
                        </th>
                        {plData.monthly.map((row) => (
                          <td key={row.month} className="report-table-cell pl-num">
                            {formatCurrencyPl(row.charges)}
                          </td>
                        ))}
                        <td className="report-table-cell pl-num pl-cr-total-cell">
                          <strong>{formatCurrencyPl(plData.totals.charges)}</strong>
                        </td>
                      </tr>
                      {plChargesDetailOpen &&
                        <>
                          <tr className="pl-cr-detail-row" id="pl-cr-detail-charges">
                            <th
                              scope="row"
                              className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                              title="Charges — Salaires"
                            >
                              Salaires
                            </th>
                            {plData.monthly.map((row) => (
                              <td key={row.month} className="report-table-cell pl-num">
                                {formatCurrencyPl(row.salaires)}
                              </td>
                            ))}
                            <td className="report-table-cell pl-num pl-cr-total-cell">
                              <strong>{formatCurrencyPl(plData.totals.salaires)}</strong>
                            </td>
                          </tr>
                          <tr className="pl-cr-detail-row">
                            <th
                              scope="row"
                              className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                              title="Charges — Cotisations sociales"
                            >
                              Cotisations sociales
                            </th>
                            {plData.monthly.map((row) => (
                              <td key={row.month} className="report-table-cell pl-num">
                                {formatCurrencyPl(row.cotisationsSociales)}
                              </td>
                            ))}
                            <td className="report-table-cell pl-num pl-cr-total-cell">
                              <strong>{formatCurrencyPl(plData.totals.cotisationsSociales)}</strong>
                            </td>
                          </tr>
                          <tr className="pl-cr-detail-row">
                            <th
                              scope="row"
                              className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                              title="Charges — Autres charges"
                            >
                              Autres charges
                            </th>
                            {plData.monthly.map((row) => (
                              <td key={row.month} className="report-table-cell pl-num">
                                {formatCurrencyPl(row.autresCharges)}
                              </td>
                            ))}
                            <td className="report-table-cell pl-num pl-cr-total-cell">
                              <strong>{formatCurrencyPl(plData.totals.autresCharges)}</strong>
                            </td>
                          </tr>
                          <tr className="pl-cr-detail-row pl-cr-subdetail-row">
                            <th
                              scope="row"
                              className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail pl-cr-rowhead-subdetail"
                              title="Dont sous-traitance (compte 6110000)"
                            >
                              Dont sous-traitance
                            </th>
                            {plData.monthly.map((row) => (
                              <td key={`st-${row.month}`} className="report-table-cell pl-num">
                                {formatCurrencyPl(row.dontSousTraitance)}
                              </td>
                            ))}
                            <td className="report-table-cell pl-num pl-cr-total-cell">
                              <strong>{formatCurrencyPl(plData.totals.dontSousTraitance)}</strong>
                            </td>
                          </tr>
                        </>
                      }
                      <tr className="pl-cr-result-row">
                        <th scope="row" className="report-table-cell pl-cr-rowhead">
                          Résultat
                        </th>
                        {plData.monthly.map((row) => (
                          <td
                            key={row.month}
                            className={`report-table-cell pl-num ${row.resultat >= 0 ? 'pl-positive' : 'pl-negative'}`}
                          >
                            {formatCurrencyPl(row.resultat)}
                          </td>
                        ))}
                        <td
                          className={`report-table-cell pl-num pl-cr-total-cell ${plData.totals.resultat >= 0 ? 'pl-positive' : 'pl-negative'}`}
                        >
                          <strong>{formatCurrencyPl(plData.totals.resultat)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="pl-sync-info">
                  <p className="pl-footnote">
                    Dernière mise à jour : {formatDateTimeFr(plData.lastSyncAt)}
                  </p>
                  <p className="pl-footnote">
                    Commentaires : Données issues de ledger_entry_lines (lignes sur la période), charges = débit−crédit sur comptes 6, produits = crédit−débit sur comptes 7
                  </p>
                </div>
              </>
            )}
          </>
          )
        ) : (
          <>
            <button
              type="button"
              className="report-back-to-menu"
              onClick={() => setActiveReport('menu')}
            >
              ← Autres rapports
            </button>
            <div className="report-title">
              <h3>Synthèse Forecast - {new Date().getFullYear()}</h3>
              <p className="report-subtitle">
                Vue par ressource et par mois (jours saisis + prévisionnels
                {parsedScenarioFilter !== 'none' && (
                  <> + scénarios {formatPlannedScenarioFilterLabel(parsedScenarioFilter)}</>
                )}
                )
              </p>
            </div>

        {/* Filtres Type, Statut et Scénario */}
        <div className="report-filters">
          <div className="filters-container">
            <div className="report-scenario-filter">
              <label htmlFor="report-scenario-filter">Scénario prévi.</label>
              <select
                id="report-scenario-filter"
                value={scenarioFilter}
                onChange={(e) => setScenarioFilter(e.target.value)}
                title="Aucun = base uniquement ; P1, P1 à P2… = ajout cumulatif des jours prévisionnels manuels"
              >
                {scenarioFilterSelectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-dropdown-container">
              <button
                className="filter-button"
                onClick={() => {
                  setTypeDropdownOpen(!typeDropdownOpen);
                  setStatutDropdownOpen(false);
                }}
              >
                <span>Type</span>
                {typeFilter.length > 0 && (
                  <span className="filter-badge">{typeFilter.length}</span>
                )}
                <span className="dropdown-arrow">{typeDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {typeDropdownOpen && (
                <div className="filter-dropdown">
                  <div className="filter-dropdown-content">
                    {uniqueTypes.map((type) => (
                      <label key={type} className="filter-checkbox-label">
                        <input
                          type="checkbox"
                          checked={typeFilter.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTypeFilter([...typeFilter, type]);
                            } else {
                              setTypeFilter(typeFilter.filter(t => t !== type));
                            }
                          }}
                          className="filter-checkbox"
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                  {typeFilter.length > 0 && (
                    <div className="filter-dropdown-footer">
                      <button
                        className="clear-filter-button-small"
                        onClick={() => setTypeFilter([])}
                      >
                        Effacer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="filter-dropdown-container">
              <button
                className="filter-button"
                onClick={() => {
                  setStatutDropdownOpen(!statutDropdownOpen);
                  setTypeDropdownOpen(false);
                }}
              >
                <span>Statut</span>
                {statutFilter.length > 0 && (
                  <span className="filter-badge">{statutFilter.length}</span>
                )}
                <span className="dropdown-arrow">{statutDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {statutDropdownOpen && (
                <div className="filter-dropdown">
                  <div className="filter-dropdown-content">
                    {uniqueStatuts.map((statut) => {
                      const statutValue: string = statut || '';
                      return (
                        <label key={statutValue} className="filter-checkbox-label">
                          <input
                            type="checkbox"
                            checked={statutFilter.includes(statutValue)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setStatutFilter([...statutFilter, statutValue]);
                              } else {
                                setStatutFilter(statutFilter.filter(s => s !== statutValue));
                              }
                            }}
                            className="filter-checkbox"
                          />
                          <span>{statutValue}</span>
                        </label>
                      );
                    })}
                  </div>
                  {statutFilter.length > 0 && (
                    <div className="filter-dropdown-footer">
                      <button
                        className="clear-filter-button-small"
                        onClick={() => setStatutFilter([])}
                      >
                        Effacer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="report-table-container">
          <table className="report-table">
            <thead>
              <tr>
                <th className="report-table-header resource-column">Ressource</th>
                {months.map((month) => (
                  <th key={month} className="report-table-header month-column">
                    {formatMonthName(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={months.length + 1} className="report-table-cell" style={{ textAlign: 'center', padding: '2rem' }}>
                    Aucune ressource trouvée. Synchronisez les ressources depuis Paramètres.
                  </td>
                </tr>
              ) : (
                filteredResources.map((resource) => (
                  <tr key={resource.id}>
                    <td className="report-table-cell resource-cell">
                      {resource.prenom} {resource.nom}
                    </td>
                    {months.map((month) => {
                      const grayCell = shouldGrayCell(resource, month);
                      const value = grayCell ? 0 : getTotalValue(resource.id, month);
                      const color = grayCell ? undefined : getCellColor(value);
                      const isDark = color ? isDarkColor(color) : false;
                      return (
                        <td
                          key={month}
                          className={`report-table-cell value-cell${grayCell ? ' report-table-cell--before-return' : ''}`}
                          style={
                            grayCell
                              ? undefined
                              : {
                                  backgroundColor: color,
                                  color: isDark ? 'white' : 'black',
                                  fontWeight: isDark ? 'bold' : 'normal',
                                }
                          }
                          title={
                            grayCell
                              ? 'Retour planifié — pas de saisie attendue avant la date de retour prévisionnelle'
                              : undefined
                          }
                        >
                          {grayCell ? '—' : value > 0 ? value.toFixed(1) : '0'}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="report-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#EE423F' }}></div>
            <span>0-4 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#FAC7C6' }}></div>
            <span>5-9 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#FFBD2E' }}></div>
            <span>10-14 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#B1E8E6' }}></div>
            <span>15 jours et plus</span>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Report;
