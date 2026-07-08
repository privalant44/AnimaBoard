/**
 * CRUD prestations prévisionnelles (planned_scenario + planned_forecast).
 * Stockage : resource_id, scénario (1=P1, 2=P2…), mois (YYYY-MM), jours.
 */
const { getSupabase } = require('./supabaseClient');

function mapScenario(resourceId, scenario, row, forecastByKey) {
  const key = `${resourceId}|${scenario}`;
  return {
    resourceId: Number(resourceId),
    scenario: Number(scenario),
    tjm: row?.tjm != null && row.tjm !== '' ? Number(row.tjm) : null,
    description: row?.description != null ? String(row.description) : '',
    forecast: forecastByKey[key] || {},
  };
}

async function loadForecastMap(supabase) {
  const { data, error } = await supabase
    .from('planned_forecast')
    .select('resource_id, scenario, month, days');

  if (error) throw error;

  const forecastByKey = {};
  (data || []).forEach((row) => {
    const key = `${row.resource_id}|${row.scenario}`;
    if (!forecastByKey[key]) forecastByKey[key] = {};
    forecastByKey[key][row.month] = Number(row.days) || 0;
  });
  return forecastByKey;
}

async function listPlannedDeliveriesByResource() {
  const supabase = getSupabase();
  if (!supabase) return {};

  const forecastByKey = await loadForecastMap(supabase);

  const { data: scenarios, error } = await supabase
    .from('planned_scenario')
    .select('resource_id, scenario, tjm, description')
    .order('resource_id', { ascending: true })
    .order('scenario', { ascending: true });

  if (error) throw error;

  const byResource = {};
  (scenarios || []).forEach((row) => {
    const rid = String(row.resource_id);
    if (!byResource[rid]) byResource[rid] = [];
    byResource[rid].push(mapScenario(row.resource_id, row.scenario, row, forecastByKey));
  });
  return byResource;
}

async function getScenario(resourceId, scenario) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const rid = Number(resourceId);
  const sc = Number(scenario);
  if (!rid || !sc) {
    const err = new Error('resourceId et scenario sont requis');
    err.status = 400;
    throw err;
  }

  const forecastByKey = await loadForecastMap(supabase);
  const { data: row, error } = await supabase
    .from('planned_scenario')
    .select('resource_id, scenario, tjm, description')
    .eq('resource_id', rid)
    .eq('scenario', sc)
    .maybeSingle();

  if (error) throw error;
  if (!row) {
    const err = new Error('Scénario prévisionnel introuvable');
    err.status = 404;
    throw err;
  }
  return mapScenario(rid, sc, row, forecastByKey);
}

async function createPlannedDelivery({ resourceId, tjm = null, description = '' }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const rid = Number(resourceId);
  if (!rid) {
    const err = new Error('resourceId est requis');
    err.status = 400;
    throw err;
  }

  const { data: existing, error: listError } = await supabase
    .from('planned_scenario')
    .select('scenario')
    .eq('resource_id', rid)
    .order('scenario', { ascending: false })
    .limit(1);

  if (listError) throw listError;

  const nextScenario = ((existing && existing[0]?.scenario) || 0) + 1;
  const now = new Date().toISOString();

  const { error } = await supabase.from('planned_scenario').insert({
    resource_id: rid,
    scenario: nextScenario,
    tjm: tjm != null && tjm !== '' ? Number(tjm) : null,
    description: description != null ? String(description).trim() : '',
    updated_at: now,
  });

  if (error) throw error;
  return mapScenario(rid, nextScenario, {
    tjm,
    description,
  }, {});
}

