import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './Forecast.css';
import { DATA_REFRESH_EVENT } from '../dataRefresh';
import { apiFetch, describeApiEndpoint, normalizeApiError } from '../api';
import ForecastScenarios, { ForecastScenario } from './ForecastScenarios';
import { useAuth } from '../auth/AuthProvider';
import { isAuthEnabled } from '../auth/msalConfig';
import { filterResourcesByUserEmail, PERMISSIONS } from '../auth/roles';
import {
  countWorkdaysInMonth,
  countWorkdaysInYear,
  holidaySetFromApiRows
} from '../utils/workdays';

function getScenarioDisplayLabel(number: number, catalog: ForecastScenario[]): string {
  const entry = catalog.find((s) => s.number === number);
  if (entry?.title?.trim()) return `${number} — ${entry.title.trim()}`;
  return String(number);
}

interface Project {
  id: string | number;
  reference: string;
  title: string;
  startDate: string;
  endDate: string;
  tjm: number | null;
  orderedDays?: number | null;
}

interface PlannedScenario {
  resourceId: number;
  scenario: number;
  tjm: number | null;
  description: string;
  forecast: Record<string, number>;
}

interface ResourceWithProjects {
  id: number;
  nom: string;
  prenom: string;
  type?: string;
  statut?: string;
  email?: string;
  raw?: Record<string, unknown>;
  /** Prestations visibles (filtre période). */
  projects: Project[];
  /** Toutes les prestations de la ressource : base du CA par année (hors filtre période). */
  allProjectsForCA: Project[];
}

interface ForecastProps {
  onBack: () => void;
}

type ForecastPeriodOverride = { startDate: string; endDate: string };

/** Évite "JSON.parse: unexpected character" quand l'API renvoie du HTML (erreur Vercel). */
async function safeParseJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const friendly = `Réponse invalide du serveur (${res.status}): JSON attendu. Vérifiez les logs Vercel.`;
    throw new Error(friendly);
  }
}

function safeParseLocalStorage<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Carte mois → jours d'absence (clés resourceId en string). */
function getAbsenceMapForResource(
  absenceByResource: Record<string, Record<string, number>>,
  resourceId: number
): Record<string, number> {
  const keys = [String(resourceId), String(Number(resourceId)), Number(resourceId).toString()];
  for (const k of keys) {
    if (absenceByResource[k]) return absenceByResource[k];
  }
  return {};
}

function getPlannedMapForResource(
  plannedByResource: Record<string, PlannedScenario[]>,
  resourceId: number
): PlannedScenario[] {
  const keys = [String(resourceId), String(Number(resourceId)), Number(resourceId).toString()];
  for (const k of keys) {
    if (plannedByResource[k]) return plannedByResource[k];
  }
  return [];
}

function sumAbsencesForYear(monthMap: Record<string, number>, year: number): number {
  let s = 0;
  for (const [month, days] of Object.entries(monthMap)) {
    if (month.startsWith(`${year}-`)) s += Number(days) || 0;
  }
  return s;
}

/** Filtre la saisie : entiers ou décimales .0, .25, .5 uniquement. */
function sanitizeForecastDaysInput(raw: string): string {
  const normalized = raw.replace(',', '.');
  let out = '';
  let hasDot = false;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c >= '0' && c <= '9') {
      if (hasDot) {
        const decSoFar = out.slice(out.indexOf('.') + 1) + c;
        if (!/^(0|2|25|5)$/.test(decSoFar)) continue;
      }
      out += c;
    } else if (c === '.' && !hasDot && out.length > 0) {
      out += '.';
      hasDot = true;
    }
  }
  return out;
}

/** Retourne les jours saisis ou null si vide / invalide. */
function parseForecastDaysInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  if (!/^\d+(\.(25|5|0{1,2})?)?$/.test(trimmed)) return null;
  const value = parseFloat(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  const frac = Math.round((value % 1) * 100) / 100;
  if (frac !== 0 && frac !== 0.25 && frac !== 0.5) return null;
  return value;
}

function formatForecastDaysFr(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(2).replace('.', ',');
  return s.replace(/,0+$/, '').replace(/,(\d)0$/, ',$1');
}

/** Mois calendaire YYYY-MM au plus tard le mois courant (inclus). */
function isMonthCurrentOrPast(ym: string): boolean {
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return false;
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (y < cy) return true;
  if (y > cy) return false;
  return m <= cm;
}

/** Mois saisissable pour une prévi : année en cours, mois courant inclus jusqu'à décembre. */
function isPlannedMonthEditable(ym: string, year: number): boolean {
  if (!ym.startsWith(`${year}-`)) return false;
  const parts = ym.split('-');
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(m)) return false;
  const now = new Date();
  if (year < now.getFullYear()) return false;
  if (year > now.getFullYear()) return true;
  return m >= now.getMonth() + 1;
}

/** Fond cellule : base #F8E4A7, plus intense quand les jours augmentent ; vide ≈ blanc cassé. */
function absenceCellBackground(days: number, maxDays: number): string {
  if (days <= 0) return '#FFFCF3';
  const t = Math.min(1, maxDays > 0 ? days / maxDays : 1);
  const base = { r: 248, g: 228, b: 167 };
  const empty = { r: 255, g: 252, b: 243 };
  const r = Math.round(empty.r + (base.r - empty.r) * t);
  const g = Math.round(empty.g + (base.g - empty.g) * t);
  const b = Math.round(empty.b + (base.b - empty.b) * t);
  return `rgb(${r},${g},${b})`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** yyyy-mm-dd → jj/mm/aaaa */
function formatYmdToFr(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** jj/mm/aaaa (j et m sur 1 ou 2 chiffres), ou aaaa-mm-jj — → yyyy-mm-dd */
function parseFrDateToYmd(raw: string): string | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
    return null;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return null;
}

// Fonction pour charger les filtres depuis localStorage
const loadForecastFiltersFromStorage = () => {
  try {
    const savedStartDate = localStorage.getItem('forecast_startDate');
    const savedEndDate = localStorage.getItem('forecast_endDate');
    const savedTypeFilter = localStorage.getItem('forecast_typeFilter');
    const savedStatutFilter = localStorage.getItem('forecast_statutFilter');
    
    // Calculer les dates par défaut (mois en cours)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const defaultStartDate = firstDay.toISOString().split('T')[0];
    const defaultEndDate = lastDay.toISOString().split('T')[0];
    
    return {
      startDate: savedStartDate || defaultStartDate,
      endDate: savedEndDate || defaultEndDate,
      typeFilter: safeParseLocalStorage(savedTypeFilter, []),
      statutFilter: safeParseLocalStorage(savedStatutFilter, [])
    };
  } catch (error) {
    console.error('Erreur lors du chargement des filtres depuis localStorage:', error);
    // Valeurs par défaut en cas d'erreur
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      typeFilter: [],
      statutFilter: []
    };
  }
};

