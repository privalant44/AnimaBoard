import React, { useMemo, useState } from 'react';
import type { ForecastScenario } from './ForecastScenarios';
import {
  buildMonthKeys,
  downloadSynthesisExcel,
  exportSynthesisPdf,
  monthShortLabels,
  type ForecastSynthesisReportModel,
  type ForecastSynthesisRow,
} from '../utils/forecastSynthesisExport';
import './ForecastSynthesisReport.css';

export type SynthesisResource = {
  id: number;
  nom: string;
  prenom: string;
  type?: string;
  statut?: string;
  projects: Array<{
    id: string | number;
    reference: string;
    title: string;
    startDate: string;
    endDate: string;
    tjm: number | null;
  }>;
  /** Prestations hors filtre période — base pour le périmètre année du rapport. */
  allProjectsForCA?: Array<{
    id: string | number;
    reference: string;
    title: string;
    startDate: string;
    endDate: string;
    tjm: number | null;
  }>;
};

export type SynthesisPlannedScenario = {
  resourceId: number;
  scenario: number;
  tjm: number | null;
  description: string;
  forecast: Record<string, number>;
};

interface ForecastSynthesisReportProps {
  onClose: () => void;
  resources: SynthesisResource[];
  forecastByDeliveryId: Record<string, Record<string, number>>;
  plannedByResource: Record<string, SynthesisPlannedScenario[]>;
  forecastScenarios: ForecastScenario[];
  year: number;
  periodStart: string;
  periodEnd: string;
}

function getScenarioLabel(number: number, catalog: ForecastScenario[]): string {
  const entry = catalog.find((s) => s.number === number);
  if (entry?.title?.trim()) return `Scénario ${number} — ${entry.title.trim()}`;
  return `Scénario ${number}`;
}

function plannedForResource(
  plannedByResource: Record<string, SynthesisPlannedScenario[]>,
  resourceId: number
): SynthesisPlannedScenario[] {
  const keys = [String(resourceId), String(Number(resourceId))];
  for (const k of keys) {
    if (plannedByResource[k]) return plannedByResource[k];
  }
  return [];
}

function sumMonths(months: string[], values: Record<string, number>): { map: Record<string, number>; total: number } {
  const map: Record<string, number> = {};
  let total = 0;
  for (const m of months) {
    const v = Number(values[m]) || 0;
    map[m] = v;
    total += v;
  }
  return { map, total };
}

function formatYmdFr(ymd: string): string {
  if (!ymd) return '—';
  const [y, mo, d] = ymd.split('-');
  if (!y || !mo || !d) return ymd;
  return `${d}/${mo}/${y}`;
}

