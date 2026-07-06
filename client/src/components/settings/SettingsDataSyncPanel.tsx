import React, { useState } from 'react';
import { apiFetch, parseApiJson } from '../../api';
import { dispatchDataRefresh } from '../../dataRefresh';
import { useAuth } from '../../auth/AuthProvider';
import { PERMISSIONS } from '../../auth/roles';
import SettingsPanelLayout from './SettingsPanelLayout';
import '../Settings.css';

interface SettingsDataSyncPanelProps {
  onBack: () => void;
}

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

interface SyncApiResponse {
  success?: boolean;
  message?: string;
  error?: string;
  errorDetail?: string;
  hint?: string;
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

const SettingsDataSyncPanel: React.FC<SettingsDataSyncPanelProps> = ({ onBack }) => {
  const auth = useAuth();
  const canRunBatch = !auth || auth.can(PERMISSIONS.OPS_SYNC);

  const [syncingResources, setSyncingResources] = useState(false);
  const [syncingDeliveries, setSyncingDeliveries] = useState(false);
  const [syncingTimesheets, setSyncingTimesheets] = useState(false);
  const [syncingAbsences, setSyncingAbsences] = useState(false);
  const [syncingBesoins, setSyncingBesoins] = useState(false);
  const [syncingDictionary, setSyncingDictionary] = useState(false);
  const [resettingTimesheets, setResettingTimesheets] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; message: string; steps?: StepSummary[] } | null>(null);
  const [syncResult, setSyncResult] = useState<{
    type: 'resources' | 'deliveries' | 'timesheets' | 'timesheets-reset' | 'absences' | 'dictionary' | 'besoins' | null;
    success: boolean;
    message: string;
  } | null>(null);

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

