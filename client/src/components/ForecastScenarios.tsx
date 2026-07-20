import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import './ForecastScenarios.css';

export interface ForecastScenario {
  number: number;
  title: string;
  description: string;
}

interface ForecastScenariosProps {
  onClose: () => void;
  onChanged?: () => void;
}

async function safeParseJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse invalide du serveur (${res.status})`);
  }
}

const emptyForm = { number: '', title: '', description: '' };

const ForecastScenarios: React.FC<ForecastScenariosProps> = ({ onClose, onChanged }) => {
  const [scenarios, setScenarios] = useState<ForecastScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingNumber, setEditingNumber] = useState<number | null>(null);

  const loadScenarios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/data/forecast-scenarios');
      const body = await safeParseJson(response);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `Erreur ${response.status}`);
      }
      setScenarios(Array.isArray(body.data) ? body.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setScenarios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingNumber(null);
  };

  const startEdit = (scenario: ForecastScenario) => {
    setEditingNumber(scenario.number);
    setForm({
      number: String(scenario.number),
      title: scenario.title,
      description: scenario.description,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const number = parseInt(form.number.trim(), 10);
    if (!Number.isFinite(number) || number <= 0) {
      alert('Le numéro de scénario doit être un entier positif.');
      return;
    }
    if (editingNumber == null && scenarios.some((s) => s.number === number)) {
      alert(`Le scénario n°${number} existe déjà. Utilisez Modifier pour l’éditer.`);
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch('/api/data/forecast-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          title: form.title,
          description: form.description,
        }),
      });
      const body = await safeParseJson(response);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Erreur lors de l’enregistrement');
      }
      resetForm();
      await loadScenarios();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (number: number) => {
    if (!window.confirm(`Supprimer le scénario n°${number} ?`)) return;
    try {
      const response = await apiFetch('/api/data/forecast-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: true, number }),
      });
      const body = await safeParseJson(response);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Erreur lors de la suppression');
      }
      if (editingNumber === number) resetForm();
      await loadScenarios();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  return (
    <div className="forecast-scenarios-overlay" role="dialog" aria-modal="true" aria-labelledby="forecast-scenarios-title">
      <div className="forecast-scenarios-panel">
        <div className="forecast-scenarios-header">
          <button type="button" className="back-button" onClick={onClose}>
            ← Retour
          </button>
          <h2 id="forecast-scenarios-title">Scénarios</h2>
        </div>

        <div className="forecast-scenarios-body">
          {loading && <p className="forecast-scenarios-state">Chargement…</p>}
          {error && (
            <p className="forecast-scenarios-state forecast-scenarios-state--error">
              {error}
              <button type="button" className="forecast-scenarios-retry" onClick={() => void loadScenarios()}>
                Réessayer
              </button>
            </p>
          )}

          {!loading && !error && (
            <>
              <form className="forecast-scenarios-form" onSubmit={(e) => void handleSave(e)}>
                <h3>{editingNumber != null ? `Modifier le scénario n°${editingNumber}` : 'Nouveau scénario'}</h3>
                <div className="forecast-scenarios-form-row">
                  <label htmlFor="scenario-number">N° scénario</label>
                  <input
                    id="scenario-number"
                    type="number"
                    min={1}
                    step={1}
                    required
                    disabled={editingNumber != null || saving}
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="forecast-scenarios-form-row">
                  <label htmlFor="scenario-title">Titre</label>
                  <input
                    id="scenario-title"
                    type="text"
                    maxLength={120}
                    disabled={saving}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex. Optimiste"
                  />
                </div>
                <div className="forecast-scenarios-form-row">
                  <label htmlFor="scenario-description">Description</label>
                  <textarea
                    id="scenario-description"
                    rows={3}
                    maxLength={500}
                    disabled={saving}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Description du scénario…"
                  />
                </div>
                <div className="forecast-scenarios-form-actions">
                  {editingNumber != null && (
                    <button type="button" className="forecast-scenarios-cancel-btn" onClick={resetForm} disabled={saving}>
                      Annuler
                    </button>
                  )}
                  <button type="submit" className="forecast-scenarios-save-btn" disabled={saving}>
                    {saving ? 'Enregistrement…' : editingNumber != null ? 'Mettre à jour' : 'Créer'}
                  </button>
                </div>
              </form>

              <div className="forecast-scenarios-list-wrap">
                <h3>Scénarios existants ({scenarios.length})</h3>
                {scenarios.length === 0 ? (
                  <p className="forecast-scenarios-empty">
                    Aucun scénario défini. Créez-en un pour l’utiliser dans les prestations prévisionnelles.
                  </p>
                ) : (
                  <table className="forecast-scenarios-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Titre</th>
                        <th>Description</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {scenarios.map((s) => (
                        <tr key={s.number}>
                          <td>{s.number}</td>
                          <td>{s.title || '—'}</td>
                          <td>{s.description || '—'}</td>
                          <td className="forecast-scenarios-actions">
                            <button type="button" onClick={() => startEdit(s)}>
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="forecast-scenarios-delete-btn"
                              onClick={() => void handleDelete(s.number)}
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForecastScenarios;
