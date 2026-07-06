import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import SettingsPanelLayout from './SettingsPanelLayout';
import '../BatchSyncPanel.css';

interface StepSummary {
  name: string;
  label: string;
  ok: boolean;
  count: number | null;
  unit?: string;
  extra?: string;
  error?: string;
  durationMs?: number | null;
}

interface BatchLog {
  id: number;
  runDate: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  success: boolean;
  triggerSource: string;
  triggeredBy: string | null;
  stepSummaries: StepSummary[];
  errorMessage: string | null;
}

interface DayGroup {
  date: string;
  runs: number;
  successCount: number;
  failureCount: number;
  logs: BatchLog[];
}

interface LogsResponse {
  success: boolean;
  month: string | null;
  date: string | null;
  logs: BatchLog[];
  days: DayGroup[];
  monthlyTotals: Record<string, { label: string; count: number; unit: string }>;
  error?: string;
}

interface SettingsBatchLogsPanelProps {
  onBack: () => void;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min} min ${rem} s`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatStepValue(summary: StepSummary): string {
  if (!summary.ok) return summary.error || 'Erreur';
  if (summary.count == null) return '—';
  const base = `${summary.count} ${summary.unit || ''}`.trim();
  return summary.extra ? `${base} (${summary.extra})` : base;
}

const SettingsBatchLogsPanel: React.FC<SettingsBatchLogsPanelProps> = ({ onBack }) => {
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsData, setLogsData] = useState<LogsResponse | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    setLogsError(null);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.set('date', selectedDate);
      else params.set('month', month);
      const res = await apiFetch(`/api/batch-sync/logs?${params.toString()}`);
      const data: LogsResponse = await res.json().catch(() => ({} as LogsResponse));
      if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
      setLogsData(data);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Erreur inconnue');
      setLogsData(null);
    } finally {
      setLoadingLogs(false);
    }
  }, [month, selectedDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const displayedLogs = logsData?.logs || [];
  const monthlyTotals = logsData?.monthlyTotals || {};

  return (
    <SettingsPanelLayout title="Journaux du batch quotidien" onBack={onBack}>
      <p className="settings-description">
        Historique des exécutions automatiques (4h UTC) et manuelles : récapitulatif par jour et par mois.
      </p>

      <div className="batch-sync-filters">
        <label>
          Mois
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setSelectedDate(null);
            }}
            disabled={loadingLogs}
          />
        </label>
        <label>
          Jour (optionnel)
          <input
            type="date"
            value={selectedDate || ''}
            onChange={(e) => setSelectedDate(e.target.value || null)}
            disabled={loadingLogs}
          />
        </label>
        {selectedDate && (
          <button type="button" className="batch-sync-clear-day" onClick={() => setSelectedDate(null)}>
            Tout le mois
          </button>
        )}
        <button type="button" className="batch-sync-refresh" onClick={loadLogs} disabled={loadingLogs}>
          {loadingLogs ? 'Chargement…' : 'Actualiser'}
        </button>
      </div>

      {logsError && <p className="batch-sync-error">{logsError}</p>}

      {!logsError && logsData && Object.keys(monthlyTotals).length > 0 && !selectedDate && (
        <div className="batch-sync-monthly-totals">
          <h4>Récapitulatif du mois {logsData.month}</h4>
          <div className="batch-sync-totals-grid">
            {Object.entries(monthlyTotals).map(([key, item]) => (
              <div key={key} className="batch-sync-total-card">
                <span className="batch-sync-total-label">{item.label}</span>
                <span className="batch-sync-total-value">
                  {item.count} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!logsError && logsData && logsData.days.length > 0 && !selectedDate && (
        <div className="batch-sync-days-summary">
          <h4>Par jour</h4>
          <table className="batch-sync-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Exécutions</th>
                <th>Succès</th>
                <th>Échecs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {logsData.days.map((day) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  <td>{day.runs}</td>
                  <td>{day.successCount}</td>
                  <td>{day.failureCount}</td>
                  <td>
                    <button
                      type="button"
                      className="batch-sync-day-link"
                      onClick={() => setSelectedDate(day.date)}
                    >
                      Détail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="batch-sync-runs">
        <h4>
          {selectedDate
            ? `Exécutions du ${selectedDate}`
            : `Détail des exécutions — ${logsData?.month || month}`}
        </h4>

        {loadingLogs && <p className="batch-sync-loading">Chargement des journaux…</p>}
        {!loadingLogs && displayedLogs.length === 0 && (
          <p className="batch-sync-empty">Aucun journal pour cette période.</p>
        )}

        {!loadingLogs &&
          displayedLogs.map((log) => (
            <div key={log.id} className={`batch-sync-log-card ${log.success ? 'success' : 'failure'}`}>
              <button
                type="button"
                className="batch-sync-log-header"
                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
              >
                <span className="batch-sync-log-status">{log.success ? '✅' : '❌'}</span>
                <span className="batch-sync-log-time">{formatDateTime(log.startedAt)}</span>
                <span className="batch-sync-log-meta">
                  {log.triggerSource === 'manual' ? 'Manuel' : 'Cron'}
                  {log.triggeredBy ? ` — ${log.triggeredBy}` : ''}
                  {' · '}
                  {formatDuration(log.durationMs)}
                </span>
                <span className="batch-sync-log-toggle">{expandedLogId === log.id ? '▲' : '▼'}</span>
              </button>

              {expandedLogId === log.id && (
                <div className="batch-sync-log-body">
                  {log.errorMessage && <p className="batch-sync-log-error">{log.errorMessage}</p>}
                  <table className="batch-sync-steps-table">
                    <thead>
                      <tr>
                        <th>Étape</th>
                        <th>Résultat</th>
                        <th>Durée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.stepSummaries.map((step) => (
                        <tr key={step.name} className={step.ok ? '' : 'step-failed'}>
                          <td>{step.label}</td>
                          <td>{formatStepValue(step)}</td>
                          <td>{formatDuration(step.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
      </div>
    </SettingsPanelLayout>
  );
};

export default SettingsBatchLogsPanel;
