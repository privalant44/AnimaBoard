import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './Report.css';
import { apiUrl } from '../api';
import { DATA_REFRESH_EVENT } from '../dataRefresh';

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
}

type ReportSection = 'menu' | 'forecast-year' | 'pennylane-pl';

interface AccountTotals {
  charges: number;
  produits: number;
  lineCount: number;
}

interface IncomeStatementRow {
  month: string;
  produits: number;
  charges: number;
  resultat: number;
  entriesCount?: number;
  byAccount?: Record<string, AccountTotals>;
}

interface IncomeStatementResponse {
  year: number;
  source: string;
  method: string;
  filterAccounts?: string;
  description: string;
  monthly: IncomeStatementRow[];
  totals: Omit<IncomeStatementRow, 'month' | 'entriesCount' | 'byAccount'>;
  totalsByAccount?: Record<string, AccountTotals>;
  counts: { months: number; ledgerLinesClass6Or7?: number };
}

/**
 * Détail produits sous « Produits » : somme des lignes dont le compte général commence par le préfixe
 * (après normalisation). Anima Néo = 706 hors 70612 pour éviter le double comptage avec Sous-traitance.
 */
const PL_PRODUITS_DETAIL_ROWS: ReadonlyArray<{
  label: string;
  prefix: string;
  excludePrefix?: string;
  title: string;
}> = [
  {
    label: 'Anima Néo',
    prefix: '706',
    excludePrefix: '70612',
    title: 'Produits — comptes commençant par 706 (hors 70612)',
  },
  {
    label: 'Sous-traitance',
    prefix: '70612',
    title: 'Produits — comptes commençant par 70612',
  },
];

function normalizeLedgerAccountNumber(s: string): string {
  const t = String(s || '')
    .trim()
    .replace(/\s/g, '');
  const stripped = t.replace(/^0+/, '');
  return stripped.length ? stripped : '0';
}

function produitsSumByAccountPrefix(
  byAccount: Record<string, AccountTotals> | undefined,
  prefix: string,
  excludePrefix?: string
): number {
  if (!byAccount) return 0;
  const p = normalizeLedgerAccountNumber(prefix);
  const ex = excludePrefix ? normalizeLedgerAccountNumber(excludePrefix) : null;
  let sum = 0;
  for (const k of Object.keys(byAccount)) {
    const nk = normalizeLedgerAccountNumber(k);
    if (!nk.startsWith(p)) continue;
    if (ex != null && ex !== '' && nk.startsWith(ex)) continue;
    sum += byAccount[k].produits;
  }
  return Math.round(sum * 100) / 100;
}

/** Détail charges sous « Charges » : montants = débit − crédit (agrégation serveur). */
type ChargeDetailRowConfig =
  | { label: string; kind: 'prefix'; prefix: string; title: string }
  | { label: string; kind: 'prefixes'; prefixes: readonly string[]; title: string }
  | { label: string; kind: 'autres6'; excludePrefixes: readonly string[]; title: string };

const PL_CHARGES_DETAIL_ROWS: readonly ChargeDetailRowConfig[] = [
  { label: 'Salaires', kind: 'prefix', prefix: '641', title: 'Charges — comptes commençant par 641' },
  {
    label: 'Cotisations sociales',
    kind: 'prefixes',
    prefixes: ['645', '647', '649'],
    title: 'Charges — comptes commençant par 645, 647 ou 649',
  },
  {
    label: 'Autres charges',
    kind: 'autres6',
    excludePrefixes: ['641', '645', '647', '649'],
    title: 'Charges — comptes classe 6 hors 641, 645, 647 et 649',
  },
];

function chargesSumByAccountPrefix(
  byAccount: Record<string, AccountTotals> | undefined,
  prefix: string
): number {
  if (!byAccount) return 0;
  const p = normalizeLedgerAccountNumber(prefix);
  let sum = 0;
  for (const k of Object.keys(byAccount)) {
    const nk = normalizeLedgerAccountNumber(k);
    if (!nk.startsWith(p)) continue;
    sum += byAccount[k].charges;
  }
  return Math.round(sum * 100) / 100;
}

function chargesSumByAnyAccountPrefix(
  byAccount: Record<string, AccountTotals> | undefined,
  prefixes: readonly string[]
): number {
  if (!byAccount) return 0;
  const ps = prefixes.map((x) => normalizeLedgerAccountNumber(x));
  let sum = 0;
  for (const k of Object.keys(byAccount)) {
    const nk = normalizeLedgerAccountNumber(k);
    if (!ps.some((p) => nk.startsWith(p))) continue;
    sum += byAccount[k].charges;
  }
  return Math.round(sum * 100) / 100;
}

