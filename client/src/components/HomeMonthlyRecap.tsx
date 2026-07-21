import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { isAuthEnabled } from '../auth/msalConfig';
import { PERMISSIONS } from '../auth/roles';
import HomeTreasuryPlanChart, { TreasuryPlanMonthRow } from './HomeTreasuryPlanChart';
import HomeMonthlyRecapChart from './HomeMonthlyRecapChart';
import HomeDashboardZone, { DashboardZoneViewMode } from './HomeDashboardZone';
import {
  aggregateQuarterMonths,
  countFinancialTableColumns,
  groupMonthlyByQuarter,
} from '../utils/financialQuarters';
import './HomeMonthlyRecap.css';
import './HomeMonthlyRecapChart.css';
import './HomeDashboardZone.css';

interface HomeMonthlyRow {
  month: string;
  caAnimaNeo: number;
  caSousTraitance: number;
  margeBruteAnimaNeo: number;
  margeBruteSousTraitance: number;
  resultat: number;
  taceBaseDays?: number;
  taceSource?: 'actual' | 'forecast';
  taceIsClosedMonth?: boolean;
  workdaysInMonth?: number;
  taceDenominatorDays?: number;
  tacePct: number;
  besoinsCrees: number;
  besoinsStock: number;
  besoinsGagnes: number;
  besoinsPerdus: number;
  besoinsAbandonnes: number;
  besoinsStandBy: number;
  delaiMoyenReponseDays: number;
  delaiMoyenReponseCount?: number;
}

interface ForecastScenarioMeta {
  number: number;
  title: string;
  description: string;
}

interface HomeMonthlyRecapResponse {
  year: number;
  monthly: HomeMonthlyRow[];
  meta?: {
    taceEligibleResourceTypes?: string[];
    taceEligibleResourcesCount?: number;
    taceFormula?: string;
    plannedScenarios?: number[];
    forecastScenarios?: ForecastScenarioMeta[];
    plannedScenarioFilter?: 'all' | number;
    plannedScenarioFilterLabel?: string;
    caForecastFormula?: string;
    resultatForecastFormula?: string;
  };
}

