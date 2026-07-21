import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import './HomeMonthlyRecap.css';
interface BatchStatus {
  hasRun: boolean;
  success: boolean | null;
  startedAt: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
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

const HomeBatchStatus: React.FC = () => {
  const [status, setStatus] = useState<BatchStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/batch-sync/status');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const hasRun = data.hasRun === true || Boolean(data.startedAt);
      if (hasRun) {
        setStatus({
          hasRun: true,
          success: data.success !== false,
          startedAt: data.startedAt || null,
        });
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (!status?.hasRun) return null;

  const label = status.success ? 'Dernier batch réussi' : 'Dernier batch en échec';
  const when = formatDateTime(status.startedAt);

  return (
    <div
      className="home-batch-status"
      data-testid="home-batch-status"
      title={when ? `${label} — ${when}` : label}
      aria-label={when ? `${label} — ${when}` : label}
    >
      <span
        className={`home-batch-status-dot ${status.success ? 'home-batch-status-dot--ok' : 'home-batch-status-dot--ko'}`}
      />
      <span className="home-batch-status-label">{label}</span>
    </div>
  );
};

export default HomeBatchStatus;