function chargesSumAutresClasse6(
  byAccount: Record<string, AccountTotals> | undefined,
  excludePrefixes: readonly string[]
): number {
  if (!byAccount) return 0;
  const ex = excludePrefixes.map((x) => normalizeLedgerAccountNumber(x));
  let sum = 0;
  for (const k of Object.keys(byAccount)) {
    const nk = normalizeLedgerAccountNumber(k);
    if (!nk.startsWith('6')) continue;
    if (ex.some((p) => nk.startsWith(p))) continue;
    sum += byAccount[k].charges;
  }
  return Math.round(sum * 100) / 100;
}

function chargesForDetailRow(
  byAccount: Record<string, AccountTotals> | undefined,
  row: ChargeDetailRowConfig
): number {
  if (row.kind === 'prefix') return chargesSumByAccountPrefix(byAccount, row.prefix);
  if (row.kind === 'prefixes') return chargesSumByAnyAccountPrefix(byAccount, row.prefixes);
  return chargesSumAutresClasse6(byAccount, row.excludePrefixes);
}

/** Tri pour le détail par compte : classe 6 vs 7 (autres clés ignorées). */
function partitionTotalsByAccountClass(
  totalsByAccount: Record<string, AccountTotals>
): {
  classe6: Array<[string, AccountTotals]>;
  classe7: Array<[string, AccountTotals]>;
} {
  const classe6: Array<[string, AccountTotals]> = [];
  const classe7: Array<[string, AccountTotals]> = [];
  for (const [acc, t] of Object.entries(totalsByAccount)) {
    const n = normalizeLedgerAccountNumber(acc);
    if (n.startsWith('6')) classe6.push([acc, t]);
    else if (n.startsWith('7')) classe7.push([acc, t]);
  }
  classe6.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  classe7.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return { classe6, classe7 };
}

// Fonction pour charger les filtres depuis localStorage
const loadReportFiltersFromStorage = () => {
  try {
    const savedTypeFilter = localStorage.getItem('report_typeFilter');
    const savedStatutFilter = localStorage.getItem('report_statutFilter');
    
    return {
      typeFilter: savedTypeFilter ? JSON.parse(savedTypeFilter) : [],
      statutFilter: savedStatutFilter ? JSON.parse(savedStatutFilter) : []
    };
  } catch (error) {
    console.error('Erreur lors du chargement des filtres depuis localStorage:', error);
    return {
      typeFilter: [],
      statutFilter: []
    };
  }
};