const Forecast: React.FC<ForecastProps> = ({ onBack }) => {
  const auth = useAuth();
  const authOn = isAuthEnabled();
  const canScenarios = !authOn || auth?.canView(PERMISSIONS.VIEW_FORECAST_SCENARIOS);
  const restrictToPersonal = authOn && (auth?.restrictForecastToPersonal ?? false);
  const userEmail = auth?.email || '';
  const isDebug = process.env.NODE_ENV !== 'production';
  // Charger les filtres depuis localStorage au démarrage
  const savedFilters = loadForecastFiltersFromStorage();
  
  const [resources, setResources] = useState<ResourceWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(savedFilters.startDate);
  const [endDate, setEndDate] = useState<string>(savedFilters.endDate);
  const [startDateInput, setStartDateInput] = useState<string>(() =>
    formatYmdToFr(savedFilters.startDate)
  );
  const [endDateInput, setEndDateInput] = useState<string>(() =>
    formatYmdToFr(savedFilters.endDate)
  );

  const startDatePickerRef = useRef<HTMLInputElement>(null);
  const endDatePickerRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // États pour les filtres
  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters.typeFilter);
  const [statutFilter, setStatutFilter] = useState<string[]>(savedFilters.statutFilter);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [statutDropdownOpen, setStatutDropdownOpen] = useState<boolean>(false);
  
  // États pour le pliage/dépliage des prestations
  const [expandedResources, setExpandedResources] = useState<Set<number>>(new Set());
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<string>>(new Set());
  /** Ressources dont le bloc prestations prévisionnelles est replié (déplié par défaut). */
  const [collapsedPlannedResources, setCollapsedPlannedResources] = useState<Set<number>>(new Set());
  
  // Données prévisionnelles et jours commandés indexés par prestation
  const [forecastByDeliveryId, setForecastByDeliveryId] = useState<Record<string, Record<string, number>>>({});
  const [orderedDaysByDeliveryId, setOrderedDaysByDeliveryId] = useState<Record<string, number>>({});
  const [editingMonth, setEditingMonth] = useState<{
    deliveryId: string | number;
    resourceId: number;
    month: string;
  } | null>(null);
  const [editingInputValue, setEditingInputValue] = useState('');
  /** Valeur courante de l'input (ref pour commit synchrone au clic / Tab). */
  const editingInputValueRef = useRef('');
  const setForecastEditingInput = useCallback((value: string) => {
    editingInputValueRef.current = value;
    setEditingInputValue(value);
  }, []);
  /** Évite un double commit blur + sélection d'une autre cellule. */
  const skipBlurCommitRef = useRef(false);
  const editingMonthRef = useRef(editingMonth);
  
  // État pour l'agrégat des timesheets
  const [timesheetsAggregate, setTimesheetsAggregate] = useState<{
    [resourceId: string]: {
      [deliveryId: string]: {
        [month: string]: { days: number; hours: number };
      };
    };
  }>({});

  // États pour toutes les options de filtres (depuis toutes les ressources)
  const [allTypeOptions, setAllTypeOptions] = useState<string[]>([]);
  const [allStatutOptions, setAllStatutOptions] = useState<string[]>([]);

  const [absenceByResource, setAbsenceByResource] = useState<Record<string, Record<string, number>>>({});
  const [plannedDeliveriesByResource, setPlannedDeliveriesByResource] = useState<
    Record<string, PlannedScenario[]>
  >({});
  const [forecastScenarios, setForecastScenarios] = useState<ForecastScenario[]>([]);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [pendingPlannedAdd, setPendingPlannedAdd] = useState<{
    resourceId: number;
    scenarioInput: string;
  } | null>(null);
  const [editingPlannedMonth, setEditingPlannedMonth] = useState<{
    resourceId: number;
    scenario: number;
    month: string;
  } | null>(null);
  const editingPlannedMonthRef = useRef(editingPlannedMonth);
  /** Dates fériées YYYY-MM-DD (table french_public_holiday via API). */
  const [frenchHolidayDates, setFrenchHolidayDates] = useState<string[]>([]);
  const holidayYmdSet = useMemo(() => new Set(frenchHolidayDates), [frenchHolidayDates]);

  useEffect(() => {
    editingMonthRef.current = editingMonth;
  }, [editingMonth]);

  useEffect(() => {
    editingPlannedMonthRef.current = editingPlannedMonth;
  }, [editingPlannedMonth]);

  /** Mois jan–déc de l’année en cours (aligné avec les absences Boond synchronisées). */
  const gridYear = new Date().getFullYear();
  const gridMonths = useMemo(() => {
    const months: string[] = [];
    for (let month = 1; month <= 12; month++) {
      months.push(`${gridYear}-${String(month).padStart(2, '0')}`);
    }
    return months;
  }, [gridYear]);

  const fetchForecast = useCallback(async (period?: ForecastPeriodOverride) => {
    const filterStart = period?.startDate ?? startDate;
    const filterEnd = period?.endDate ?? endDate;
    try {
      setLoading(true);
      setError(null);

      // Bootstrap unique pour limiter la latence (évite les appels API multiples).
      const bootstrapResponse = await apiFetch(
        `/api/data/forecast-bootstrap?from=${new Date().getFullYear() - 1}&years=12`
      );
      const bootstrapBody = await safeParseJson(bootstrapResponse);
      if (!bootstrapResponse.ok || !bootstrapBody?.success) {
        const msg = bootstrapBody?.error || 'Impossible de charger les données Forecast.';
        throw new Error(msg);
      }
      const payload = bootstrapBody.data || {};
      const deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];
      const resourcesList = Array.isArray(payload.resourcesLocal) ? payload.resourcesLocal : [];
      setOrderedDaysByDeliveryId(payload.orderedDaysByDeliveryId || {});
      setForecastByDeliveryId(payload.forecastByDeliveryId || {});
      setTimesheetsAggregate(payload.timesheetsAggregate || {});
      setAbsenceByResource(payload.absenceByResource || {});
      setPlannedDeliveriesByResource(payload.plannedDeliveriesByResource || {});
      setForecastScenarios(Array.isArray(payload.forecastScenarios) ? payload.forecastScenarios : []);
      const holidayDateList = Array.from(
        holidaySetFromApiRows(Array.isArray(payload.holidays) ? payload.holidays : [])
      );
      setFrenchHolidayDates(holidayDateList);

      // Extraire tous les types et statuts pour les options de filtres (dictionnaire + ressources)
      const dictOpts = payload.dictionaryOptions || {};
      const typeSet = new Set<string>(Array.isArray(dictOpts.types) ? dictOpts.types : []);
      const statutSet = new Set<string>(Array.isArray(dictOpts.states) ? dictOpts.states : []);
      resourcesList.forEach((r: any) => {
        const type = r.typeLabel || '';
        const statut = r.stateLabel || '';
        if (type) typeSet.add(type);
        if (statut) statutSet.add(statut);
      });
      setAllTypeOptions(Array.from(typeSet).sort((a, b) => a.localeCompare(b, 'fr')));
      setAllStatutOptions(Array.from(statutSet).sort((a, b) => a.localeCompare(b, 'fr')));
      if (isDebug) {
        console.log(`📊 Options filtres: ${typeSet.size} types, ${statutSet.size} statuts`);
      }

      // Créer un map des ressources par ID pour accès rapide
      // Les typeLabel et stateLabel sont déjà résolus par /resources-local
      const resourcesMap: {
        [key: string]: {
          nom: string;
          prenom: string;
          type?: string;
          statut?: string;
          email?: string;
          raw?: Record<string, unknown>;
        };
      } = {};
      resourcesList.forEach((resource: any) => {
        const resourceId = String(resource.id || '');
        const firstName = resource.prenom || resource.firstName || '';
        const lastName = resource.nom || resource.lastName || '';
        
        // Utiliser typeLabel et stateLabel déjà résolus par le backend
        const type = resource.typeLabel || '';
        const statut = resource.stateLabel || '';
        
        if (resourceId) {
          resourcesMap[resourceId] = {
            nom: lastName,
            prenom: firstName,
            type,
            statut,
            email: resource.email,
            raw: resource.raw,
          };
        }
      });

      // Grouper les prestations par ressource (vue filtrée + liste complète pour le CA annuel)
      const deliveriesByResource: { [key: string]: Project[] } = {};
      const deliveriesByResourceAll: { [key: string]: Project[] } = {};

      deliveries.forEach((delivery: any) => {
        // Récupérer l'ID de la ressource (camelCase ou snake_case selon la source)
        const resourceId = String(delivery.resourceId || delivery.resource_id || '');
        if (!resourceId) {
          return;
        }

        // Créer l'objet Project avec les jours commandés
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

        if (!deliveriesByResourceAll[resourceId]) {
          deliveriesByResourceAll[resourceId] = [];
        }
        deliveriesByResourceAll[resourceId].push(project);

        // Filtrer par période si spécifiée (affichage uniquement)
        if (filterStart && filterEnd) {
          const start = new Date(filterStart);
          const end = new Date(filterEnd);
          const deliveryStart = delivery.startDate ? new Date(delivery.startDate) : null;
          const deliveryEnd = delivery.endDate ? new Date(delivery.endDate) : null;

          if (deliveryStart && deliveryEnd) {
            const overlaps = deliveryStart <= end && deliveryEnd >= start;
            if (!overlaps) {
              return;
            }
          } else {
            return;
          }
        }

        if (!deliveriesByResource[resourceId]) {
          deliveriesByResource[resourceId] = [];
        }
        deliveriesByResource[resourceId].push(project);
      });

      const sortProjectsByEndDesc = (list: Project[]) =>
        [...list].sort((a, b) => {
          const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
          const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
          return dateB - dateA;
        });

      // Créer la liste des ressources avec leurs prestations
      const resourcesWithProjects: ResourceWithProjects[] = [];
      
      Object.keys(deliveriesByResource).forEach((resourceId) => {
        const resourceInfo = resourcesMap[resourceId] || { nom: 'N/A', prenom: 'N/A', type: '', statut: '' };
        const sortedProjects = sortProjectsByEndDesc(deliveriesByResource[resourceId]);
        const sortedAllForCA = sortProjectsByEndDesc(
          deliveriesByResourceAll[resourceId] || []
        );
        resourcesWithProjects.push({
          id: Number(resourceId),
          nom: resourceInfo.nom,
          prenom: resourceInfo.prenom,
          type: resourceInfo.type,
          statut: resourceInfo.statut,
          email: resourceInfo.email,
          raw: resourceInfo.raw,
          projects: sortedProjects,
          allProjectsForCA: sortedAllForCA
        });
      });

      // Trier par nom de famille puis prénom
      resourcesWithProjects.sort((a, b) => {
        if (a.nom !== b.nom) {
          return a.nom.localeCompare(b.nom);
        }
        return a.prenom.localeCompare(b.prenom);
      });

      if (isDebug) {
        console.log(`✅ ${resourcesWithProjects.length} ressources avec prestations trouvées`);
        // Vérifier que les libellés sont bien mappés
        const sampleResource = resourcesWithProjects[0];
        if (sampleResource) {
          console.log(`📋 Exemple de ressource mappée:`, {
            nom: sampleResource.nom,
            prenom: sampleResource.prenom,
            type: sampleResource.type,
            statut: sampleResource.statut,
          });
        }
      }

      setResources(resourcesWithProjects);
    } catch (err) {
      const errorMessage = normalizeApiError(err, describeApiEndpoint('/api/data/forecast-bootstrap'));
      setError(errorMessage);
      console.error('❌ Error fetching forecast:', err);
      setAbsenceByResource({});
      setPlannedDeliveriesByResource({});
      setFrenchHolidayDates([]);
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, isDebug]);

  const handleActualiser = useCallback(() => {
    const s = parseFrDateToYmd(startDateInput.trim());
    const e = parseFrDateToYmd(endDateInput.trim());
    if (!s || !e) {
      alert(
        'Indiquez une date de début et une date de fin au format jj/mm/aaaa (ex. 15/03/2026).'
      );
      return;
    }
    if (s > e) {
      alert('La date de début doit être antérieure ou égale à la date de fin.');
      return;
    }
    setStartDate(s);
    setEndDate(e);
    setStartDateInput(formatYmdToFr(s));
    setEndDateInput(formatYmdToFr(e));
    void fetchForecast({ startDate: s, endDate: e });
  }, [startDateInput, endDateInput, fetchForecast]);

  const openStartDatePicker = () => {
    const el = startDatePickerRef.current;
    if (!el) return;
    const parsed = parseFrDateToYmd(startDateInput.trim()) || startDate;
    el.value = parsed;
    el.showPicker?.();
  };

  const openEndDatePicker = () => {
    const el = endDatePickerRef.current;
    if (!el) return;
    const parsed = parseFrDateToYmd(endDateInput.trim()) || endDate;
    el.value = parsed;
    el.showPicker?.();
  };

  const fetchForecastRef = useRef(fetchForecast);
  fetchForecastRef.current = fetchForecast;

  useEffect(() => {
    const onRefresh = () => {
      void fetchForecastRef.current();
    };
    window.addEventListener(DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onRefresh);
  }, []);

  // Sauvegarder les dates dans localStorage à chaque changement
  useEffect(() => {
    if (startDate) {
      try {
        localStorage.setItem('forecast_startDate', startDate);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde de startDate:', error);
      }
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      try {
        localStorage.setItem('forecast_endDate', endDate);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde de endDate:', error);
      }
    }
  }, [endDate]);

  // Sauvegarder les filtres type et statut dans localStorage à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem('forecast_typeFilter', JSON.stringify(typeFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre type:', error);
    }
  }, [typeFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('forecast_statutFilter', JSON.stringify(statutFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre statut:', error);
    }
  }, [statutFilter]);

  useEffect(() => {
    if (savedFilters.startDate && savedFilters.endDate) {
      void fetchForecast({
        startDate: savedFilters.startDate,
        endDate: savedFilters.endDate
      });
    }
    // Chargement initial uniquement (ensuite : bouton Actualiser)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtrer les ressources par type et statut
  const filteredResources = useMemo(() => {
    let filtered = resources;

    if (restrictToPersonal && userEmail) {
      filtered = filterResourcesByUserEmail(filtered, userEmail);
    }

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
  }, [resources, typeFilter, statutFilter, restrictToPersonal, userEmail]);

  // Calcul de la pagination
  const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResources = filteredResources.slice(startIndex, endIndex);

  // Réinitialiser la page quand le filtre change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, statutFilter, startDate, endDate]);

  // Les options de filtres sont chargées depuis toutes les ressources de la base
  // (allTypeOptions et allStatutOptions sont mis à jour dans fetchForecast)

  // Nettoyer les filtres persistés : ne garder que les valeurs présentes dans les options actuelles
  // (libellés). Évite que d'anciens codes mémorisés gonflent le compteur (code + libellé).
  useEffect(() => {
    if (allTypeOptions.length === 0) return;
    const valid = new Set(allTypeOptions);
    setTypeFilter(prev => {
      const cleaned = Array.from(new Set(prev.filter(t => valid.has(t))));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [allTypeOptions]);

  useEffect(() => {
    if (allStatutOptions.length === 0) return;
    const valid = new Set(allStatutOptions);
    setStatutFilter(prev => {
      const cleaned = Array.from(new Set(prev.filter(s => valid.has(s))));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [allStatutOptions]);

  // Fonction pour basculer l'état plié/déplié d'une ressource
  const toggleResourceExpanded = (resourceId: number) => {
    setExpandedResources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resourceId)) {
        newSet.delete(resourceId);
      } else {
        newSet.add(resourceId);
      }
      return newSet;
    });
  };

  // Fonction pour basculer l'état plié/déplié d'une prestation
  const togglePlannedExpanded = (resourceId: number) => {
    setCollapsedPlannedResources((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) {
        next.delete(resourceId);
      } else {
        next.add(resourceId);
      }
      return next;
    });
  };

  const toggleDeliveryExpanded = (deliveryId: string | number) => {
    setExpandedDeliveries(prev => {
      const newSet = new Set(prev);
      const deliveryIdStr = String(deliveryId);
      if (newSet.has(deliveryIdStr)) {
        newSet.delete(deliveryIdStr);
      } else {
        newSet.add(deliveryIdStr);
      }
      return newSet;
    });
  };

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

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  // Retourne les jours saisis indexés par mois pour une prestation/ressource.
  const getActualTimesForDelivery = useCallback(
    (deliveryId: string | number, resourceId: number): { [month: string]: number } => {
      const resourceIdVariants = [String(resourceId), String(Number(resourceId)), Number(resourceId).toString()];
      const deliveryIdVariants = [String(deliveryId), String(Number(deliveryId)), Number(deliveryId).toString()];
      let foundData: { [month: string]: { days: number; hours: number } } | null = null;
      for (const resIdVar of resourceIdVariants) {
        if (!timesheetsAggregate[resIdVar]) continue;
        for (const delIdVar of deliveryIdVariants) {
          if (timesheetsAggregate[resIdVar][delIdVar]) {
            foundData = timesheetsAggregate[resIdVar][delIdVar];
            break;
          }
        }
        if (foundData) break;
      }
      if (!foundData) return {};
      const data = foundData;
      const actual: { [month: string]: number } = {};
      Object.keys(data).forEach((month) => {
        actual[month] = data[month]?.days || 0;
      });
      return actual;
    },
    [timesheetsAggregate]
  );

  // Sauvegarder un temps prévisionnel (en jours)
  const saveForecastTime = useCallback(async (deliveryId: string | number, month: string, days: number) => {
    try {
      const response = await apiFetch('/api/data/forecast-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deliveryId: String(deliveryId),
          month: month,
          hours: days // Le backend attend "hours" mais on envoie des jours
        })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde');
      }

      // Mettre à jour l'état local (cache prévisionnel par prestation).
      setForecastByDeliveryId(prev => ({
        ...prev,
        [String(deliveryId)]: {
          ...(prev[String(deliveryId)] || {}),
          [month]: days
        }
      }));

      const current = editingMonthRef.current;
      if (current?.deliveryId === deliveryId && current?.month === month) {
        setEditingMonth(null);
        setForecastEditingInput('');
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde du temps prévisionnel:`, error);
      alert(normalizeApiError(error, describeApiEndpoint('/api/data/forecast-times')));
    }
  }, [setForecastEditingInput]);

  const getMaxForecastDaysForMonth = useCallback(
    (resourceId: number, month: string): number => {
      const workdays = countWorkdaysInMonth(month, holidayYmdSet);
      const absences = getAbsenceMapForResource(absenceByResource, resourceId)[month] || 0;
      return Math.max(0, workdays - absences);
    },
    [absenceByResource, holidayYmdSet]
  );

  const commitForecastEdit = useCallback(
    (deliveryId: string | number, resourceId: number, month: string, rawInput: string): boolean => {
      const trimmed = rawInput.trim();
      if (!trimmed) {
        const current = editingMonthRef.current;
        if (current?.deliveryId === deliveryId && current?.month === month) {
          setEditingMonth(null);
          setForecastEditingInput('');
        }
        return true;
      }

      const parsed = parseForecastDaysInput(rawInput);
      if (parsed === null) {
        alert(
          'Le nombre de jours doit être un entier, un quart de jour (0,25) ou une demi-journée (0,5).'
        );
        return false;
      }

      const maxDays = getMaxForecastDaysForMonth(resourceId, month);
      if (parsed > maxDays + 1e-9) {
        alert(
          `Le nombre de jours saisi (${formatForecastDaysFr(parsed)} j) dépasse le maximum autorisé : ${formatForecastDaysFr(maxDays)} j (jours ouvrés du mois moins les absences).`
        );
        return false;
      }

      void saveForecastTime(deliveryId, month, parsed);
      return true;
    },
    [getMaxForecastDaysForMonth, saveForecastTime, setForecastEditingInput]
  );

  const savePlannedDelivery = useCallback(
    async (payload: {
      resourceId: number;
      scenario?: number;
      tjm?: number | null;
      description?: string;
      month?: string;
      days?: number | null;
      delete?: boolean;
    }) => {
      const response = await apiFetch('/api/data/planned-deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await safeParseJson(response);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Erreur lors de la sauvegarde');
      }
      return body.data as PlannedScenario | undefined;
    },
    []
  );

  const patchPlannedScenarioInState = useCallback((updated: PlannedScenario) => {
    setPlannedDeliveriesByResource((prev) => {
      const key = String(updated.resourceId);
      const list = prev[key] || [];
      const exists = list.some(
        (p) => p.resourceId === updated.resourceId && p.scenario === updated.scenario
      );
      return {
        ...prev,
        [key]: exists
          ? list.map((p) =>
              p.resourceId === updated.resourceId && p.scenario === updated.scenario ? updated : p
            )
          : [...list, updated],
      };
    });
  }, []);

  const reloadForecastScenarios = useCallback(async () => {
    try {
      const response = await apiFetch('/api/data/forecast-scenarios');
      const body = await safeParseJson(response);
      if (response.ok && body?.success) {
        setForecastScenarios(Array.isArray(body.data) ? body.data : []);
      }
    } catch (e) {
      console.warn('⚠️ forecast-scenarios:', e);
    }
  }, []);

  const addPlannedDelivery = useCallback(
    (resourceId: number) => {
      if (forecastScenarios.length === 0) {
        alert(
          'Aucun scénario défini. Créez d’abord un scénario via le bouton « Scénarios » en haut de la page.'
        );
        setScenariosOpen(true);
        return;
      }
      if (collapsedPlannedResources.has(resourceId)) {
        setCollapsedPlannedResources((prev) => {
          const next = new Set(prev);
          next.delete(resourceId);
          return next;
        });
      }
      setPendingPlannedAdd({ resourceId, scenarioInput: '' });
    },
    [forecastScenarios.length, collapsedPlannedResources]
  );

  const confirmPendingPlannedAdd = useCallback(async () => {
    if (!pendingPlannedAdd) return;
    const scenario = parseInt(pendingPlannedAdd.scenarioInput.trim(), 10);
    if (!Number.isFinite(scenario) || scenario <= 0) {
      alert('Saisissez un numéro de scénario valide.');
      return;
    }
    if (!forecastScenarios.some((s) => s.number === scenario)) {
      alert(`Le scénario n°${scenario} n’existe pas. Créez-le via « Scénarios ».`);
      return;
    }
    const existing = getPlannedMapForResource(
      plannedDeliveriesByResource,
      pendingPlannedAdd.resourceId
    );
    if (existing.some((p) => p.scenario === scenario)) {
      alert(`Ce collaborateur a déjà une prestation pour le scénario ${scenario}.`);
      return;
    }
    try {
      const created = await savePlannedDelivery({
        resourceId: pendingPlannedAdd.resourceId,
        scenario,
      });
      if (!created) return;
      patchPlannedScenarioInState(created);
      setPendingPlannedAdd(null);
    } catch (error) {
      console.error('❌ Erreur création prestation prévisionnelle:', error);
      alert(normalizeApiError(error, describeApiEndpoint('/api/data/planned-deliveries')));
    }
  }, [
    pendingPlannedAdd,
    forecastScenarios,
    plannedDeliveriesByResource,
    savePlannedDelivery,
    patchPlannedScenarioInState,
  ]);

  const updatePlannedTjm = useCallback(
    async (resourceId: number, scenario: number, rawTjm: string) => {
      const trimmed = rawTjm.trim().replace(',', '.');
      const tjm = trimmed === '' ? null : Number(trimmed);
      if (trimmed !== '' && (Number.isNaN(tjm) || tjm! < 0)) {
        alert('Le TJM doit être un nombre positif.');
        return;
      }
      try {
        const updated = await savePlannedDelivery({ resourceId, scenario, tjm });
        if (!updated) return;
        patchPlannedScenarioInState(updated);
      } catch (error) {
        console.error('❌ Erreur mise à jour TJM:', error);
        alert(normalizeApiError(error, describeApiEndpoint('/api/data/planned-deliveries')));
      }
    },
    [savePlannedDelivery, patchPlannedScenarioInState]
  );

  const updatePlannedDescription = useCallback(
    async (resourceId: number, scenario: number, rawDescription: string) => {
      try {
        const updated = await savePlannedDelivery({
          resourceId,
          scenario,
          description: rawDescription.trim(),
        });
        if (!updated) return;
        patchPlannedScenarioInState(updated);
      } catch (error) {
        console.error('❌ Erreur mise à jour description:', error);
        alert(normalizeApiError(error, describeApiEndpoint('/api/data/planned-deliveries')));
      }
    },
    [savePlannedDelivery, patchPlannedScenarioInState]
  );

  const removePlannedDelivery = useCallback(
    async (resourceId: number, scenario: number) => {
      try {
        await savePlannedDelivery({ resourceId, scenario, delete: true });
        setPlannedDeliveriesByResource((prev) => {
          const key = String(resourceId);
          return {
            ...prev,
            [key]: (prev[key] || []).filter((p) => p.scenario !== scenario),
          };
        });
      } catch (error) {
        console.error('❌ Erreur suppression prestation prévisionnelle:', error);
        alert(normalizeApiError(error, describeApiEndpoint('/api/data/planned-deliveries')));
      }
    },
    [savePlannedDelivery]
  );

  const persistPlannedForecastEdit = useCallback(
    async (planned: PlannedScenario, month: string, days: number | null) => {
      const updated = await savePlannedDelivery({
        resourceId: planned.resourceId,
        scenario: planned.scenario,
        month,
        days,
      });
      if (updated) patchPlannedScenarioInState(updated);
      const current = editingPlannedMonthRef.current;
      if (
        current?.resourceId === planned.resourceId &&
        current?.scenario === planned.scenario &&
        current?.month === month
      ) {
        setEditingPlannedMonth(null);
        setForecastEditingInput('');
      }
    },
    [savePlannedDelivery, patchPlannedScenarioInState, setForecastEditingInput]
  );

  const commitPlannedForecastEdit = useCallback(
    (planned: PlannedScenario, month: string, rawInput: string): boolean => {
      const trimmed = rawInput.trim();
      if (!trimmed) {
        void persistPlannedForecastEdit(planned, month, null).catch((error) => {
          console.error('❌ Erreur suppression temps prévisionnel:', error);
          alert(normalizeApiError(error, describeApiEndpoint('/api/data/planned-deliveries')));
        });
        return true;
      }

      const parsed = parseForecastDaysInput(rawInput);
      if (parsed === null) {
        alert(
          'Le nombre de jours doit être un entier, un quart de jour (0,25) ou une demi-journée (0,5).'
        );
        return false;
      }

      const maxDays = getMaxForecastDaysForMonth(planned.resourceId, month);
      if (parsed > maxDays + 1e-9) {
        alert(
          `Le nombre de jours saisi (${formatForecastDaysFr(parsed)} j) dépasse le maximum autorisé : ${formatForecastDaysFr(maxDays)} j (jours ouvrés du mois moins les absences).`
        );
        return false;
      }

      void persistPlannedForecastEdit(planned, month, parsed).catch((error) => {
        console.error('❌ Erreur sauvegarde temps prévisionnel:', error);
        alert(normalizeApiError(error, describeApiEndpoint('/api/data/planned-deliveries')));
      });
      return true;
    },
    [getMaxForecastDaysForMonth, persistPlannedForecastEdit]
  );

  const findPlannedScenario = useCallback(
    (resourceId: number, scenario: number): PlannedScenario | undefined => {
      return getPlannedMapForResource(plannedDeliveriesByResource, resourceId).find(
        (p) => p.resourceId === resourceId && p.scenario === scenario
      );
    },
    [plannedDeliveriesByResource]
  );

  const beginDeliveryForecastEdit = useCallback(
    (deliveryId: string | number, resourceId: number, month: string) => {
      const target = { deliveryId, resourceId, month };
      const editing = editingMonthRef.current;
      if (
        editing?.deliveryId === deliveryId &&
        editing?.resourceId === resourceId &&
        editing?.month === month
      ) {
        return;
      }

      const plannedEditing = editingPlannedMonthRef.current;
      if (plannedEditing) {
        const planned = findPlannedScenario(plannedEditing.resourceId, plannedEditing.scenario);
        if (
          planned &&
          !commitPlannedForecastEdit(
            planned,
            plannedEditing.month,
            editingInputValueRef.current
          )
        ) {
          return;
        }
        skipBlurCommitRef.current = true;
      }

      if (editing) {
        if (
          !commitForecastEdit(
            editing.deliveryId,
            editing.resourceId,
            editing.month,
            editingInputValueRef.current
          )
        ) {
          return;
        }
        skipBlurCommitRef.current = true;
      }

      setEditingPlannedMonth(null);
      setEditingMonth(target);
      setForecastEditingInput('');
    },
    [commitForecastEdit, commitPlannedForecastEdit, findPlannedScenario, setForecastEditingInput]
  );

  const beginPlannedForecastEdit = useCallback(
    (planned: PlannedScenario, month: string) => {
      const target = {
        resourceId: planned.resourceId,
        scenario: planned.scenario,
        month,
      };
      const editing = editingPlannedMonthRef.current;
      if (
        editing?.resourceId === target.resourceId &&
        editing?.scenario === target.scenario &&
        editing?.month === month
      ) {
        return;
      }

      const deliveryEditing = editingMonthRef.current;
      if (deliveryEditing) {
        if (
          !commitForecastEdit(
            deliveryEditing.deliveryId,
            deliveryEditing.resourceId,
            deliveryEditing.month,
            editingInputValueRef.current
          )
        ) {
          return;
        }
        skipBlurCommitRef.current = true;
      }

      if (editing) {
        const currentPlanned = findPlannedScenario(editing.resourceId, editing.scenario);
        if (
          currentPlanned &&
          !commitPlannedForecastEdit(
            currentPlanned,
            editing.month,
            editingInputValueRef.current
          )
        ) {
          return;
        }
        skipBlurCommitRef.current = true;
      }

      setEditingMonth(null);
      setEditingPlannedMonth(target);
      setForecastEditingInput('');
    },
    [commitForecastEdit, commitPlannedForecastEdit, findPlannedScenario, setForecastEditingInput]
  );

  const handleDeliveryForecastBlur = useCallback(
    (deliveryId: string | number, resourceId: number, month: string) => {
      if (skipBlurCommitRef.current) {
        skipBlurCommitRef.current = false;
        return;
      }
      commitForecastEdit(deliveryId, resourceId, month, editingInputValueRef.current);
    },
    [commitForecastEdit]
  );

  const handlePlannedForecastBlur = useCallback(
    (planned: PlannedScenario, month: string) => {
      if (skipBlurCommitRef.current) {
        skipBlurCommitRef.current = false;
        return;
      }
      commitPlannedForecastEdit(planned, month, editingInputValueRef.current);
    },
    [commitPlannedForecastEdit]
  );

  const handleDeliveryForecastKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      deliveryId: string | number,
      resourceId: number,
      month: string
    ) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const monthIdx = gridMonths.indexOf(month);
        const nextIdx = e.shiftKey ? monthIdx - 1 : monthIdx + 1;
        if (nextIdx < 0 || nextIdx >= gridMonths.length) return;
        beginDeliveryForecastEdit(deliveryId, resourceId, gridMonths[nextIdx]);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!commitForecastEdit(deliveryId, resourceId, month, editingInputValueRef.current)) {
          return;
        }
        skipBlurCommitRef.current = true;
        setEditingMonth(null);
        setForecastEditingInput('');
        return;
      }
      if (e.key === 'Escape') {
        setEditingMonth(null);
        setForecastEditingInput('');
      }
    },
    [gridMonths, commitForecastEdit, beginDeliveryForecastEdit, setForecastEditingInput]
  );

  const handlePlannedForecastKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      planned: PlannedScenario,
      month: string,
      editableMonths: string[]
    ) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const monthIdx = editableMonths.indexOf(month);
        const nextIdx = e.shiftKey ? monthIdx - 1 : monthIdx + 1;
        if (nextIdx < 0 || nextIdx >= editableMonths.length) return;
        beginPlannedForecastEdit(planned, editableMonths[nextIdx]);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!commitPlannedForecastEdit(planned, month, editingInputValueRef.current)) return;
        skipBlurCommitRef.current = true;
        setEditingPlannedMonth(null);
        setForecastEditingInput('');
        return;
      }
      if (e.key === 'Escape') {
        setEditingPlannedMonth(null);
        setForecastEditingInput('');
      }
    },
    [commitPlannedForecastEdit, beginPlannedForecastEdit, setForecastEditingInput]
  );

  const previousYear = gridYear - 1;

  // Cache pour éviter de refaire des recherches variants-ID dans timesheetsAggregate
  // à chaque cellule/ligne rendue.
  const timesheetLookupCacheRef = useRef<
    Map<string, { [month: string]: { days: number; hours: number } } | null>
  >(new Map());
  const consumedDaysCacheRef = useRef<Map<string, number>>(new Map());
  const cumulativePrevYearCacheRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    timesheetLookupCacheRef.current.clear();
    consumedDaysCacheRef.current.clear();
    cumulativePrevYearCacheRef.current.clear();
  }, [timesheetsAggregate]);

  /** Cherche les temps saisis (agrégat) pour une ressource × prestation. */
  const lookupTimesheetData = useCallback(
    (
      deliveryId: string | number,
      resourceId: number
    ): { [month: string]: { days: number; hours: number } } | null => {
      const cacheKey = `${resourceId}|${String(deliveryId)}`;
      if (timesheetLookupCacheRef.current.has(cacheKey)) {
        return timesheetLookupCacheRef.current.get(cacheKey) || null;
      }

      const resourceIdVariants = [
        String(resourceId),
        String(Number(resourceId)),
        Number(resourceId).toString(),
      ];
      const deliveryIdVariants = [
        String(deliveryId),
        String(Number(deliveryId)),
        Number(deliveryId).toString(),
      ];

      for (const resIdVar of resourceIdVariants) {
        if (!timesheetsAggregate[resIdVar]) continue;
        for (const delIdVar of deliveryIdVariants) {
          if (timesheetsAggregate[resIdVar][delIdVar]) {
            const value = timesheetsAggregate[resIdVar][delIdVar];
            timesheetLookupCacheRef.current.set(cacheKey, value);
            return value;
          }
        }
      }

      timesheetLookupCacheRef.current.set(cacheKey, null);
      return null;
    },
    [timesheetsAggregate]
  );

  const getActualDaysForMonth = (
    deliveryId: string | number,
    resourceId: number,
    month: string
  ): number => lookupTimesheetData(deliveryId, resourceId)?.[month]?.days || 0;

  /** Cumul jours saisis sur l’année précédente (colonne de gauche du tableau). */
  const get2025Cumulative = (deliveryId: string | number, resourceId: number): number => {
    const cacheKey = `${resourceId}|${String(deliveryId)}|${previousYear}`;
    if (cumulativePrevYearCacheRef.current.has(cacheKey)) {
      return cumulativePrevYearCacheRef.current.get(cacheKey) || 0;
    }

    const foundData = lookupTimesheetData(deliveryId, resourceId);
    if (!foundData) return 0;

    let total = 0;
    Object.keys(foundData).forEach((month) => {
      if (month.startsWith(`${previousYear}-`)) {
        total += foundData[month].days || 0;
      }
    });

    cumulativePrevYearCacheRef.current.set(cacheKey, total);
    return total;
  };

  // Jours consommés (tous mois, toutes années confondues) pour un duo ressource × prestation.
  // Utilisé intensivement dans le rendu "projects-list".
  const getConsumedDays = (deliveryId: string | number, resourceId: number): number => {
    const cacheKey = `${resourceId}|${String(deliveryId)}`;
    if (consumedDaysCacheRef.current.has(cacheKey)) {
      return consumedDaysCacheRef.current.get(cacheKey) || 0;
    }

    const foundData = lookupTimesheetData(deliveryId, resourceId);
    if (!foundData) return 0;
    let total = 0;
    Object.keys(foundData).forEach((month) => {
      total += foundData[month]?.days || 0;
    });
    consumedDaysCacheRef.current.set(cacheKey, total);
    return total;
  };

  // CA pré-calculé pour éviter de refaire des recherches variants-ID
  // dans timesheetsAggregate à chaque render.
  const resourceCAByYear = useMemo(() => {
    const years = [previousYear, gridYear];
    const out: Record<string, Record<number, number>> = {};

    resources.forEach((resource) => {
      const resourceKey = String(resource.id);
      out[resourceKey] = {};
      const projectsForCA = resource.allProjectsForCA ?? resource.projects;

      years.forEach((year) => {
        let totalCA = 0;

        projectsForCA.forEach((project) => {
          const tjm = project.tjm || 0;
          if (tjm <= 0) return;

          const foundData = lookupTimesheetData(project.id, resource.id);
          if (!foundData) return;

          Object.keys(foundData).forEach((month) => {
            if (month.startsWith(`${year}-`)) {
              const days = foundData[month]?.days || 0;
              totalCA += days * tjm;
            }
          });
        });

        getPlannedMapForResource(plannedDeliveriesByResource, resource.id).forEach((planned) => {
          const tjm = planned.tjm || 0;
          if (tjm <= 0) return;
          Object.entries(planned.forecast || {}).forEach(([month, days]) => {
            if (month.startsWith(`${year}-`)) {
              totalCA += (Number(days) || 0) * tjm;
            }
          });
        });

        out[resourceKey][year] = totalCA;
      });
    });

    return out;
  }, [resources, lookupTimesheetData, gridYear, previousYear, plannedDeliveriesByResource]);

  // Formater le nom du mois
  const formatMonthName = (month: string): string => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="forecast-page">
        <div className="forecast-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          {canScenarios && (
          <button
            type="button"
            className="forecast-scenarios-btn"
            onClick={() => setScenariosOpen(true)}
            data-testid="forecast-scenarios-btn"
          >
            Scénarios
          </button>
          )}
          <h2>Forecast</h2>
        </div>
        <div className="forecast-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Chargement du forecast...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="forecast-page">
        <div className="forecast-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          {canScenarios && (
          <button
            type="button"
            className="forecast-scenarios-btn"
            onClick={() => setScenariosOpen(true)}
            data-testid="forecast-scenarios-btn"
          >
            Scénarios
          </button>
          )}
          <h2>Forecast</h2>
        </div>
        <div className="forecast-container">
          <div className="error-state">
            <p className="error-message">❌ {error}</p>
            <button className="retry-button" onClick={() => void fetchForecast()}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forecast-page" data-testid="forecast-page">
      <div className="forecast-header">
        <button className="back-button" onClick={onBack}>
          ← Retour
        </button>
        {canScenarios && (
        <button
          type="button"
          className="forecast-scenarios-btn"
          onClick={() => setScenariosOpen(true)}
          data-testid="forecast-scenarios-btn"
        >
          Scénarios
        </button>
        )}
        <h2>Forecast</h2>
      </div>
      <div className="forecast-container">
        {/* Filtres de période */}
        <div className="forecast-filters">
          <div className="date-filters-group">
            <div className="date-filter">
              <label htmlFor="start-date">Date de début :</label>
              <div className="forecast-date-field">
                <input
                  type="text"
                  id="start-date"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="jj/mm/aaaa"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="date-input forecast-date-text-input"
                />
                <input
                  ref={startDatePickerRef}
                  type="date"
                  className="forecast-native-date-hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setStartDateInput(formatYmdToFr(v));
                  }}
                />
                <button
                  type="button"
                  className="forecast-calendar-btn"
                  onClick={openStartDatePicker}
                  aria-label="Calendrier date de début"
                  title="Choisir dans le calendrier"
                >
                  📅
                </button>
              </div>
            </div>
            <div className="date-filter">
              <label htmlFor="end-date">Date de fin :</label>
              <div className="forecast-date-field">
                <input
                  type="text"
                  id="end-date"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="jj/mm/aaaa"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="date-input forecast-date-text-input"
                />
                <input
                  ref={endDatePickerRef}
                  type="date"
                  className="forecast-native-date-hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setEndDateInput(formatYmdToFr(v));
                  }}
                />
                <button
                  type="button"
                  className="forecast-calendar-btn"
                  onClick={openEndDatePicker}
                  aria-label="Calendrier date de fin"
                  title="Choisir dans le calendrier"
                >
                  📅
                </button>
              </div>
            </div>
            <button className="refresh-button" onClick={handleActualiser}>
              Actualiser
            </button>
            
            {/* Filtres Type et Statut */}
            <div className="filters-container">
          {/* Filtre Type */}
          <div className="filter-dropdown-container">
            <button
              className="filter-button"
              onClick={() => {
                setTypeDropdownOpen(!typeDropdownOpen);
                setStatutDropdownOpen(false);
              }}
            >
              Type
              {typeFilter.length > 0 && (
                <span className="filter-badge">{typeFilter.length}</span>
              )}
              <span className="dropdown-arrow">{typeDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {typeDropdownOpen && (
              <div className="filter-dropdown">
                <div className="filter-dropdown-content">
                  {allTypeOptions.map((type) => (
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

          {/* Filtre Statut */}
          <div className="filter-dropdown-container">
            <button
              className="filter-button"
              onClick={() => {
                setStatutDropdownOpen(!statutDropdownOpen);
                setTypeDropdownOpen(false);
              }}
            >
              Statut
              {statutFilter.length > 0 && (
                <span className="filter-badge">{statutFilter.length}</span>
              )}
              <span className="dropdown-arrow">{statutDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {statutDropdownOpen && (
              <div className="filter-dropdown">
                <div className="filter-dropdown-content">
                  {allStatutOptions.map((statut) => {
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
        </div>

        {filteredResources.length === 0 ? (
          <div className="empty-state">
            <p className="empty-message">Aucune prestation trouvée</p>
            <p className="empty-details">Aucune ressource n'a de prestations dans la période sélectionnée ou ne correspond aux filtres.</p>
          </div>
        ) : (
          <>
            {currentResources.map((resource) => {
              const isExpanded = expandedResources.has(resource.id);
              return (
                <div key={resource.id} className="resource-card">
                  <div className="resource-header" onClick={() => toggleResourceExpanded(resource.id)}>
                    <h3 className="resource-name">{resource.prenom} {resource.nom}</h3>
                    <div className="resource-header-right">
                      <span className="resource-ca">
                        CA {previousYear}: {(resourceCAByYear[String(resource.id)]?.[previousYear] ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                      </span>
                      <span className="resource-ca">
                        CA {gridYear}: {(resourceCAByYear[String(resource.id)]?.[gridYear] ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                      </span>
                      <span className="projects-count">{resource.projects.length} prestation{resource.projects.length > 1 ? 's' : ''}</span>
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="projects-list">
                        <div className="projects-list-container">
                          {(() => {
                            const resAbs = getAbsenceMapForResource(absenceByResource, resource.id);
                            const months = gridMonths;
                            const gridYearLocal = gridYear;
                            const prevYear = gridYearLocal - 1;
                            const totalPrevYear = sumAbsencesForYear(resAbs, prevYear);
                            const maxDays = Math.max(
                              totalPrevYear,
                              ...months.map((m) => resAbs[m] || 0),
                              1
                            );
                            return (
                              <div className="project-card forecast-absences-block">
                                <div className="project-months">
                                  <table className="forecast-table forecast-absences-compact">
                                    <tbody>
                                      <tr className="forecast-absences-row forecast-absences-row-headers">
                                        <th className="forecast-absences-corner" scope="row">
                                          Absences
                                        </th>
                                        <th className="forecast-absences-month-head" scope="col">
                                          <span className="forecast-absences-month-primary">{prevYear}</span>
                                          <span
                                            className="forecast-absences-month-workdays"
                                            title={`${countWorkdaysInYear(prevYear, holidayYmdSet)} jours ouvrés en ${prevYear} (lun–ven, fériés métropole exclus)`}
                                          >
                                            {countWorkdaysInYear(prevYear, holidayYmdSet)}
                                          </span>
                                        </th>
                                        {months.map((month) => {
                                          const ouv = countWorkdaysInMonth(month, holidayYmdSet);
                                          return (
                                            <th
                                              key={month}
                                              className="forecast-absences-month-head"
                                              scope="col"
                                            >
                                              <span className="forecast-absences-month-primary">
                                                {formatMonthName(month)}
                                              </span>
                                              <span
                                                className="forecast-absences-month-workdays"
                                                title={`${ouv} jours ouvrés (lun–ven, fériés métropole exclus)`}
                                              >
                                                {ouv}
                                              </span>
                                            </th>
                                          );
                                        })}
                                      </tr>
                                      <tr className="forecast-absences-row forecast-absences-row-values">
                                        <th className="forecast-absences-corner" scope="row">
                                          Nombre
                                        </th>
                                        <td
                                          className="forecast-absences-cell"
                                          style={{
                                            backgroundColor: absenceCellBackground(totalPrevYear, maxDays)
                                          }}
                                        >
                                          {totalPrevYear > 0 ? totalPrevYear.toFixed(1) : '—'}
                                        </td>
                                        {months.map((month) => {
                                          const d = resAbs[month] || 0;
                                          return (
                                            <td
                                              key={month}
                                              className="forecast-absences-cell"
                                              style={{
                                                backgroundColor: absenceCellBackground(d, maxDays)
                                              }}
                                            >
                                              {d > 0 ? Number(d).toFixed(1) : '—'}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                          {(() => {
                            const plannedItems = getPlannedMapForResource(
                              plannedDeliveriesByResource,
                              resource.id
                            );
                            const months = gridMonths;
                            const editablePlannedMonths = months.filter((m) =>
                              isPlannedMonthEditable(m, gridYear)
                            );
                            const isPlannedExpanded = !collapsedPlannedResources.has(resource.id);
                            return (
                              <div className="project-card forecast-planned-block">
                                <div
                                  className={`forecast-planned-toolbar ${isPlannedExpanded ? '' : 'forecast-planned-toolbar--collapsed'}`}
                                >
                                  <button
                                    type="button"
                                    className="forecast-planned-toggle"
                                    onClick={() => togglePlannedExpanded(resource.id)}
                                    aria-expanded={isPlannedExpanded}
                                  >
                                    <span className="expand-icon" aria-hidden>
                                      {isPlannedExpanded ? '▼' : '▶'}
                                    </span>
                                    <span className="forecast-planned-title">
                                      Prestations prévisionnelles ({gridYear})
                                      {plannedItems.length > 0
                                        ? ` — ${plannedItems.length} scénario${plannedItems.length > 1 ? 's' : ''}`
                                        : ''}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className="forecast-planned-add-btn"
                                    title="Ajouter une prestation prévisionnelle"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isPlannedExpanded) {
                                        togglePlannedExpanded(resource.id);
                                      }
                                      void addPlannedDelivery(resource.id);
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                                {pendingPlannedAdd?.resourceId === resource.id && (
                                  <div className="forecast-planned-add-form">
                                    <label htmlFor={`planned-scenario-${resource.id}`}>N° scénario</label>
                                    <input
                                      id={`planned-scenario-${resource.id}`}
                                      type="number"
                                      min={1}
                                      step={1}
                                      className="forecast-planned-scenario-input"
                                      list={`scenario-options-${resource.id}`}
                                      value={pendingPlannedAdd.scenarioInput}
                                      onChange={(e) =>
                                        setPendingPlannedAdd({
                                          resourceId: resource.id,
                                          scenarioInput: e.target.value,
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          void confirmPendingPlannedAdd();
                                        }
                                        if (e.key === 'Escape') setPendingPlannedAdd(null);
                                      }}
                                      placeholder="Ex. 1"
                                      autoFocus
                                    />
                                    <datalist id={`scenario-options-${resource.id}`}>
                                      {forecastScenarios.map((s) => (
                                        <option
                                          key={s.number}
                                          value={String(s.number)}
                                          label={s.title ? `${s.number} — ${s.title}` : String(s.number)}
                                        />
                                      ))}
                                    </datalist>
                                    <button
                                      type="button"
                                      className="forecast-planned-add-confirm-btn"
                                      onClick={() => void confirmPendingPlannedAdd()}
                                    >
                                      Créer
                                    </button>
                                    <button
                                      type="button"
                                      className="forecast-planned-add-cancel-btn"
                                      onClick={() => setPendingPlannedAdd(null)}
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                )}
                                {isPlannedExpanded &&
                                  (plannedItems.length > 0 ||
                                    pendingPlannedAdd?.resourceId === resource.id) && (
                                  <div className="project-months">
                                    <table className="forecast-table forecast-planned-compact">
                                      <tbody>
                                        <tr className="forecast-planned-row forecast-planned-row-headers">
                                          <th className="forecast-planned-corner forecast-planned-corner-head" scope="row">
                                            Prestation
                                          </th>
                                          {months.map((month) => {
                                            const ouv = countWorkdaysInMonth(month, holidayYmdSet);
                                            const editable = isPlannedMonthEditable(month, gridYear);
                                            return (
                                              <th
                                                key={month}
                                                className={`forecast-planned-month-head ${editable ? '' : 'forecast-planned-month-head--locked'}`}
                                                scope="col"
                                              >
                                                <span className="forecast-planned-month-primary">
                                                  {formatMonthName(month)}
                                                </span>
                                                <span
                                                  className="forecast-planned-month-workdays"
                                                  title={`${ouv} jours ouvrés (lun–ven, fériés métropole exclus)`}
                                                >
                                                  {ouv}
                                                </span>
                                              </th>
                                            );
                                          })}
                                          <th
                                            className="forecast-planned-actions-head"
                                            scope="col"
                                            aria-label="Actions"
                                          />
                                        </tr>
                                        {plannedItems.map((planned) => (
                                          <tr
                                            key={`${planned.resourceId}-${planned.scenario}`}
                                            className="forecast-planned-row forecast-planned-row-values"
                                          >
                                            <th className="forecast-planned-corner" scope="row">
                                              <div className="forecast-planned-row-head">
                                                <input
                                                  type="number"
                                                  className="forecast-planned-scenario-input"
                                                  value={planned.scenario}
                                                  readOnly
                                                  title={getScenarioDisplayLabel(
                                                    planned.scenario,
                                                    forecastScenarios
                                                  )}
                                                  aria-label={`Scénario ${planned.scenario}`}
                                                />
                                                {forecastScenarios.find(
                                                  (s) => s.number === planned.scenario
                                                )?.title && (
                                                  <span
                                                    className="forecast-planned-scenario-title"
                                                    title={
                                                      forecastScenarios.find(
                                                        (s) => s.number === planned.scenario
                                                      )?.description || ''
                                                    }
                                                  >
                                                    {
                                                      forecastScenarios.find(
                                                        (s) => s.number === planned.scenario
                                                      )?.title
                                                    }
                                                  </span>
                                                )}
                                                <span className="forecast-planned-sep" aria-hidden>
                                                  –
                                                </span>
                                                <input
                                                  type="text"
                                                  inputMode="decimal"
                                                  className="forecast-planned-tjm-input"
                                                  defaultValue={
                                                    planned.tjm != null ? String(planned.tjm) : ''
                                                  }
                                                  key={`${planned.resourceId}-${planned.scenario}-tjm-${planned.tjm ?? 'empty'}`}
                                                  placeholder="TJM"
                                                  title="TJM (€)"
                                                  onClick={(e) => e.stopPropagation()}
                                                  onBlur={(e) => {
                                                    void updatePlannedTjm(
                                                      planned.resourceId,
                                                      planned.scenario,
                                                      e.target.value
                                                    );
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      (e.target as HTMLInputElement).blur();
                                                    }
                                                  }}
                                                />
                                                <span className="forecast-planned-sep" aria-hidden>
                                                  –
                                                </span>
                                                <input
                                                  type="text"
                                                  className="forecast-planned-description-input"
                                                  defaultValue={planned.description || ''}
                                                  key={`${planned.resourceId}-${planned.scenario}-desc-${planned.description || ''}`}
                                                  placeholder="Description"
                                                  title="Description"
                                                  onClick={(e) => e.stopPropagation()}
                                                  onBlur={(e) => {
                                                    void updatePlannedDescription(
                                                      planned.resourceId,
                                                      planned.scenario,
                                                      e.target.value
                                                    );
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      (e.target as HTMLInputElement).blur();
                                                    }
                                                  }}
                                                />
                                              </div>
                                            </th>
                                            {months.map((month) => {
                                              const forecastDays = planned.forecast?.[month] ?? 0;
                                              const editable = isPlannedMonthEditable(month, gridYear);
                                              const isEditing =
                                                editingPlannedMonth?.resourceId === planned.resourceId &&
                                                editingPlannedMonth?.scenario === planned.scenario &&
                                                editingPlannedMonth?.month === month;
                                              return (
                                                <td
                                                  key={month}
                                                  className={`forecast-planned-cell ${editable ? '' : 'forecast-planned-cell--locked'}`}
                                                >
                                                  {!editable ? (
                                                    <span className="forecast-planned-locked-value">
                                                      {forecastDays > 0 ? forecastDays.toFixed(1) : '—'}
                                                    </span>
                                                  ) : isEditing ? (
                                                    <input
                                                      type="text"
                                                      inputMode="decimal"
                                                      value={editingInputValue}
                                                      className="forecast-input forecast-planned-forecast-input"
                                                      autoFocus
                                                      onClick={(e) => e.stopPropagation()}
                                                      onChange={(e) =>
                                                        setForecastEditingInput(
                                                          sanitizeForecastDaysInput(e.target.value)
                                                        )
                                                      }
                                                      onBlur={() => handlePlannedForecastBlur(planned, month)}
                                                      onKeyDown={(e) =>
                                                        handlePlannedForecastKeyDown(
                                                          e,
                                                          planned,
                                                          month,
                                                          editablePlannedMonths
                                                        )
                                                      }
                                                    />
                                                  ) : (
                                                    <div
                                                      className={`forecast-display forecast-planned-display ${
                                                        forecastDays > 0 ? 'has-forecast' : 'no-forecast'
                                                      }`}
                                                      onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        beginPlannedForecastEdit(planned, month);
                                                      }}
                                                      title="Cliquez pour saisir le temps prévisionnel"
                                                    >
                                                      {forecastDays > 0 ? forecastDays.toFixed(1) : '—'}
                                                    </div>
                                                  )}
                                                </td>
                                              );
                                            })}
                                            <td className="forecast-planned-actions-cell">
                                              <button
                                                type="button"
                                                className="forecast-planned-trash-btn"
                                                title="Supprimer cette prestation prévisionnelle"
                                                aria-label="Supprimer cette prestation prévisionnelle"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  void removePlannedDelivery(
                                                    planned.resourceId,
                                                    planned.scenario
                                                  );
                                                }}
                                              >
                                                <svg
                                                  viewBox="0 0 20 20"
                                                  width="14"
                                                  height="14"
                                                  aria-hidden="true"
                                                  focusable="false"
                                                >
                                                  <path
                                                    fill="currentColor"
                                                    d="M6.5 2a1 1 0 0 0-1 1v1H3.75a.75.75 0 0 0 0 1.5h.71l.83 10.02A1.75 1.75 0 0 0 7.07 17.5h5.86a1.75 1.75 0 0 0 1.78-1.98l.83-10.02h.71a.75.75 0 0 0 0-1.5H14.5V3a1 1 0 0 0-1-1h-7ZM8 4h4V3.5H8V4Zm1.25 4.25a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0v-5.5Zm3.5 0a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0v-5.5ZM6.12 6.5l.78 9.38c.05.6.55 1.07 1.17 1.07h5.86c.62 0 1.12-.47 1.17-1.07l.78-9.38H6.12Z"
                                                  />
                                                </svg>
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {resource.projects.length === 0 && (
                            <div className="no-projects">
                              <p className="no-projects-message">Aucune prestation trouvée pour cette ressource</p>
                              <p className="no-projects-details">Vérifiez que la ressource a des prestations dans la période sélectionnée ou consultez les logs du serveur.</p>
                            </div>
                          )}
                          {resource.projects.map((project, index) => {
                            const deliveryId = String(project.id);
                            const isDeliveryExpanded = expandedDeliveries.has(deliveryId);
                            const actualTimes = getActualTimesForDelivery(project.id, resource.id);
                            const forecastTimes = forecastByDeliveryId[deliveryId] || {};
                            const actualPrevYearCum = get2025Cumulative(project.id, resource.id);
                            
                            // Utiliser les jours commandés depuis la prestation déjà chargée
                            const orderedDays = project.orderedDays !== null && project.orderedDays !== undefined 
                              ? project.orderedDays 
                              : (orderedDaysByDeliveryId[deliveryId] ?? null);
                            
                            // Calculer les jours consommés (tous les mois)
                            const consumedDays = getConsumedDays(project.id, resource.id);

                            // Calculer le CA (jours consommés * TJM)
                            const ca =
                              project.tjm !== null && project.tjm !== undefined && consumedDays > 0
                                ? consumedDays * project.tjm
                                : 0;
                            
                            return (
                              <div key={`${project.id}-${index}`} className="project-card">
                                <div 
                                  className="project-header" 
                                  onClick={() => toggleDeliveryExpanded(project.id)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <div className="project-header-content">
                                    <div className="project-title-section">
                                      <span className="expand-icon" style={{ fontSize: '0.7rem', color: '#2C5F5D', marginRight: '0.5rem' }}>
                                        {isDeliveryExpanded ? '▼' : '▶'}
                                      </span>
                                      <span className="project-title-inline">{project.title}</span>
                                    </div>
                                    <span className="project-ref-inline">Réf: {project.reference || project.id || 'N/A'}</span>
                                    <span className="project-dates-inline">
                                      {formatDate(project.startDate)} - {formatDate(project.endDate)}
                                    </span>
                                    {project.tjm !== null && project.tjm !== undefined ? (
                                      <span className="project-tjm-inline">
                                        TJM: {project.tjm.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                      </span>
                                    ) : (
                                      <span className="project-tjm-inline"></span>
                                    )}
                                    <button className="project-button project-button-ordered" onClick={(e) => e.stopPropagation()}>
                                      Cde : {orderedDays !== null && orderedDays !== undefined ? orderedDays.toFixed(0) : '-'}
                                    </button>
                                    <button className="project-button project-button-consumed" onClick={(e) => e.stopPropagation()}>
                                      Conso : {consumedDays.toFixed(1)}
                                    </button>
                                    <button 
                                      className={`project-button project-button-delta ${
                                        orderedDays !== null && orderedDays !== undefined
                                          ? (orderedDays - consumedDays > 0 ? 'delta-positive' : orderedDays - consumedDays < 0 ? 'delta-negative' : '')
                                          : 'delta-na'
                                      }`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Delta : {orderedDays !== null && orderedDays !== undefined 
                                        ? (orderedDays - consumedDays).toFixed(1)
                                        : '-'}
                                    </button>
                                    <button className="project-button project-button-ca" onClick={(e) => e.stopPropagation()}>
                                      CA : {ca > 0 ? ca.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0'} €
                                    </button>
                                  </div>
                                </div>
                                {isDeliveryExpanded && (
                                <div className="project-months">
                                  <table className="forecast-table">
                                    <thead>
                                      <tr>
                                        <th className="table-row-label"></th>
                                        <th className="table-header">{new Date().getFullYear() - 1}</th>
                                        {gridMonths.map((month) => (
                                          <th key={month} className="table-header">
                                            {formatMonthName(month)}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* Ligne Temps saisi */}
                                      <tr className="forecast-row">
                                        <td className="table-row-label">Temps saisi</td>
                                        <td className="table-cell actual-cell">
                                          <span className={actualPrevYearCum > 0 ? 'has-hours' : 'no-hours'}>
                                            {actualPrevYearCum > 0 ? actualPrevYearCum.toFixed(1) : '-'}
                                          </span>
                                        </td>
                                        {gridMonths.map((month) => {
                                          const actualDays = getActualDaysForMonth(project.id, resource.id, month);
                                          return (
                                            <td key={month} className="table-cell actual-cell">
                                              <span className={actualDays > 0 ? 'has-hours' : 'no-hours'}>
                                                {actualDays > 0 ? actualDays.toFixed(1) : '-'}
                                              </span>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                      {/* Ligne Temps prévisionnel */}
                                      <tr className="forecast-row">
                                        <td className="table-row-label">Temps prévisionnel</td>
                                        <td className="table-cell forecast-cell">
                                          <span className="no-forecast">-</span>
                                        </td>
                                        {gridMonths.map((month) => {
                                          const forecastDays = forecastTimes[month] ?? 0;
                                          const actualDays = actualTimes[month] ?? 0;
                                          const isEditing =
                                            editingMonth?.deliveryId === project.id &&
                                            editingMonth?.resourceId === resource.id &&
                                            editingMonth?.month === month;
                                          
                                          // Vérifier si le mois est au-delà de la date de fin
                                          const monthDate = new Date(month + '-01');
                                          const endDate = project.endDate ? new Date(project.endDate) : null;
                                          const isBeyondEndDate = endDate && monthDate > endDate;

                                          const hasForecastSaisi = Object.prototype.hasOwnProperty.call(
                                            forecastTimes,
                                            month
                                          );
                                          const hasActualSaisi = Object.prototype.hasOwnProperty.call(actualTimes, month);
                                          const showForecastDelta =
                                            isMonthCurrentOrPast(month) && hasForecastSaisi && hasActualSaisi;

                                          const rawDelta = actualDays - forecastDays;
                                          const deltaNearZero = Math.abs(rawDelta) < 0.05;
                                          const deltaDisplayText = deltaNearZero
                                            ? '-'
                                            : rawDelta > 0
                                              ? `+${rawDelta.toFixed(1)}`
                                              : rawDelta.toFixed(1);
                                          
                                          return (
                                            <td 
                                              key={month} 
                                              className={`table-cell forecast-cell ${isBeyondEndDate ? 'beyond-end-date' : ''}`}
                                            >
                                              {isEditing ? (
                                                <input
                                                  type="text"
                                                  inputMode="decimal"
                                                  value={editingInputValue}
                                                  className={`forecast-input ${isBeyondEndDate ? 'beyond-end-date-input' : ''}`}
                                                  autoFocus
                                                  style={isBeyondEndDate ? { backgroundColor: '#F26B69', color: 'white' } : {}}
                                                  onChange={(e) =>
                                                    setForecastEditingInput(
                                                      sanitizeForecastDaysInput(e.target.value)
                                                    )
                                                  }
                                                  onBlur={() =>
                                                    handleDeliveryForecastBlur(project.id, resource.id, month)
                                                  }
                                                  onKeyDown={(e) =>
                                                    handleDeliveryForecastKeyDown(
                                                      e,
                                                      project.id,
                                                      resource.id,
                                                      month
                                                    )
                                                  }
                                                />
                                              ) : showForecastDelta ? (
                                                <div
                                                  className={`forecast-display forecast-display-delta ${isBeyondEndDate ? 'beyond-end-date' : ''}`}
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    beginDeliveryForecastEdit(project.id, resource.id, month);
                                                  }}
                                                  title={`Δ saisi − prévi : ${deltaDisplayText} (saisi ${actualDays.toFixed(1)}, prévi ${forecastDays.toFixed(1)}) — cliquer pour modifier`}
                                                >
                                                  {deltaDisplayText}
                                                </div>
                                              ) : (
                                                <div
                                                  className={`forecast-display ${forecastDays > 0 ? 'has-forecast' : 'no-forecast'} ${isBeyondEndDate ? 'beyond-end-date' : ''}`}
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    beginDeliveryForecastEdit(project.id, resource.id, month);
                                                  }}
                                                  title={isBeyondEndDate ? 'Mois au-delà de la date de fin - saisie possible' : 'Cliquez pour modifier'}
                                                >
                                                  {forecastDays > 0 ? forecastDays.toFixed(1) : '-'}
                                                </div>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-container">
                <div className="pagination-info">
                  <span>
                    Affichage de {startIndex + 1} à {Math.min(endIndex, filteredResources.length)} sur {filteredResources.length} ressource{filteredResources.length > 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="pagination">
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    ‹ Précédent
                  </button>
                  
                  <div className="pagination-numbers">
                    {getPageNumbers().map((page) => (
                      <button
                        key={page}
                        className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Suivant ›
                  </button>
                </div>
              </div>
            )}

            <div className="forecast-summary">
              <p>Total : <strong>{filteredResources.length}</strong> ressource{filteredResources.length > 1 ? 's' : ''} avec prestations</p>
            </div>
          </>
        )}
      </div>
      {canScenarios && scenariosOpen && (
        <ForecastScenarios
          onClose={() => setScenariosOpen(false)}
          onChanged={() => void reloadForecastScenarios()}
        />
      )}
    </div>
  );
};

export default Forecast;