async function updatePlannedDelivery({
  resourceId,
  scenario,
  tjm,
  description,
  month,
  days,
}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const rid = Number(resourceId);
  const sc = Number(scenario);
  if (!rid || !sc) {
    const err = new Error('resourceId et scenario sont requis');
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();

  if (tjm !== undefined || description !== undefined) {
    const patch = { updated_at: now };
    if (tjm !== undefined) {
      patch.tjm = tjm != null && tjm !== '' ? Number(tjm) : null;
    }
    if (description !== undefined) {
      patch.description = description != null ? String(description).trim() : '';
    }
    const { error } = await supabase
      .from('planned_scenario')
      .update(patch)
      .eq('resource_id', rid)
      .eq('scenario', sc);
    if (error) throw error;
  }

  if (month) {
    const monthStr = String(month);
    const shouldDelete =
      days === null || days === undefined || days === '' || Number(days) === 0;

    if (shouldDelete) {
      const { error } = await supabase
        .from('planned_forecast')
        .delete()
        .eq('resource_id', rid)
        .eq('scenario', sc)
        .eq('month', monthStr);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('planned_forecast').upsert(
        {
          resource_id: rid,
          scenario: sc,
          month: monthStr,
          days: Number(days) || 0,
          updated_at: now,
        },
        { onConflict: 'resource_id,scenario,month' }
      );
      if (error) throw error;
    }
  }

  return getScenario(rid, sc);
}

async function deletePlannedDelivery({ resourceId, scenario }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const rid = Number(resourceId);
  const sc = Number(scenario);
  if (!rid || !sc) {
    const err = new Error('resourceId et scenario sont requis');
    err.status = 400;
    throw err;
  }

  const { error } = await supabase
    .from('planned_scenario')
    .delete()
    .eq('resource_id', rid)
    .eq('scenario', sc);

  if (error) throw error;
  return { success: true };
}

/**
 * CA mensuel issu des prestations prévisionnelles manuelles (planned_scenario + planned_forecast).
 * @param {object} options
 * @param {number} options.year
 * @param {'none'|number} options.scenarioFilter - 'none' = aucun CA prévi. ; sinon cumul P1…Pn (scénario ≤ n)
 * @param {Set<string>} options.eligibleResourceIds
 * @param {Map<string, boolean>} options.resourceIsExternal
 * @param {(month: string) => boolean} options.isOpenMonth
 */
function scenarioIncluded(scenarioNumber, scenarioFilter) {
  if (scenarioFilter === 'none') return false;
  return scenarioNumber <= scenarioFilter;
}

function formatPlannedScenarioFilterLabel(scenarioFilter) {
  if (scenarioFilter === 'none' || scenarioFilter == null) return null;
  if (scenarioFilter === 1) return 'P1';
  return `P1–P${scenarioFilter}`;
}

async function getPlannedCaContribution({
  year,
  scenarioFilter = 'none',
  eligibleResourceIds,
  resourceIsExternal,
  isOpenMonth,
  averageDailyCostByResource = null,
}) {
  const supabase = getSupabase();
  const internalByMonth = new Map();
  const externalByMonth = new Map();
  const internalCostByMonth = new Map();
  const externalCostByMonth = new Map();
  const availableScenarios = new Set();

  if (!supabase) {
    return {
      internalByMonth,
      externalByMonth,
      internalCostByMonth,
      externalCostByMonth,
      availableScenarios: [],
    };
  }

  const y = Number(year);
  if (!y) {
    return {
      internalByMonth,
      externalByMonth,
      internalCostByMonth,
      externalCostByMonth,
      availableScenarios: [],
    };
  }

  const { data: scenarios, error: scenarioError } = await supabase
    .from('planned_scenario')
    .select('resource_id, scenario, tjm');

  if (scenarioError) throw scenarioError;

  const tjmByKey = new Map();
  (scenarios || []).forEach((row) => {
    const sc = Number(row.scenario);
    if (!sc) return;
    availableScenarios.add(sc);
    if (!scenarioIncluded(sc, scenarioFilter)) return;
    const tjm = row.tjm != null && row.tjm !== '' ? Number(row.tjm) : null;
    if (tjm == null || tjm <= 0) return;
    tjmByKey.set(`${row.resource_id}|${sc}`, tjm);
  });

  const { data: forecasts, error: forecastError } = await supabase
    .from('planned_forecast')
    .select('resource_id, scenario, month, days')
    .gte('month', `${y}-01`)
    .lte('month', `${y}-12`);

  if (forecastError) throw forecastError;

  (forecasts || []).forEach((row) => {
    const month = String(row.month || '');
    const sc = Number(row.scenario);
    const resourceId = String(row.resource_id || '');
    if (!month || !sc || !resourceId) return;
    if (scenarioFilter === 'none') return;
    if (!scenarioIncluded(sc, scenarioFilter)) return;
    if (!isOpenMonth(month)) return;
    if (!eligibleResourceIds.has(resourceId)) return;

    const days = Number(row.days) || 0;
    if (days <= 0) return;

    const tjm = tjmByKey.get(`${row.resource_id}|${sc}`);
    if (tjm == null || tjm <= 0) return;

    const ca = days * tjm;
    const isExternal = resourceIsExternal.get(resourceId) === true;
    const targetMap = isExternal ? externalByMonth : internalByMonth;
    targetMap.set(month, (targetMap.get(month) || 0) + ca);

    const dailyCost =
      averageDailyCostByResource && typeof averageDailyCostByResource.get === 'function'
        ? averageDailyCostByResource.get(resourceId)
        : null;
    if (dailyCost != null && dailyCost > 0) {
      const cost = days * dailyCost;
      const costMap = isExternal ? externalCostByMonth : internalCostByMonth;
      costMap.set(month, (costMap.get(month) || 0) + cost);
    }
  });

  return {
    internalByMonth,
    externalByMonth,
    internalCostByMonth,
    externalCostByMonth,
    availableScenarios: Array.from(availableScenarios).sort((a, b) => a - b),
  };
}

function parseScenarioFilter(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '' || s === 'none' || s === 'aucun' || s === 'all' || s === '0') return 'none';
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 'none';
}

module.exports = {
  listPlannedDeliveriesByResource,
  createPlannedDelivery,
  updatePlannedDelivery,
  deletePlannedDelivery,
  getPlannedCaContribution,
  parseScenarioFilter,
  formatPlannedScenarioFilterLabel,
};