const ForecastSynthesisReport: React.FC<ForecastSynthesisReportProps> = ({
  onClose,
  resources,
  forecastByDeliveryId,
  plannedByResource,
  forecastScenarios,
  year,
  periodStart,
  periodEnd,
}) => {
  const [title, setTitle] = useState(`Synthèse Forecast ${year}`);
  const [notes, setNotes] = useState('');
  const [includePrestations, setIncludePrestations] = useState(true);
  const [includeScenarios, setIncludeScenarios] = useState(true);

  const months = useMemo(() => buildMonthKeys(year), [year]);
  const monthLabels = useMemo(() => monthShortLabels(year), [year]);

  const periodLabel = `${formatYmdFr(periodStart)} → ${formatYmdFr(periodEnd)}`;

  const rows = useMemo((): ForecastSynthesisRow[] => {
    const out: ForecastSynthesisRow[] = [];
    const sorted = [...resources].sort((a, b) => {
      const byNom = (a.nom || '').localeCompare(b.nom || '', 'fr');
      if (byNom !== 0) return byNom;
      return (a.prenom || '').localeCompare(b.prenom || '', 'fr');
    });

    for (const resource of sorted) {
      const resourceName = `${resource.nom || ''} ${resource.prenom || ''}`.trim() || `Ressource ${resource.id}`;

      if (includePrestations) {
        const projects =
          resource.allProjectsForCA && resource.allProjectsForCA.length > 0
            ? resource.allProjectsForCA
            : resource.projects;
        for (const project of projects) {
          const forecastMap = forecastByDeliveryId[String(project.id)] || {};
          const { map, total } = sumMonths(months, forecastMap);
          // Prestations sans aucune journée prévisionnelle sur l’année : hors rapport.
          if (total <= 0) continue;
          out.push({
            resourceId: resource.id,
            resourceName,
            nature: 'prestation',
            natureLabel: 'Prestation',
            reference: String(project.reference || project.id || ''),
            label: project.title || 'Sans titre',
            startDate: project.startDate || '',
            endDate: project.endDate || '',
            tjm: project.tjm,
            months: map,
            totalDays: total,
          });
        }
      }

      if (includeScenarios) {
        const planned = [...plannedForResource(plannedByResource, resource.id)].sort(
          (a, b) => a.scenario - b.scenario
        );
        for (const item of planned) {
          const { map, total } = sumMonths(months, item.forecast || {});
          // Scénarios sans journée saisie sur l’année : hors rapport.
          if (total <= 0) continue;
          out.push({
            resourceId: resource.id,
            resourceName,
            nature: 'scenario',
            natureLabel: getScenarioLabel(item.scenario, forecastScenarios),
            reference: `P${item.scenario}`,
            label: item.description || getScenarioLabel(item.scenario, forecastScenarios),
            startDate: '',
            endDate: '',
            tjm: item.tjm,
            months: map,
            totalDays: total,
          });
        }
      }
    }

    return out;
  }, [
    resources,
    forecastByDeliveryId,
    plannedByResource,
    forecastScenarios,
    months,
    includePrestations,
    includeScenarios,
  ]);

  const model = useMemo((): ForecastSynthesisReportModel => {
    return {
      title: title.trim() || `Synthèse Forecast ${year}`,
      notes,
      periodLabel,
      year,
      months,
      monthLabels,
      rows,
      generatedAt: new Date().toISOString(),
    };
  }, [title, notes, periodLabel, year, months, monthLabels, rows]);

  const handleExcel = () => {
    downloadSynthesisExcel(model);
  };

  const handlePdf = () => {
    exportSynthesisPdf(model);
  };

  return (
    <div className="forecast-synthesis-overlay" role="dialog" aria-modal="true" aria-labelledby="forecast-synthesis-title">
      <div className="forecast-synthesis-panel">
        <div className="forecast-synthesis-header">
          <button type="button" className="back-button" onClick={onClose}>
            ← Retour
          </button>
          <h2 id="forecast-synthesis-title">Éditer le rapport synthèse</h2>
        </div>

        <div className="forecast-synthesis-body">
          <div className="forecast-synthesis-editor">
            <div className="forecast-synthesis-form-row">
              <label htmlFor="synthesis-title">Titre du rapport</label>
              <input
                id="synthesis-title"
                type="text"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="forecast-synthesis-form-row">
              <label htmlFor="synthesis-notes">Notes (optionnel)</label>
              <textarea
                id="synthesis-notes"
                rows={2}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Commentaire libre inclus dans l’export…"
              />
            </div>
            <div className="forecast-synthesis-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={includePrestations}
                  onChange={(e) => setIncludePrestations(e.target.checked)}
                />
                Prestations actives (période Forecast)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeScenarios}
                  onChange={(e) => setIncludeScenarios(e.target.checked)}
                />
                Prévisions scénario
              </label>
            </div>
            <p className="forecast-synthesis-meta">
              Filtres Forecast : {periodLabel} · {rows.length} ligne
              {rows.length > 1 ? 's' : ''} avec prévision (≥ 1 j) · année {year}
            </p>
            <div className="forecast-synthesis-export-actions">
              <button type="button" className="forecast-synthesis-export-btn" onClick={handleExcel}>
                Exporter Excel
              </button>
              <button type="button" className="forecast-synthesis-export-btn" onClick={handlePdf}>
                Exporter PDF
              </button>
            </div>
          </div>

          <div className="forecast-synthesis-preview-wrap">
            <h3>Aperçu</h3>
            {rows.length === 0 ? (
              <p className="forecast-synthesis-empty">
                Aucune ligne à exporter : seules les prestations et scénarios avec au moins 1 jour
                prévisionnel sur {year} sont inclus. Ajustez les filtres Forecast ou les saisies.
              </p>
            ) : (
              <div className="forecast-synthesis-table-scroll">
                <table className="forecast-synthesis-table">
                  <thead>
                    <tr>
                      <th>Ressource</th>
                      <th>Nature</th>
                      <th>Référence</th>
                      <th>Libellé</th>
                      <th>TJM</th>
                      {monthLabels.map((l) => (
                        <th key={l} className="num">
                          {l}
                        </th>
                      ))}
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={`${row.nature}-${row.resourceId}-${row.reference}-${idx}`}>
                        <td>{row.resourceName}</td>
                        <td>
                          <span
                            className={
                              row.nature === 'scenario'
                                ? 'forecast-synthesis-badge forecast-synthesis-badge--scenario'
                                : 'forecast-synthesis-badge'
                            }
                          >
                            {row.natureLabel}
                          </span>
                        </td>
                        <td>{row.reference}</td>
                        <td>{row.label}</td>
                        <td className="num">{row.tjm != null ? row.tjm : '—'}</td>
                        {months.map((m) => (
                          <td key={m} className="num">
                            {row.months[m] ? row.months[m] : ''}
                          </td>
                        ))}
                        <td className="num">{row.totalDays ? row.totalDays : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastSynthesisReport;
