import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';
import './HomeMonthlyRecap.css';

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

interface HomeMonthlyRecapResponse {
  year: number;
  monthly: HomeMonthlyRow[];
  meta?: {
    taceEligibleResourceTypes?: string[];
    taceEligibleResourcesCount?: number;
    taceFormula?: string;
  };
}

const HomeMonthlyRecap: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [isBesoinsExpanded, setIsBesoinsExpanded] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HomeMonthlyRecapResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(`/api/dashboard/home-monthly-recap?year=${selectedYear}`);
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
  }, [selectedYear]);

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
  const financialMonthClass = (row: HomeMonthlyRow) =>
    row.taceIsClosedMonth ? 'financial-month-closed' : 'financial-month-forecast';
  const financialResultClass = (row: HomeMonthlyRow) =>
    row.taceIsClosedMonth ? 'financial-highlight-closed' : 'financial-highlight-forecast';

  const formatMonth = (month: string) => {
    const [y, m] = String(month || '').split('-');
    if (!y || !m) return month;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
      month: 'short',
      year: 'numeric',
    });
  };

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

  return (
    <main className="app-main">
      <h1 className="home-dashboard-title">TABLEAU DE BORD ANIMA NEO</h1>
      <div className="home-recap-filters">
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
      <div className="home-recap-panel">
        <div className="home-recap-table-wrap">
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
              <tr className="section-row">
                <td colSpan={(data?.monthly?.length || 0) + 2}>Financier</td>
              </tr>
              <tr>
                <td>CA Anima Néo</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`ca-anima-${row.month}`} className={`num ${financialMonthClass(row)}`}>{formatCurrency(row.caAnimaNeo)}</td>
                ))}
                <td className="num financial-month-forecast">{formatCurrency(totals.caAnimaNeo)}</td>
              </tr>
              <tr>
                <td>CA Sous-traitance</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`ca-st-${row.month}`} className={`num ${financialMonthClass(row)}`}>{formatCurrency(row.caSousTraitance)}</td>
                ))}
                <td className="num financial-month-forecast">{formatCurrency(totals.caSousTraitance)}</td>
              </tr>
              <tr className="metric-sign-highlight">
                <td>Marge brute Anima Néo</td>
                {(data?.monthly || []).map((row) => (
                  <td
                    key={`mb-anima-${row.month}`}
                    className={`num ${row.margeBruteAnimaNeo >= 0 ? 'pos' : 'neg'}`}
                  >
                    {formatCurrency(row.margeBruteAnimaNeo)}
                  </td>
                ))}
                <td className={`num ${totals.margeBruteAnimaNeo >= 0 ? 'pos' : 'neg'}`}>
                  {formatCurrency(totals.margeBruteAnimaNeo)}
                </td>
              </tr>
              <tr>
                <td>Marge brute Sous-traitance</td>
                {(data?.monthly || []).map((row) => (
                  <td
                    key={`mb-st-${row.month}`}
                    className={`num ${row.margeBruteSousTraitance >= 0 ? 'pos' : 'neg'}`}
                  >
                    {formatCurrency(row.margeBruteSousTraitance)}
                  </td>
                ))}
                <td className={`num ${totals.margeBruteSousTraitance >= 0 ? 'pos' : 'neg'}`}>
                  {formatCurrency(totals.margeBruteSousTraitance)}
                </td>
              </tr>
              <tr className="metric-sign-highlight">
                <td>Résultat</td>
                {(data?.monthly || []).map((row) => (
                  <td key={`res-${row.month}`} className={`num ${financialMonthClass(row)} ${financialResultClass(row)} ${row.resultat >= 0 ? 'pos' : 'neg'}`}>
                    {formatCurrency(row.resultat)}
                  </td>
                ))}
                <td className={`num financial-month-forecast financial-highlight-forecast ${totals.resultat >= 0 ? 'pos' : 'neg'}`}>
                  {formatCurrency(totals.resultat)}
                </td>
              </tr>
              <tr>
                <td>TACE (%)</td>
                {(data?.monthly || []).map((row) => (
                  <td
                    key={`tace-${row.month}`}
                    className={`num ${financialMonthClass(row)}`}
                  >
                    {formatPct(row.tacePct)}
                  </td>
                ))}
                <td className="num financial-month-forecast">{formatPct(totals.tacePct)}</td>
              </tr>

              <tr className="section-row">
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
                      <td key={`crees-${row.month}`} className="num">{toNumberOrZero(row.besoinsCrees)}</td>
                    ))}
                    <td className="num">{totals.besoinsCrees}</td>
                  </tr>
                  <tr>
                    <td>Nombre de besoins en stock (state 5 et 10)</td>
                    {(data?.monthly || []).map((row) => (
                      <td key={`stock-${row.month}`} className="num">{toNumberOrZero(row.besoinsStock)}</td>
                    ))}
                    <td className="num">{totals.besoinsStock}</td>
                  </tr>
                  <tr>
                    <td>Nombre de besoins gagnés</td>
                    {(data?.monthly || []).map((row) => (
                      <td key={`gagnes-${row.month}`} className="num">{toNumberOrZero(row.besoinsGagnes)}</td>
                    ))}
                    <td className="num">{totals.besoinsGagnes}</td>
                  </tr>
                  <tr>
                    <td>Nombre de besoins perdus</td>
                    {(data?.monthly || []).map((row) => (
                      <td key={`perdus-${row.month}`} className="num">{toNumberOrZero(row.besoinsPerdus)}</td>
                    ))}
                    <td className="num">{totals.besoinsPerdus}</td>
                  </tr>
                  <tr>
                    <td>Nombre de besoins abandonnés</td>
                    {(data?.monthly || []).map((row) => (
                      <td key={`aband-${row.month}`} className="num">{toNumberOrZero(row.besoinsAbandonnes)}</td>
                    ))}
                    <td className="num">{totals.besoinsAbandonnes}</td>
                  </tr>
                  <tr>
                    <td>Nombre de besoins stand by (state 9)</td>
                    {(data?.monthly || []).map((row) => (
                      <td key={`standby-${row.month}`} className="num">{toNumberOrZero(row.besoinsStandBy)}</td>
                    ))}
                    <td className="num">{totals.besoinsStandBy}</td>
                  </tr>
                  <tr>
                    <td>Délai moyen de réponse (jours)</td>
                    {(data?.monthly || []).map((row) => (
                      <td key={`delai-${row.month}`} className="num">{formatDays(row.delaiMoyenReponseDays)}</td>
                    ))}
                    <td className="num">{formatDays(totals.delaiMoyenReponseDays)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};

export default HomeMonthlyRecap;