const Report: React.FC<ReportProps> = ({ onBack }) => {
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
  
  // États pour les filtres
  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters.typeFilter);
  const [statutFilter, setStatutFilter] = useState<string[]>(savedFilters.statutFilter);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [statutDropdownOpen, setStatutDropdownOpen] = useState<boolean>(false);
  const [activeReport, setActiveReport] = useState<ReportSection>('menu');
  const [plYear, setPlYear] = useState<number>(() => new Date().getFullYear());
  const [plData, setPlData] = useState<IncomeStatementResponse | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plError, setPlError] = useState<string | null>(null);
  const [plProduitsDetailOpen, setPlProduitsDetailOpen] = useState(true);
  const [plChargesDetailOpen, setPlChargesDetailOpen] = useState(true);
  const [plByAccountClasse6Open, setPlByAccountClasse6Open] = useState(true);
  const [plByAccountClasse7Open, setPlByAccountClasse7Open] = useState(true);

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
  const loadReportBootstrap = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const bootstrapResponse = await fetch(apiUrl('/api/data/forecast-bootstrap'));
      const bootstrapBody = await bootstrapResponse.json().catch(() => ({}));
      if (!bootstrapResponse.ok || !bootstrapBody?.success) {
        throw new Error(bootstrapBody?.error || 'Impossible de charger les données Report.');
      }

      const payload = bootstrapBody.data || {};
      const resourcesList = Array.isArray(payload.resourcesLocal) ? payload.resourcesLocal : [];
      const deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];

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
  loadReportBootstrapRef.current = loadReportBootstrap;

  useEffect(() => {
    const onRefresh = () => {
      void loadReportBootstrapRef.current();
    };
    window.addEventListener(DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onRefresh);
  }, []);

  useEffect(() => {
    void loadReportBootstrap();
  }, [loadReportBootstrap]);

  useEffect(() => {
    if (activeReport !== 'pennylane-pl') return;
    let cancelled = false;
    (async () => {
      setPlLoading(true);
      setPlError(null);
      try {
        const response = await fetch(apiUrl(`/api/dashboard/income-statement?year=${plYear}`));
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((body && body.error) || `Erreur ${response.status}`);
        }
        if (!cancelled) {
          setPlData(body as IncomeStatementResponse);
        }
      } catch (e) {
        if (!cancelled) {
          setPlData(null);
          setPlError(e instanceof Error ? e.message : 'Erreur lors du chargement');
        }
      } finally {
        if (!cancelled) {
          setPlLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeReport, plYear]);

  const plByAccountPartition = useMemo(() => {
    if (!plData?.totalsByAccount) return { classe6: [], classe7: [] } as const;
    return partitionTotalsByAccountClass(plData.totalsByAccount);
  }, [plData?.totalsByAccount]);

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
  const uniqueTypes = Array.from(new Set(resources.map(r => r.type).filter((t): t is string => t !== undefined && t !== null && t !== ''))).sort();
  
  // Obtenir la liste unique des statuts pour le filtre
  const uniqueStatuts = Array.from(new Set(resources.map(r => r.statut).filter((s): s is string => s !== undefined && s !== null && s !== ''))).sort();

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

  // Calculer la valeur totale (saisis + prévisionnels) pour une ressource et un mois
  const getTotalValue = (resourceId: number, month: string): number => {
    const resource = resources.find(r => r.id === resourceId);
    const resourceIdStr = String(resourceId);
    let totalActual = 0; // Jours saisis
    let totalForecast = 0; // Jours prévisionnels

    // Parcourir toutes les prestations de la ressource dans timesheetsAggregate
    const resourceData = timesheetsAggregate[resourceIdStr];
    if (resourceData) {
      Object.keys(resourceData).forEach((deliveryId) => {
        const deliveryData = resourceData[deliveryId];
        if (deliveryData && deliveryData[month]) {
          totalActual += deliveryData[month].days || 0;
        }
      });
    }

    // Parcourir les prestations de la ressource pour les prévisions
    if (resource && resource.projects) {
      resource.projects.forEach((project) => {
        const deliveryId = String(project.id);
        const deliveryForecast = forecastData[deliveryId];
        if (deliveryForecast && deliveryForecast.forecast) {
          const monthValue = deliveryForecast.forecast[month] || 0;
          totalForecast += monthValue;
        }
      });
    }

    return totalActual + totalForecast;
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

  // Fonction pour interpoler entre deux couleurs
  const interpolateColor = (color1: string, color2: string, ratio: number): string => {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * ratio);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * ratio);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Fonction pour calculer la luminosité relative d'une couleur RGB (0-1)
  const getLuminance = (r: number, g: number, b: number): number => {
    // Formule de luminosité relative selon WCAG
    const [rs, gs, bs] = [r, g, b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  // Fonction pour déterminer si une couleur est foncée (nécessite texte blanc)
  const isDarkColor = (color: string): boolean => {
    const rgb = hexToRgb(color);
    const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
    return luminance < 0.5; // Seuil pour déterminer si c'est foncé
  };

  // Fonction pour obtenir la couleur selon le formatage conditionnel
  // C01411 : entre 0 et 4
  // EE423F : entre 5 et 9
  // FFBD2E : entre 10 et 13
  // 5ECFCB : entre 14 et 16
  // 267E7B : au delà de 16
  const getCellColor = (value: number): string => {
    if (value <= 0) {
      return '#C01411'; // Rouge foncé pour 0
    } else if (value <= 4) {
      // Dégradé entre C01411 et EE423F (0-4)
      const ratio = value / 4;
      return interpolateColor('#C01411', '#EE423F', ratio);
    } else if (value <= 9) {
      // Dégradé entre EE423F et FFBD2E (5-9)
      const ratio = (value - 5) / 5;
      return interpolateColor('#EE423F', '#FFBD2E', ratio);
    } else if (value <= 13) {
      // Dégradé entre FFBD2E et 5ECFCB (10-13)
      const ratio = (value - 10) / 4;
      return interpolateColor('#FFBD2E', '#5ECFCB', ratio);
    } else if (value <= 16) {
      // Dégradé entre 5ECFCB et 267E7B (14-16)
      const ratio = (value - 14) / 3;
      return interpolateColor('#5ECFCB', '#267E7B', ratio);
    } else {
      return '#267E7B'; // Vert foncé pour 16+
    }
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

  const months = getCurrentYearMonths();

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Rapports</h2>
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
      </div>
      <div className="report-container">
        {activeReport === 'menu' ? (
          <div className="report-menu">
            <p className="report-menu-intro">Sélectionnez un rapport à afficher.</p>
            <div className="report-menu-buttons">
              <button
                type="button"
                className="report-menu-button"
                onClick={() => setActiveReport('forecast-year')}
              >
                <span className="report-menu-button-title">Synthèse Forecast</span>
                <span className="report-menu-button-desc">
                  Année {new Date().getFullYear()} — par ressource et par mois (jours saisis + prévisionnels)
                </span>
              </button>
              <button
                type="button"
                className="report-menu-button"
                onClick={() => setActiveReport('pennylane-pl')}
              >
                <span className="report-menu-button-title">Compte de Résultat</span>
                <span className="report-menu-button-desc">
                  Produits et charges par mois (Pennylane)
                </span>
              </button>
            </div>
          </div>
        ) : activeReport === 'pennylane-pl' ? (
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
              </div>
            </div>

            {plLoading && (
              <div className="pl-loading">
                <div className="loading-spinner" />
                <p>Connexion à Pennylane…</p>
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
                        PL_PRODUITS_DETAIL_ROWS.map(({ label, prefix, excludePrefix, title }) => (
                        <tr
                          key={`${prefix}-${excludePrefix ?? ''}`}
                          className="pl-cr-detail-row"
                          id={prefix === PL_PRODUITS_DETAIL_ROWS[0]?.prefix ? 'pl-cr-detail-produits' : undefined}
                        >
                          <th
                            scope="row"
                            className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                            title={title}
                          >
                            {label}
                          </th>
                          {plData.monthly.map((row) => (
                            <td key={row.month} className="report-table-cell pl-num">
                              {formatCurrencyPl(produitsSumByAccountPrefix(row.byAccount, prefix, excludePrefix))}
                            </td>
                          ))}
                          <td className="report-table-cell pl-num pl-cr-total-cell">
                            <strong>
                              {formatCurrencyPl(
                                produitsSumByAccountPrefix(plData.totalsByAccount, prefix, excludePrefix)
                              )}
                            </strong>
                          </td>
                        </tr>
                      ))}
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
                        PL_CHARGES_DETAIL_ROWS.map((crow) => (
                        <tr
                          key={crow.label}
                          className="pl-cr-detail-row"
                          id={crow.label === PL_CHARGES_DETAIL_ROWS[0]?.label ? 'pl-cr-detail-charges' : undefined}
                        >
                          <th
                            scope="row"
                            className="report-table-cell pl-cr-rowhead pl-cr-rowhead-detail"
                            title={crow.title}
                          >
                            {crow.label}
                          </th>
                          {plData.monthly.map((row) => (
                            <td key={row.month} className="report-table-cell pl-num">
                              {formatCurrencyPl(chargesForDetailRow(row.byAccount, crow))}
                            </td>
                          ))}
                          <td className="report-table-cell pl-num pl-cr-total-cell">
                            <strong>
                              {formatCurrencyPl(chargesForDetailRow(plData.totalsByAccount, crow))}
                            </strong>
                          </td>
                        </tr>
                      ))}
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
                {plData.totalsByAccount && Object.keys(plData.totalsByAccount).length > 0 && (
                  <div className="pl-by-account pl-by-account-compact">
                    <h4 className="pl-by-account-title">
                      Détail par compte général (cumul année {plData.year})
                    </h4>
                    <div className="report-table-container pl-table-wrap">
                      <table className="report-table pl-table pl-by-account-table">
                        <thead>
                          <tr>
                            <th className="report-table-header">Compte</th>
                            <th className="report-table-header">Lignes</th>
                            <th className="report-table-header">Charges (débit − crédit)</th>
                            <th className="report-table-header">Produits (crédit − débit)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="pl-ba-group-row">
                            <td colSpan={4} className="pl-ba-group-cell">
                              <button
                                type="button"
                                className="pl-ba-toggle"
                                onClick={() => setPlByAccountClasse6Open((v) => !v)}
                                aria-expanded={plByAccountClasse6Open}
                                aria-controls="pl-ba-detail-classe6"
                                aria-label={
                                  plByAccountClasse6Open
                                    ? 'Masquer les comptes de classe 6'
                                    : 'Afficher les comptes de classe 6'
                                }
                                id="pl-ba-toggle-classe6"
                              >
                                <span className="pl-ba-toggle-icon" aria-hidden>
                                  {plByAccountClasse6Open ? '▼' : '▶'}
                                </span>
                                <strong>Classe 6</strong>
                                <span className="pl-ba-group-hint">
                                  {' '}
                                  — charges ({plByAccountPartition.classe6.length} compte
                                  {plByAccountPartition.classe6.length > 1 ? 's' : ''})
                                </span>
                              </button>
                            </td>
                          </tr>
                          {plByAccountClasse6Open &&
                            plByAccountPartition.classe6.map(([acc, t], idx) => (
                              <tr
                                key={acc}
                                className="pl-ba-account-row"
                                id={idx === 0 ? 'pl-ba-detail-classe6' : undefined}
                              >
                                <td className="report-table-cell">{acc}</td>
                                <td className="report-table-cell pl-num">{t.lineCount}</td>
                                <td className="report-table-cell pl-num">
                                  {t.charges !== 0 ? formatCurrencyPl(t.charges) : '—'}
                                </td>
                                <td className="report-table-cell pl-num">
                                  {t.produits !== 0 ? formatCurrencyPl(t.produits) : '—'}
                                </td>
                              </tr>
                            ))}
                          <tr className="pl-ba-group-row">
                            <td colSpan={4} className="pl-ba-group-cell">
                              <button
                                type="button"
                                className="pl-ba-toggle"
                                onClick={() => setPlByAccountClasse7Open((v) => !v)}
                                aria-expanded={plByAccountClasse7Open}
                                aria-controls="pl-ba-detail-classe7"
                                aria-label={
                                  plByAccountClasse7Open
                                    ? 'Masquer les comptes de classe 7'
                                    : 'Afficher les comptes de classe 7'
                                }
                                id="pl-ba-toggle-classe7"
                              >
                                <span className="pl-ba-toggle-icon" aria-hidden>
                                  {plByAccountClasse7Open ? '▼' : '▶'}
                                </span>
                                <strong>Classe 7</strong>
                                <span className="pl-ba-group-hint">
                                  {' '}
                                  — produits ({plByAccountPartition.classe7.length} compte
                                  {plByAccountPartition.classe7.length > 1 ? 's' : ''})
                                </span>
                              </button>
                            </td>
                          </tr>
                          {plByAccountClasse7Open &&
                            plByAccountPartition.classe7.map(([acc, t], idx) => (
                              <tr
                                key={acc}
                                className="pl-ba-account-row"
                                id={idx === 0 ? 'pl-ba-detail-classe7' : undefined}
                              >
                                <td className="report-table-cell">{acc}</td>
                                <td className="report-table-cell pl-num">{t.lineCount}</td>
                                <td className="report-table-cell pl-num">
                                  {t.charges !== 0 ? formatCurrencyPl(t.charges) : '—'}
                                </td>
                                <td className="report-table-cell pl-num">
                                  {t.produits !== 0 ? formatCurrencyPl(t.produits) : '—'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <p className="pl-footnote">{plData.description}</p>
              </>
            )}
          </>
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
              <p className="report-subtitle">Vue par ressource et par mois (jours saisis + prévisionnels)</p>
            </div>

        {/* Filtres Type et Statut */}
        <div className="report-filters">
          <div className="filters-container">
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
                      const value = getTotalValue(resource.id, month);
                      const color = getCellColor(value);
                      const isDark = isDarkColor(color);
                      return (
                        <td
                          key={month}
                          className="report-table-cell value-cell"
                          style={{ 
                            backgroundColor: color, 
                            color: isDark ? 'white' : 'black',
                            fontWeight: isDark ? 'bold' : 'normal'
                          }}
                        >
                          {value > 0 ? value.toFixed(1) : '0'}
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
            <div className="legend-color" style={{ backgroundColor: '#C01411' }}></div>
            <span>0-4 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#EE423F' }}></div>
            <span>5-9 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#FFBD2E' }}></div>
            <span>10-13 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#5ECFCB' }}></div>
            <span>14-16 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#267E7B' }}></div>
            <span>16+ jours</span>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Report;