const HomeMonthlyRecap: React.FC = () => {
  const auth = useAuth();
  const authOn = isAuthEnabled();
  const canFinancial = !authOn || auth?.canView(PERMISSIONS.VIEW_HOME_FINANCIAL);
  const canBesoins = !authOn || auth?.canView(PERMISSIONS.VIEW_HOME_BESOINS);
  const canTreasury = !authOn || auth?.canView(PERMISSIONS.VIEW_HOME_TREASURY);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedScenario, setSelectedScenario] = useState<string>('none');
  const [isBesoinsExpanded, setIsBesoinsExpanded] = useState<boolean>(true);
  const [expandedFinancialQuarters, setExpandedFinancialQuarters] = useState<Record<string, boolean>>({});
  const [financialViewMode, setFinancialViewMode] = useState<DashboardZoneViewMode>('chart');
  const [besoinsViewMode, setBesoinsViewMode] = useState<DashboardZoneViewMode>('chart');
  const [treasuryViewMode, setTreasuryViewMode] = useState<DashboardZoneViewMode>('chart');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HomeMonthlyRecapResponse | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(true);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);
  const [treasuryMonthly, setTreasuryMonthly] = useState<TreasuryPlanMonthRow[]>([]);
  const [treasurySettings, setTreasurySettings] = useState({
    averagePaymentDelayDays: 30,
    initialBalance: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const scenarioParam = `&scenario=${encodeURIComponent(selectedScenario || 'none')}`;
        const response = await apiFetch(
          `/api/dashboard/home-monthly-recap?year=${selectedYear}${scenarioParam}`
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Erreur ${response.status}`);
        }
        if (!cancelled) setData(body as HomeMonthlyRecapResponse);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur inconnue');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, selectedScenario]);

  useEffect(() => {
    if (!canTreasury) {
      setTreasuryLoading(false);
      setTreasuryMonthly([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setTreasuryLoading(true);
      setTreasuryError(null);
      try {
        const scenarioParam = `&scenario=${encodeURIComponent(selectedScenario || 'none')}`;
        const response = await apiFetch(
          `/api/dashboard/treasury-plan?year=${selectedYear}${scenarioParam}`
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Erreur ${response.status}`);
        }
        if (!cancelled) {
          setTreasuryMonthly(Array.isArray(body.monthly) ? body.monthly : []);
          setTreasurySettings({
            averagePaymentDelayDays: Number(body?.settings?.averagePaymentDelayDays) || 30,
            initialBalance: Number(body?.settings?.initialBalance) || 0,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setTreasuryError(e instanceof Error ? e.message : 'Erreur inconnue');
          setTreasuryMonthly([]);
        }
      } finally {
        if (!cancelled) setTreasuryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, selectedScenario, canTreasury]);

  const scenarioOptions = useMemo(() => {
    const fromCatalog = data?.meta?.forecastScenarios || [];
    if (fromCatalog.length > 0) {
      return fromCatalog
        .map((s) => Number(s.number))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
    }
    const fromApi = data?.meta?.plannedScenarios || [];
    const unique = Array.from(new Set(fromApi)).sort((a, b) => a - b);
    return unique;
  }, [data?.meta?.forecastScenarios, data?.meta?.plannedScenarios]);

  const scenarioLabel = useCallback(
    (n: number): string => {
      const catalog = data?.meta?.forecastScenarios || [];
      const formatOne = (num: number): string => {
        const entry = catalog.find((s) => s.number === num);
        return entry?.title?.trim() ? `${num} — ${entry.title.trim()}` : `P${num}`;
      };
      if (n <= 1) return formatOne(1);
      return `${formatOne(1)} à ${formatOne(n)}`;
    },
    [data?.meta?.forecastScenarios]
  );

  useEffect(() => {
    if (selectedScenario === 'none') return;
    const n = parseInt(selectedScenario, 10);
    if (!Number.isFinite(n) || !scenarioOptions.includes(n)) {
      setSelectedScenario('none');
    }
  }, [selectedScenario, scenarioOptions]);

  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 5; y <= currentYear + 1; y += 1) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const toNumberOrZero = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const totals = useMemo(() => {
    const rows = data?.monthly || [];
    const reduced = rows.reduce(
      (acc, r) => ({
        caAnimaNeo: acc.caAnimaNeo + toNumberOrZero(r.caAnimaNeo),
        caSousTraitance: acc.caSousTraitance + toNumberOrZero(r.caSousTraitance),
        margeBruteAnimaNeo: acc.margeBruteAnimaNeo + toNumberOrZero(r.margeBruteAnimaNeo),
        margeBruteSousTraitance: acc.margeBruteSousTraitance + toNumberOrZero(r.margeBruteSousTraitance),
        resultat: acc.resultat + toNumberOrZero(r.resultat),
        taceBaseDays: acc.taceBaseDays + toNumberOrZero(r.taceBaseDays),
        tacePct: 0,
        besoinsCrees: acc.besoinsCrees + toNumberOrZero(r.besoinsCrees),
        besoinsStock: acc.besoinsStock + toNumberOrZero(r.besoinsStock),
        besoinsGagnes: acc.besoinsGagnes + toNumberOrZero(r.besoinsGagnes),
        besoinsPerdus: acc.besoinsPerdus + toNumberOrZero(r.besoinsPerdus),
        besoinsAbandonnes: acc.besoinsAbandonnes + toNumberOrZero(r.besoinsAbandonnes),
        besoinsStandBy: acc.besoinsStandBy + toNumberOrZero(r.besoinsStandBy),
        delaiMoyenReponseDays:
          acc.delaiMoyenReponseDays +
          toNumberOrZero(r.delaiMoyenReponseDays) * toNumberOrZero(r.delaiMoyenReponseCount),
        delaiMoyenReponseCount: acc.delaiMoyenReponseCount + toNumberOrZero(r.delaiMoyenReponseCount),
      }),
      {
        caAnimaNeo: 0,
        caSousTraitance: 0,
        margeBruteAnimaNeo: 0,
        margeBruteSousTraitance: 0,
        resultat: 0,
        taceBaseDays: 0,
        tacePct: 0,
        besoinsCrees: 0,
        besoinsStock: 0,
        besoinsGagnes: 0,
        besoinsPerdus: 0,
        besoinsAbandonnes: 0,
        besoinsStandBy: 0,
        delaiMoyenReponseDays: 0,
        delaiMoyenReponseCount: 0,
      }
    );
    const denominator = rows.reduce((s, r) => s + toNumberOrZero(r.taceDenominatorDays), 0);
    reduced.tacePct = denominator > 0 ? (reduced.taceBaseDays / denominator) * 100 : 0;
    reduced.delaiMoyenReponseDays =
      reduced.delaiMoyenReponseCount > 0
        ? reduced.delaiMoyenReponseDays / reduced.delaiMoyenReponseCount
        : 0;
    return reduced;
  }, [data?.monthly]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const formatPct = (value: number) => `${(value || 0).toFixed(1)} %`;
  const formatDays = (value: number) => `${(value || 0).toFixed(1)} j`;

  const marginPctOfCa = (margin: number, ca: number) =>
    ca > 0 ? (margin / ca) * 100 : null;

  const formatMarginPctCell = (margin: number, ca: number) => {
    const pct = marginPctOfCa(margin, ca);
    return pct != null ? formatPct(pct) : '—';
  };
  const financialMonthClass = (row: HomeMonthlyRow) =>
    row.taceIsClosedMonth ? 'financial-month-closed' : 'financial-month-forecast';
  const financialResultClass = (row: HomeMonthlyRow) =>
    row.taceIsClosedMonth ? 'financial-highlight-closed' : 'financial-highlight-forecast';
  const financialQuarterMonthClass = (isClosedMonth: boolean) =>
    isClosedMonth ? 'financial-month-closed' : 'financial-month-forecast';
  const financialQuarterResultClass = (isClosedMonth: boolean) =>
    isClosedMonth ? 'financial-highlight-closed' : 'financial-highlight-forecast';

  const financialQuarterGroups = useMemo(
    () => groupMonthlyByQuarter(data?.monthly || []),
    [data?.monthly]
  );

  useEffect(() => {
    setExpandedFinancialQuarters((prev) => {
      const next = { ...prev };
      let changed = false;
      financialQuarterGroups.forEach((group) => {
        if (!(group.key in next)) {
          next[group.key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [financialQuarterGroups]);

  const isFinancialQuarterExpanded = (quarterKey: string) =>
    expandedFinancialQuarters[quarterKey] ?? true;

  const toggleFinancialQuarter = (quarterKey: string) => {
    setExpandedFinancialQuarters((prev) => ({
      ...prev,
      [quarterKey]: !(prev[quarterKey] ?? true),
    }));
  };

  const financialTableColumnCount = useMemo(
    () => countFinancialTableColumns(financialQuarterGroups, expandedFinancialQuarters),
    [financialQuarterGroups, expandedFinancialQuarters]
  );

  const renderFinancialQuarterToggle = (quarterKey: string, label: string) => {
    const expanded = isFinancialQuarterExpanded(quarterKey);
    return (
      <button
        type="button"
        className="quarter-toggle-btn"
        onClick={() => toggleFinancialQuarter(quarterKey)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? `Replier le trimestre ${label}`
            : `Déplier le trimestre ${label}`
        }
        title={expanded ? 'Replier' : 'Déplier'}
        data-testid={`home-financial-quarter-toggle-${quarterKey}`}
      >
        <svg
          className={`quarter-toggle-arrow ${expanded ? 'is-open' : ''}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M7.23 5.21a.75.75 0 0 1 1.06.02L12 9.12l3.71-3.89a.75.75 0 1 1 1.08 1.04l-4.25 4.45a.75.75 0 0 1-1.08 0L7.21 6.27a.75.75 0 0 1 .02-1.06Z" />
        </svg>
        <span>{label}</span>
      </button>
    );
  };

  const renderFinancialPeriodCells = (
    renderMonthCell: (row: HomeMonthlyRow) => React.ReactNode,
    renderQuarterCell: (aggregate: ReturnType<typeof aggregateQuarterMonths>, quarterKey: string) => React.ReactNode
  ) =>
    financialQuarterGroups.flatMap((group) => {
      if (isFinancialQuarterExpanded(group.key)) {
        return group.months.map((row) => (
          <React.Fragment key={`${group.key}-${row.month}`}>{renderMonthCell(row)}</React.Fragment>
        ));
      }
      const aggregate = aggregateQuarterMonths(group.months);
      return (
        <React.Fragment key={group.key}>
          {renderQuarterCell(aggregate, group.key)}
        </React.Fragment>
      );
    });

  const formatMonth = (month: string) => {
    const [y, m] = String(month || '').split('-');
    if (!y || !m) return month;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTreasuryMonth = (month: string) => {
    const [y, m] = String(month || '').split('-');
    if (!y || !m) return month;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
      month: 'short',
      year: 'numeric',
    });
  };

  const treasuryTotals = useMemo(() => {
    return treasuryMonthly.reduce(
      (acc, row) => ({
        shiftedCa: acc.shiftedCa + toNumberOrZero(row.shiftedCa),
        charges: acc.charges + toNumberOrZero(row.charges),
        treasuryBalance: toNumberOrZero(row.treasuryBalance),
      }),
      { shiftedCa: 0, charges: 0, treasuryBalance: 0 }
    );
  }, [treasuryMonthly]);

  const renderFinancialTable = () => (
    <div className="home-recap-table-wrap" data-testid="home-recap-table-view">
      <table className="home-recap-table">
        <thead>
          <tr>
            <th rowSpan={2}>Indicateur</th>
            {financialQuarterGroups.map((group) => {
              const expanded = isFinancialQuarterExpanded(group.key);
              if (expanded) {
                return (
                  <th
                    key={group.key}
                    colSpan={group.months.length}
                    className="quarter-header-cell"
                  >
                    {renderFinancialQuarterToggle(group.key, group.label)}
                  </th>
                );
              }
              return (
                <th key={group.key} rowSpan={2} className="quarter-header-cell">
                  {renderFinancialQuarterToggle(group.key, group.label)}
                </th>
              );
            })}
            <th rowSpan={2}>Total</th>
          </tr>
          <tr>
            {financialQuarterGroups.flatMap((group) =>
              isFinancialQuarterExpanded(group.key)
                ? group.months.map((row) => (
                    <th
                      key={row.month}
                      data-testid={`home-financial-month-col-${row.month}`}
                    >
                      {formatMonth(row.month)}
                    </th>
                  ))
                : []
            )}
          </tr>
        </thead>
        <tbody>
          <tr className="section-row" data-testid="home-view-financial">
            <td colSpan={financialTableColumnCount + 2}>Financier</td>
          </tr>
          <tr>
            <td title={data?.meta?.caForecastFormula}>
              CA Anima Néo
              {data?.meta?.plannedScenarioFilterLabel && (
                <span className="home-recap-scenario-hint">
                  {' '}
                  (+ prévi. {data.meta.plannedScenarioFilterLabel})
                </span>
              )}
            </td>
            {renderFinancialPeriodCells(
              (row) => (
                <td
                  key={`ca-anima-${row.month}`}
                  className={`num ${financialMonthClass(row)}`}
                >
                  {formatCurrency(row.caAnimaNeo)}
                </td>
              ),
              (aggregate, quarterKey) => (
                <td
                  key={`ca-anima-${quarterKey}`}
                  className={`num ${financialQuarterMonthClass(aggregate.taceIsClosedMonth)}`}
                  data-testid={`home-financial-quarter-col-${quarterKey}`}
                >
                  {formatCurrency(aggregate.caAnimaNeo)}
                </td>
              )
            )}
            <td className="num financial-month-forecast">{formatCurrency(totals.caAnimaNeo)}</td>
          </tr>
          <tr>
            <td title={data?.meta?.caForecastFormula}>
              CA Sous-traitance
              {data?.meta?.plannedScenarioFilterLabel && (
                <span className="home-recap-scenario-hint">
                  {' '}
                  (+ prévi. {data.meta.plannedScenarioFilterLabel})
                </span>
              )}
            </td>
            {renderFinancialPeriodCells(
              (row) => (
                <td key={`ca-st-${row.month}`} className={`num ${financialMonthClass(row)}`}>
                  {formatCurrency(row.caSousTraitance)}
                </td>
              ),
              (aggregate, quarterKey) => (
                <td
                  key={`ca-st-${quarterKey}`}
                  className={`num ${financialQuarterMonthClass(aggregate.taceIsClosedMonth)}`}
                >
                  {formatCurrency(aggregate.caSousTraitance)}
                </td>
              )
            )}
            <td className="num financial-month-forecast">{formatCurrency(totals.caSousTraitance)}</td>
          </tr>
          <tr className="metric-sign-highlight">
            <td title="Marge brute en % du CA Anima Néo — survoler une cellule pour le montant">
              Marge brute Anima Néo
            </td>
            {renderFinancialPeriodCells(
              (row) => (
                <td
                  key={`mb-anima-${row.month}`}
                  className={`num home-recap-margin-pct ${row.margeBruteAnimaNeo >= 0 ? 'pos' : 'neg'}`}
                  title={formatCurrency(row.margeBruteAnimaNeo)}
                >
                  {formatMarginPctCell(row.margeBruteAnimaNeo, row.caAnimaNeo)}
                </td>
              ),
              (aggregate, quarterKey) => (
                <td
                  key={`mb-anima-${quarterKey}`}
                  className={`num home-recap-margin-pct ${aggregate.margeBruteAnimaNeo >= 0 ? 'pos' : 'neg'}`}
                  title={formatCurrency(aggregate.margeBruteAnimaNeo)}
                >
                  {formatMarginPctCell(aggregate.margeBruteAnimaNeo, aggregate.caAnimaNeo)}
                </td>
              )
            )}
            <td
              className={`num home-recap-margin-pct ${totals.margeBruteAnimaNeo >= 0 ? 'pos' : 'neg'}`}
              title={formatCurrency(totals.margeBruteAnimaNeo)}
            >
              {formatMarginPctCell(totals.margeBruteAnimaNeo, totals.caAnimaNeo)}
            </td>
          </tr>
          <tr>
            <td title="Marge brute en % du CA sous-traitance — survoler une cellule pour le montant">
              Marge brute Sous-traitance
            </td>
            {renderFinancialPeriodCells(
              (row) => (
                <td
                  key={`mb-st-${row.month}`}
                  className={`num home-recap-margin-pct ${row.margeBruteSousTraitance >= 0 ? 'pos' : 'neg'}`}
                  title={formatCurrency(row.margeBruteSousTraitance)}
                >
                  {formatMarginPctCell(row.margeBruteSousTraitance, row.caSousTraitance)}
                </td>
              ),
              (aggregate, quarterKey) => (
                <td
                  key={`mb-st-${quarterKey}`}
                  className={`num home-recap-margin-pct ${aggregate.margeBruteSousTraitance >= 0 ? 'pos' : 'neg'}`}
                  title={formatCurrency(aggregate.margeBruteSousTraitance)}
                >
                  {formatMarginPctCell(aggregate.margeBruteSousTraitance, aggregate.caSousTraitance)}
                </td>
              )
            )}
            <td
              className={`num home-recap-margin-pct ${totals.margeBruteSousTraitance >= 0 ? 'pos' : 'neg'}`}
              title={formatCurrency(totals.margeBruteSousTraitance)}
            >
              {formatMarginPctCell(totals.margeBruteSousTraitance, totals.caSousTraitance)}
            </td>
          </tr>
          <tr className="metric-sign-highlight">
            <td title={data?.meta?.resultatForecastFormula}>Résultat</td>
            {renderFinancialPeriodCells(
              (row) => (
                <td
                  key={`res-${row.month}`}
                  className={`num ${financialMonthClass(row)} ${financialResultClass(row)} ${row.resultat >= 0 ? 'pos' : 'neg'}`}
                >
                  {formatCurrency(row.resultat)}
                </td>
              ),
              (aggregate, quarterKey) => (
                <td
                  key={`res-${quarterKey}`}
                  className={`num ${financialQuarterMonthClass(aggregate.taceIsClosedMonth)} ${financialQuarterResultClass(aggregate.taceIsClosedMonth)} ${aggregate.resultat >= 0 ? 'pos' : 'neg'}`}
                >
                  {formatCurrency(aggregate.resultat)}
                </td>
              )
            )}
            <td
              className={`num financial-month-forecast financial-highlight-forecast ${totals.resultat >= 0 ? 'pos' : 'neg'}`}
            >
              {formatCurrency(totals.resultat)}
            </td>
          </tr>
          <tr>
            <td>TACE (%)</td>
            {renderFinancialPeriodCells(
              (row) => (
                <td key={`tace-${row.month}`} className={`num ${financialMonthClass(row)}`}>
                  {formatPct(row.tacePct)}
                </td>
              ),
              (aggregate, quarterKey) => (
                <td
                  key={`tace-${quarterKey}`}
                  className={`num ${financialQuarterMonthClass(aggregate.taceIsClosedMonth)}`}
                >
                  {formatPct(aggregate.tacePct)}
                </td>
              )
            )}
            <td className="num financial-month-forecast">{formatPct(totals.tacePct)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderBesoinsTable = () => (
    <div className="home-recap-table-wrap" data-testid="home-zone-besoins-table-view">
      <table className="home-recap-table">
        <thead>
          <tr>
            <th>Indicateur</th>
            {(data?.monthly || []).map((m) => (
              <th key={m.month}>{formatMonth(m.month)}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="section-row" data-testid="home-view-besoins">
            <td colSpan={(data?.monthly?.length || 0) + 2}>
              <div className="section-header">
                <button
                  type="button"
                  className="section-title-toggle-btn"
                  onClick={() => setIsBesoinsExpanded((prev) => !prev)}
                  aria-expanded={isBesoinsExpanded}
                  aria-label={isBesoinsExpanded ? 'Replier la section besoins' : 'Déplier la section besoins'}
                  title={isBesoinsExpanded ? 'Replier' : 'Déplier'}
                >
                  <svg
                    className={`section-title-toggle-arrow ${isBesoinsExpanded ? 'is-open' : ''}`}
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M7.23 5.21a.75.75 0 0 1 1.06.02L12 9.12l3.71-3.89a.75.75 0 1 1 1.08 1.04l-4.25 4.45a.75.75 0 0 1-1.08 0L7.21 6.27a.75.75 0 0 1 .02-1.06Z" />
                  </svg>
                  <span>Besoins</span>
                </button>
              </div>
            </td>
          </tr>
          {isBesoinsExpanded && (
            <>
              <tr>
                <td>Nombre de besoins créés (hors piste)</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`crees-${row.month}`} className="num">
                    {toNumberOrZero(row.besoinsCrees)}
                  </td>
                ))}
                <td className="num">{totals.besoinsCrees}</td>
              </tr>
              <tr>
                <td>Nombre de besoins en stock (state 5 et 10)</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`stock-${row.month}`} className="num">
                    {toNumberOrZero(row.besoinsStock)}
                  </td>
                ))}
                <td className="num">{totals.besoinsStock}</td>
              </tr>
              <tr>
                <td>Nombre de besoins gagnés</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`gagnes-${row.month}`} className="num">
                    {toNumberOrZero(row.besoinsGagnes)}
                  </td>
                ))}
                <td className="num">{totals.besoinsGagnes}</td>
              </tr>
              <tr>
                <td>Nombre de besoins perdus</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`perdus-${row.month}`} className="num">
                    {toNumberOrZero(row.besoinsPerdus)}
                  </td>
                ))}
                <td className="num">{totals.besoinsPerdus}</td>
              </tr>
              <tr>
                <td>Nombre de besoins abandonnés</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`aband-${row.month}`} className="num">
                    {toNumberOrZero(row.besoinsAbandonnes)}
                  </td>
                ))}
                <td className="num">{totals.besoinsAbandonnes}</td>
              </tr>
              <tr>
                <td>Nombre de besoins stand by (state 9)</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`standby-${row.month}`} className="num">
                    {toNumberOrZero(row.besoinsStandBy)}
                  </td>
                ))}
                <td className="num">{totals.besoinsStandBy}</td>
              </tr>
              <tr>
                <td>Délai moyen de réponse (jours)</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`delai-${row.month}`} className="num">
                    {formatDays(row.delaiMoyenReponseDays)}
                  </td>
                ))}
                <td className="num">{formatDays(totals.delaiMoyenReponseDays)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderTreasuryTable = () => (
    <div className="home-recap-table-wrap" data-testid="home-zone-treasury-table-view">
      <table className="home-recap-table">
        <thead>
          <tr>
            <th>Indicateur</th>
            {treasuryMonthly.map((row) => (
              <th key={row.month}>{formatTreasuryMonth(row.month)}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CA encaissé (forecast décalé)</td>
            {treasuryMonthly.map((row) => (
              <td key={`shifted-${row.month}`} className="num">
                {formatCurrency(row.shiftedCa)}
              </td>
            ))}
            <td className="num">{formatCurrency(treasuryTotals.shiftedCa)}</td>
          </tr>
          <tr>
            <td>Charges Pennylane</td>
            {treasuryMonthly.map((row) => (
              <td key={`charges-${row.month}`} className="num">
                {formatCurrency(row.charges)}
              </td>
            ))}
            <td className="num">{formatCurrency(treasuryTotals.charges)}</td>
          </tr>
          <tr className="metric-sign-highlight">
            <td>Solde de trésorerie</td>
            {treasuryMonthly.map((row) => (
              <td key={`balance-${row.month}`} className="num">
                {formatCurrency(row.treasuryBalance)}
              </td>
            ))}
            <td className="num">{formatCurrency(treasuryTotals.treasuryBalance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  if (loading) {
    return (
      <main className="app-main">
        <div className="home-recap-panel">
          <p className="home-recap-state">Chargement du récapitulatif…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-main">
        <div className="home-recap-panel">
          <p className="home-recap-state home-recap-state--error">{error}</p>
        </div>
      </main>
    );
  }

  if (!canFinancial && !canBesoins && !canTreasury) {
    return (
      <main className="app-main" data-testid="home-no-access">
        <div className="home-recap-panel">
          <p className="home-recap-state">Aucune vue accueil autorisée pour votre profil.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-main" data-testid="home-dashboard">
      <h1 className="home-dashboard-title">Tableau de bord Anima Néo</h1>
      <div className="home-recap-filters">
        <label htmlFor="home-recap-scenario">Scénario</label>
        <select
          id="home-recap-scenario"
          value={selectedScenario}
          onChange={(e) => setSelectedScenario(e.target.value)}
          title="Aucun = CA de base uniquement ; scénario sélectionné = ajout cumulatif du CA prévisionnel manuel"
        >
          <option value="none">Aucun</option>
          {scenarioOptions.map((n) => (
            <option key={n} value={String(n)}>
              {scenarioLabel(n)}
            </option>
          ))}
        </select>
        <label htmlFor="home-recap-year">Année</label>
        <select
          id="home-recap-year"
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="home-dashboard-grid" data-testid="home-dashboard-grid">
        {canFinancial && (
          <HomeDashboardZone
            title="Indicateurs financiers"
            testId="home-zone-financial"
            chartToggleTestId="home-recap-view-chart"
            tableToggleTestId="home-recap-view-table"
            viewMode={financialViewMode}
            onViewModeChange={setFinancialViewMode}
            chart={
              <HomeMonthlyRecapChart
                monthly={data?.monthly || []}
                canFinancial
                canBesoins={false}
                section="financial"
              />
            }
            table={renderFinancialTable()}
          />
        )}
        {canBesoins && (
          <HomeDashboardZone
            title="Indicateurs besoins"
            testId="home-zone-besoins"
            viewMode={besoinsViewMode}
            onViewModeChange={setBesoinsViewMode}
            chart={
              <HomeMonthlyRecapChart
                monthly={data?.monthly || []}
                canFinancial={false}
                canBesoins
                section="besoins"
              />
            }
            table={renderBesoinsTable()}
          />
        )}
        {canTreasury && (
          <HomeDashboardZone
            title="Plan de trésorerie"
            testId="home-zone-treasury"
            viewMode={treasuryViewMode}
            onViewModeChange={setTreasuryViewMode}
            spanFull={Boolean(canFinancial && canBesoins)}
            chart={
              <div data-testid="home-view-treasury">
                <HomeTreasuryPlanChart
                  monthly={treasuryMonthly}
                  averagePaymentDelayDays={treasurySettings.averagePaymentDelayDays}
                  initialBalance={treasurySettings.initialBalance}
                  loading={treasuryLoading}
                  error={treasuryError}
                  embedded
                />
              </div>
            }
            table={
              treasuryLoading ? (
                <p className="home-recap-state">Chargement du plan de trésorerie…</p>
              ) : treasuryError ? (
                <p className="home-recap-state home-recap-state--error">{treasuryError}</p>
              ) : treasuryMonthly.length === 0 ? (
                <p className="home-recap-state">Aucune donnée de trésorerie.</p>
              ) : (
                renderTreasuryTable()
              )
            }
          />
        )}
      </div>
    </main>
  );
};

export default HomeMonthlyRecap;