  const runBatch = async () => {
    if (
      !window.confirm(
        'Lancer le batch quotidien complet ? Cela peut prendre plusieurs minutes (Pennylane, ressources, prestations, projets, timesheets, besoins).'
      )
    ) {
      return;
    }
    setRunningBatch(true);
    setRunResult(null);
    setSyncResult(null);
    try {
      const res = await apiFetch('/api/batch-sync/run', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setRunResult({
          success: true,
          message: `Batch terminé en ${formatDuration(data.durationMs)} (${data.stepSummaries?.length || 0} étapes).`,
          steps: data.stepSummaries,
        });
        dispatchDataRefresh();
      } else {
        const failedSteps = Array.isArray(data.stepSummaries)
          ? data.stepSummaries.filter((s: StepSummary) => !s.ok)
          : [];
        const failed = failedSteps.map((s: StepSummary) => s.label).join(', ');
        let message =
          data.error || data.errorMessage || `Échec du batch${failed ? ` (${failed})` : ''}.`;
        if (failedSteps.some((s: StepSummary) => String(s.error || '').includes('creation_date'))) {
          message +=
            ' Appliquez les migrations Supabase 20260615100000_deliveries_boond_dates.sql et 20260615110000_projects_boond_dates.sql.';
        }
        setRunResult({
          success: false,
          message,
          steps: data.stepSummaries,
        });
      }
    } catch (err) {
      setRunResult({
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setRunningBatch(false);
    }
  };

  const syncDictionary = async () => {
    setSyncingDictionary(true);
    setSyncResult(null);

    try {
      const response = await apiFetch('/api/boondmanager/sync/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await parseApiJson<SyncApiResponse>(response);

      if (response.ok && data.success) {
        setSyncResult({
          type: 'dictionary',
          success: true,
          message: data.message || 'Dictionnaire synchronisé',
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
        message: err instanceof Error ? err.message : 'Erreur inconnue (vérifiez que le serveur API tourne sur le port 3000)',
      });
    } finally {
      setSyncingDictionary(false);
    }
  };

  const syncResources = async () => {
    setSyncingResources(true);
    setSyncResult(null);

    try {
      const response = await apiFetch('/api/boondmanager/sync/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await parseApiJson<SyncApiResponse>(response);

      if (response.ok && data.success) {
        setSyncResult({
          type: 'resources',
          success: true,
          message: data.message || 'Synchronisation réussie',
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de la synchronisation';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'resources',
          success: false,
          message: msg + detail,
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'resources',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue (vérifiez que le serveur API tourne sur le port 3000)',
      });
    } finally {
      setSyncingResources(false);
    }
  };

  const syncDeliveries = async () => {
    setSyncingDeliveries(true);
    setSyncResult(null);

    try {
      const response = await apiFetch('/api/boondmanager/sync/deliveries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await parseApiJson<SyncApiResponse>(response);

      if (response.ok && data.success) {
        setSyncResult({
          type: 'deliveries',
          success: true,
          message: data.message || 'Synchronisation réussie: prestations mises à jour',
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || "Erreur lors de l'extraction";
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'deliveries',
          success: false,
          message: msg + detail,
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'deliveries',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue (serveur API sur port 3000 ?)',
      });
    } finally {
      setSyncingDeliveries(false);
    }
  };

  const syncTimesheets = async () => {
    setSyncingTimesheets(true);
    setSyncResult(null);
    const { startMonth, endMonth } = getLast3MonthsRange();
    try {
      const response = await apiFetch('/api/boondmanager/sync/timesheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startMonth,
          endMonth,
        }),
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
            : `Erreur ${response.status}: le serveur n'a pas renvoyé de JSON (timeout ou erreur Vercel). Vérifiez les logs du déploiement.`,
        });
        return;
      }
      if (response.ok && data.success) {
        setSyncResult({
          type: 'timesheets',
          success: true,
          message: data.message || 'Synchronisation des feuilles de temps (production + interne) réussie',
        });
        dispatchDataRefresh();
      } else {
        const msg = (data.error || data.message) || 'Erreur lors de la synchronisation des feuilles de temps';
        const detail = data.errorDetail ? ` — ${data.errorDetail}` : '';
        setSyncResult({
          type: 'timesheets',
          success: false,
          message: msg + detail,
        });
      }
    } catch (err) {
      setSyncResult({
        type: 'timesheets',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue',
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
      const response = await apiFetch('/api/boondmanager/sync/absences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beginDate, endDate }),
      });
      const data = await parseApiJson<SyncApiResponse>(response);
      if (response.ok && data.success) {
        setSyncResult({
          type: 'absences',
          success: true,
          message: data.message || 'Synchronisation des absences réussie',
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
        message: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setSyncingAbsences(false);
    }
  };

  const syncBesoinsRecentMonths = async () => {
    setSyncingBesoins(true);
    setSyncResult(null);
    try {
      const response = await apiFetch('/api/boondmanager/sync/besoins/snapshot?recentMonths=2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentMonths: 2 }),
      });
      const data = await parseApiJson<SyncApiResponse>(response);
      if (response.ok && data.success) {
        setSyncResult({
          type: 'besoins',
          success: true,
          message: data.message || 'Actualisation des besoins (2 derniers mois) réussie',
        });
        dispatchDataRefresh();
      } else {
        const msg = [data.error || data.message, data.hint, data.errorDetail]
          .filter(Boolean)
          .join(' — ') || 'Erreur lors de l’actualisation des besoins';
        setSyncResult({ type: 'besoins', success: false, message: msg });
      }
    } catch (err) {
      setSyncResult({
        type: 'besoins',
        success: false,
        message: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setSyncingBesoins(false);
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
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      return { response, data };
    };
    try {
      let response = await apiFetch(endpoints[0], { method: 'POST' });
      if (response.status === 404 && endpoints.length > 1) {
        response = await apiFetch(endpoints[1], { method: 'POST' });
      }
      const { response: res, data } = await parseResponse(response);
      if (res.ok && data.success) {
        setSyncResult({ type: 'timesheets-reset', success: true, message: data.message || 'Feuilles de temps réinitialisées.' });
        dispatchDataRefresh();
      } else {
        const msg =
          (data.error || data.message) ||
          (res.status === 404
            ? 'Route réinitialisation introuvable (404).'
            : `Erreur lors de la réinitialisation (HTTP ${res.status}).`);
        setSyncResult({ type: 'timesheets-reset', success: false, message: msg });
      }
    } catch (err) {
      setSyncResult({ type: 'timesheets-reset', success: false, message: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      setResettingTimesheets(false);
    }
  };

  const isAnySyncRunning =
    syncingResources || syncingDeliveries || syncingTimesheets || syncingAbsences || syncingBesoins || syncingDictionary || resettingTimesheets;

  return (
    <SettingsPanelLayout title="Actualisation des données" onBack={onBack}>
      <p className="settings-description">
        Lancez le batch quotidien complet ou exécutez des synchronisations individuelles selon le besoin.
      </p>

      {canRunBatch && (
        <button
          type="button"
          className="sync-button batch-sync-run-button"
          onClick={runBatch}
          disabled={runningBatch || isAnySyncRunning}
        >
          {runningBatch ? '⏳ Batch en cours…' : '▶️ Lancer le batch quotidien'}
        </button>
      )}

      {runResult && (
        <div className={`sync-result ${runResult.success ? 'success' : 'error'}`}>
          <span className="sync-result-icon">{runResult.success ? '✅' : '❌'}</span>
          <div className="batch-sync-run-result-body">
            <span className="sync-result-message">{runResult.message}</span>
            {runResult.steps?.some((s) => !s.ok) && (
              <ul className="batch-sync-run-failures">
                {runResult.steps
                  .filter((s) => !s.ok)
                  .map((s) => (
                    <li key={s.name}>
                      <strong>{s.label}</strong> — {s.error || 'erreur'}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="sync-buttons-section">
        <button className="sync-button sync-resources-button" onClick={syncResources} disabled={isAnySyncRunning || runningBatch}>
          {syncingResources ? '⏳ Actualisation en cours...' : '🔄 Actualiser les ressources'}
        </button>

        <button className="sync-button sync-dictionary-button" onClick={syncDictionary} disabled={isAnySyncRunning || runningBatch}>
          {syncingDictionary ? '⏳ Synchronisation en cours...' : '📖 Synchroniser le dictionnaire (libellés type / statut)'}
        </button>

        <button className="sync-button sync-deliveries-button" onClick={syncDeliveries} disabled={isAnySyncRunning || runningBatch}>
          {syncingDeliveries ? '⏳ Extraction en cours...' : '📋 Actualiser les prestations (extract)'}
        </button>

        <button className="sync-button sync-timesheets-button" onClick={syncTimesheets} disabled={isAnySyncRunning || runningBatch}>
          {syncingTimesheets ? '⏳ Synchronisation en cours...' : '📅 Synchroniser les feuilles de temps (prod + interne, 3 derniers mois)'}
        </button>

        <button className="sync-button sync-absences-button" onClick={syncAbsences} disabled={isAnySyncRunning || runningBatch}>
          {syncingAbsences ? '⏳ Synchronisation en cours...' : '🏖️ Synchroniser les absences (N-1 et année en cours)'}
        </button>

        <button className="sync-button sync-besoins-button" onClick={syncBesoinsRecentMonths} disabled={isAnySyncRunning || runningBatch}>
          {syncingBesoins ? '⏳ Actualisation en cours...' : '🎯 Actualiser les besoins/opportunités (2 derniers mois)'}
        </button>

        <button className="sync-button sync-timesheets-reset-button" onClick={resetTimesheets} disabled={isAnySyncRunning || runningBatch}>
          {resettingTimesheets ? '⏳ Réinitialisation...' : '🗑️ Réinitialiser les feuilles de temps (année n-1 et n)'}
        </button>
      </div>

      {syncResult && (
        <div className={`sync-result ${syncResult.success ? 'success' : 'error'}`}>
          <span className="sync-result-icon">{syncResult.success ? '✅' : '❌'}</span>
          <span className="sync-result-message">{syncResult.message}</span>
        </div>
      )}
    </SettingsPanelLayout>
  );
};

export default SettingsDataSyncPanel;
