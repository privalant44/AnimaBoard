import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import SettingsPanelLayout from './SettingsPanelLayout';
import '../Settings.css';

interface TreasuryPlanSettings {
  averagePaymentDelayDays: number;
  initialBalance: number;
}

interface SettingsTreasuryPlanPanelProps {
  onBack: () => void;
}

const SettingsTreasuryPlanPanel: React.FC<SettingsTreasuryPlanPanelProps> = ({ onBack }) => {
  const [averagePaymentDelayDays, setAveragePaymentDelayDays] = useState('30');
  const [initialBalance, setInitialBalance] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch('/api/settings/treasury-plan');
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `Erreur ${response.status}`);
        }
        const settings = body as TreasuryPlanSettings;
        if (!cancelled) {
          setAveragePaymentDelayDays(String(settings.averagePaymentDelayDays ?? 30));
          setInitialBalance(String(settings.initialBalance ?? 0));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur inconnue');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const delay = parseInt(averagePaymentDelayDays, 10);
      const balance = parseFloat(initialBalance.replace(',', '.'));
      if (!Number.isFinite(delay) || delay < 0) {
        throw new Error('Le délai moyen de paiement doit être un nombre de jours positif ou nul.');
      }
      if (!Number.isFinite(balance)) {
        throw new Error('Le solde initial doit être un montant valide.');
      }

      const response = await apiFetch('/api/settings/treasury-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          averagePaymentDelayDays: delay,
          initialBalance: balance,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `Erreur ${response.status}`);
      }
      const settings = body as TreasuryPlanSettings;
      setAveragePaymentDelayDays(String(settings.averagePaymentDelayDays));
      setInitialBalance(String(settings.initialBalance));
      setSuccessMessage('Paramètres enregistrés.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPanelLayout title="Plan de trésorerie" onBack={onBack}>
      <p className="settings-description">
        Configurez le délai moyen de paiement client et le solde initial utilisés pour le graphique
        de trésorerie sur la page d&apos;accueil.
      </p>

      {loading ? (
        <p className="settings-description">Chargement…</p>
      ) : (
        <form className="settings-treasury-form" onSubmit={handleSubmit}>
          <div className="settings-section">
            <label htmlFor="treasury-payment-delay">Délai moyen de paiement (jours)</label>
            <input
              id="treasury-payment-delay"
              type="number"
              min={0}
              max={365}
              step={1}
              value={averagePaymentDelayDays}
              onChange={(e) => setAveragePaymentDelayDays(e.target.value)}
              disabled={saving}
            />
            <p className="settings-field-hint">
              Exemple : 30 jours décale le CA d&apos;un mois (le CA de juin affiché provient du forecast de mai).
            </p>
          </div>

          <div className="settings-section">
            <label htmlFor="treasury-initial-balance">Solde initial (€)</label>
            <input
              id="treasury-initial-balance"
              type="number"
              step="any"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              disabled={saving}
            />
            <p className="settings-field-hint">
              Point de départ de la courbe de trésorerie avant les encaissements et charges du plan.
            </p>
          </div>

          {error && <p className="settings-error">{error}</p>}
          {successMessage && <p className="settings-success">{successMessage}</p>}

          <button type="submit" className="settings-action-button" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
    </SettingsPanelLayout>
  );
};

export default SettingsTreasuryPlanPanel;
