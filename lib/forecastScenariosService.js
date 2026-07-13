/**
 * CRUD catalogue global des scénarios prévisionnels (forecast_scenarios).
 */
const { getSupabase } = require('./supabaseClient');

function mapRow(row) {
  return {
    number: Number(row.number),
    title: row.title != null ? String(row.title) : '',
    description: row.description != null ? String(row.description) : '',
  };
}

async function listForecastScenarios() {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('forecast_scenarios')
    .select('number, title, description')
    .order('number', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRow);
}

async function getForecastScenario(number) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const n = Number(number);
  if (!n || n <= 0) {
    const err = new Error('Numéro de scénario invalide');
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('forecast_scenarios')
    .select('number, title, description')
    .eq('number', n)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error('Scénario introuvable');
    err.status = 404;
    throw err;
  }
  return mapRow(data);
}

async function upsertForecastScenario({ number, title, description }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const n = Number(number);
  if (!n || n <= 0) {
    const err = new Error('Le numéro de scénario doit être un entier positif');
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('forecast_scenarios')
    .upsert(
      {
        number: n,
        title: title != null ? String(title).trim() : '',
        description: description != null ? String(description).trim() : '',
        updated_at: now,
      },
      { onConflict: 'number' }
    )
    .select('number, title, description')
    .single();

  if (error) throw error;
  return mapRow(data);
}

async function deleteForecastScenario(number) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const n = Number(number);
  if (!n || n <= 0) {
    const err = new Error('Numéro de scénario invalide');
    err.status = 400;
    throw err;
  }

  const { error } = await supabase.from('forecast_scenarios').delete().eq('number', n);
  if (error) throw error;
  return { success: true };
}

function formatScenarioLabel(scenario, catalogByNumber) {
  const n = Number(scenario);
  if (!n) return null;
  const entry = catalogByNumber?.get?.(n);
  const title = entry?.title?.trim();
  if (title) return `${n} — ${title}`;
  return `P${n}`;
}

function formatPlannedScenarioFilterLabel(scenarioFilter, catalog = []) {
  if (scenarioFilter === 'none' || scenarioFilter == null) return null;
  const catalogByNumber = new Map(catalog.map((s) => [Number(s.number), s]));
  if (scenarioFilter === 1) {
    return formatScenarioLabel(1, catalogByNumber) || 'P1';
  }
  const first = formatScenarioLabel(1, catalogByNumber) || 'P1';
  const last = formatScenarioLabel(scenarioFilter, catalogByNumber) || `P${scenarioFilter}`;
  return `${first} à ${last}`;
}

module.exports = {
  listForecastScenarios,
  getForecastScenario,
  upsertForecastScenario,
  deleteForecastScenario,
  formatScenarioLabel,
  formatPlannedScenarioFilterLabel,
};
