/**
 * Batch quotidien : Pennylane, ressources, prestations/projets (année),
 * timesheets (3 mois), besoins (mois en cours ; mois précédent le 1er).
 */
const { syncDictionaryFromBoond } = require('./dictionarySync');
const { getSupabase } = require('./supabaseClient');
const dashboardService = require('../server/services/dashboardService');
const BoondManagerSync = require('../sync');
const syncDeliveriesYear = require('../scripts/sync-deliveries-year');
const syncProjectsYear = require('../scripts/sync-projects-year');
const syncTimesheets = require('../sync_timesheets');
const {
  fetchBoondOpportunities,
  normalizeOpportunityToBesoin,
} = require('../server/routes/boondManager');

const STEP_LABELS = {
  dictionary: 'Dictionnaire (libellés)',
  pennylane_income_statement: 'Pennylane',
  resources: 'Ressources',
  deliveries_current_year: 'Prestations (année)',
  projects_current_year: 'Projets (année)',
  timesheets_last_3_months: 'Feuilles de temps (3 mois)',
  besoins_current_month: 'Besoins (mois en cours)',
  besoins_previous_month: 'Besoins (mois précédent)',
};

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getLast3MonthsRange() {
  const now = new Date();
  const endMonth = monthKey(now);
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0));
  const startMonth = monthKey(startDate);
  return { startMonth, endMonth };
}

function getMonthRangeUtc(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end, year, month };
}

function getPreviousMonthRange() {
  const now = new Date();
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return getMonthRangeUtc(prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth() + 1);
}

function isFirstDayOfMonth() {
  return new Date().getUTCDate() === 1;
}

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min} min ${rem} s`;
}

function logBatchSummary({ success, durationMs, steps, errorMessage }) {
  const summaries = buildStepSummaries(steps);
  const status = success ? '✅ Batch quotidien terminé' : '❌ Batch quotidien échoué';
  console.log(`\n${status} en ${formatDuration(durationMs)} (${summaries.length} étape(s))`);
  for (const step of summaries) {
    const detail = step.ok ? '' : ` — ${step.error || 'erreur'}`;
    console.log(`   - ${step.label}: ${formatDuration(step.durationMs)}${detail}`);
  }
  if (errorMessage) console.log(`   Erreur: ${errorMessage}`);
  console.log('');
}

async function syncBesoinsForMonth({ year, month }) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }

  const { start, end } = getMonthRangeUtc(year, month);
  const { list: boondList, pagesFetched } = await fetchBoondOpportunities({}, { paginate: true });
  const normalized = boondList.map((item) => normalizeOpportunityToBesoin(item)).filter((row) => row !== null);
  const byId = new Map();
  normalized.forEach((row) => byId.set(row.id, row));

  const filteredRows = Array.from(byId.values()).filter((row) => {
    const ref = row.date_mise_a_jour || row.date_creation;
    if (!ref) return false;
    const d = new Date(ref);
    return !Number.isNaN(d.getTime()) && d >= start && d < end;
  });

  for (let i = 0; i < filteredRows.length; i += 500) {
    const chunk = filteredRows.slice(i, i + 500);
    const { error } = await supabase.from('besoins').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  return {
    syncedCount: filteredRows.length,
    pagesFetched,
    year,
    month,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function summarizeStep(step) {
  if (!step || !step.ok) {
    return { label: STEP_LABELS[step?.name] || step?.name || '?', count: null, error: step?.error || 'Erreur' };
  }
  const d = step.details || {};
  switch (step.name) {
    case 'dictionary':
      return { label: STEP_LABELS[step.name], count: d.count ?? 0, unit: 'entrées' };
    case 'pennylane_income_statement':
      return { label: STEP_LABELS[step.name], count: d.months ?? 0, unit: 'mois' };
    case 'resources':
      return { label: STEP_LABELS[step.name], count: d.count ?? 0, unit: 'ressources' };
    case 'deliveries_current_year':
      return { label: STEP_LABELS[step.name], count: d.savedCount ?? d.successCount ?? 0, unit: 'prestations' };
    case 'projects_current_year':
      return { label: STEP_LABELS[step.name], count: d.savedCount ?? d.successCount ?? 0, unit: 'projets' };
    case 'timesheets_last_3_months':
      return {
        label: STEP_LABELS[step.name],
        count: d.totalTimesheets ?? 0,
        unit: 'feuilles',
        extra: d.totalEntries != null ? `${d.totalEntries} entrées` : undefined,
      };
    case 'besoins_current_month':
    case 'besoins_previous_month':
      return { label: STEP_LABELS[step.name], count: d.syncedCount ?? 0, unit: 'besoins' };
    default:
      return { label: STEP_LABELS[step.name] || step.name, count: null };
  }
}

function buildStepSummaries(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => ({
    name: step.name,
    ok: step.ok !== false,
    durationMs: step.durationMs ?? null,
    ...summarizeStep(step),
  }));
}

async function saveBatchSyncLog({
  startedAt,
  finishedAt,
  durationMs,
  success,
  triggerSource,
  triggeredBy,
  steps,
  errorMessage,
}) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[dailyBatchSync] Supabase absent — journal non enregistré.');
    return null;
  }

  const startedDate = new Date(startedAt);
  const row = {
    run_date: utcDateString(startedDate),
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
    success: Boolean(success),
    trigger_source: triggerSource || 'cron',
    triggered_by: triggeredBy || null,
    steps: Array.isArray(steps) ? steps : [],
    error_message: errorMessage || null,
  };

  const { data, error } = await supabase.from('batch_sync_logs').insert(row).select('id').single();
  if (error) {
    if (error.code === '42P01') {
      console.warn('[dailyBatchSync] Table batch_sync_logs absente — appliquez la migration Supabase.');
      return null;
    }
    throw error;
  }
  return data?.id ?? null;
}

async function runDailyBatch(options = {}) {
  const { triggerSource = 'cron', triggeredBy = null } = options;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const steps = [];
  const currentYear = new Date().getUTCFullYear();
  let fatalError = null;

  const runStep = async (name, fn) => {
    const t0 = Date.now();
    try {
      const details = await fn();
      steps.push({ name, ok: true, durationMs: Date.now() - t0, details });
    } catch (error) {
      const message = error?.message || String(error);
      steps.push({ name, ok: false, durationMs: Date.now() - t0, error: message });
      if (!fatalError) fatalError = message;
    }
  };

  await runStep('dictionary', async () => syncDictionaryFromBoond());

  await runStep('pennylane_income_statement', async () => {
      const result = await dashboardService.syncPennylaneIncomeStatement();
      return {
        year: result?.year,
        months: Array.isArray(result?.monthly) ? result.monthly.length : 0,
        lastSyncAt: result?.lastSyncAt || null,
      };
    });

    await runStep('resources', async () => {
      const sync = new BoondManagerSync();
      const resources = await sync.syncResources();
      return { count: Array.isArray(resources) ? resources.length : 0 };
    });

    await runStep('deliveries_current_year', async () => {
      const result = await syncDeliveriesYear();
      const year = result?.metadata?.targetYear ?? currentYear;
      return { year, ...(result?.metadata || {}) };
    });

    await runStep('projects_current_year', async () => {
      const result = await syncProjectsYear({ year: currentYear });
      return { year: currentYear, ...(result?.metadata || {}) };
    });

    await runStep('timesheets_last_3_months', async () => {
      const { startMonth, endMonth } = getLast3MonthsRange();
      const result = await syncTimesheets(startMonth, endMonth);
      return {
        startMonth,
        endMonth,
        totalTimesheets: result?.metadata?.totalTimesheets ?? 0,
        totalEntries: result?.metadata?.totalEntries ?? 0,
      };
    });

    await runStep('besoins_current_month', async () => {
      const now = new Date();
      return syncBesoinsForMonth({
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
      });
    });

    if (isFirstDayOfMonth()) {
      const prev = getPreviousMonthRange();
      await runStep('besoins_previous_month', async () => syncBesoinsForMonth(prev));
    }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  const success = !fatalError && steps.every((s) => s.ok !== false);

  const logId = await saveBatchSyncLog({
    startedAt,
    finishedAt,
    durationMs,
    success,
    triggerSource,
    triggeredBy,
    steps,
    errorMessage: fatalError,
  });

  const result = {
    success,
    logId,
    startedAt,
    finishedAt,
    durationMs,
    steps,
    stepSummaries: buildStepSummaries(steps),
    error: fatalError,
  };

  logBatchSummary({ success, durationMs, steps, errorMessage: fatalError });

  if (!success) {
    const err = new Error(fatalError || 'Le batch quotidien a échoué');
    err.batchResult = result;
    throw err;
  }

  return result;
}

function parseMonthParam(monthStr) {
  const raw = String(monthStr || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month, key: raw };
}

function parseDateParam(dateStr) {
  const raw = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

async function getBatchSyncLogs({ month, date } = {}) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }

  const parsedDate = parseDateParam(date);
  let parsedMonth = parsedDate ? null : parseMonthParam(month) || parseMonthParam(monthKey(new Date()));

  let query = supabase
    .from('batch_sync_logs')
    .select('*')
    .order('started_at', { ascending: false });

  if (parsedDate) {
    query = query.eq('run_date', parsedDate);
  } else if (parsedMonth) {
    const start = `${parsedMonth.key}-01`;
    const endDate = new Date(Date.UTC(parsedMonth.year, parsedMonth.month, 1));
    const end = utcDateString(endDate);
    query = query.gte('run_date', start).lt('run_date', end);
  } else {
    const now = new Date();
    const key = monthKey(now);
    const start = `${key}-01`;
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    query = query.gte('run_date', start).lt('run_date', endDate.toISOString().slice(0, 10));
    parsedMonth = parseMonthParam(key);
  }

  const { data, error } = await query.limit(200);
  if (error) {
    if (error.code === '42P01') {
      return { month: parsedMonth?.key || null, date: parsedDate, logs: [], days: [], monthlyTotals: {} };
    }
    throw error;
  }

  const logs = (data || []).map((row) => ({
    id: row.id,
    runDate: row.run_date,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    success: row.success,
    triggerSource: row.trigger_source,
    triggeredBy: row.triggered_by,
    steps: row.steps,
    stepSummaries: buildStepSummaries(row.steps),
    errorMessage: row.error_message,
  }));

  const daysMap = new Map();
  for (const log of logs) {
    const day = log.runDate;
    if (!daysMap.has(day)) {
      daysMap.set(day, {
        date: day,
        runs: 0,
        successCount: 0,
        failureCount: 0,
        logs: [],
      });
    }
    const entry = daysMap.get(day);
    entry.runs += 1;
    if (log.success) entry.successCount += 1;
    else entry.failureCount += 1;
    entry.logs.push(log);
  }

  const days = Array.from(daysMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  const monthlyTotals = {};
  for (const log of logs) {
    if (!log.success) continue;
    for (const summary of log.stepSummaries) {
      if (summary.count == null) continue;
      if (!monthlyTotals[summary.name]) {
        monthlyTotals[summary.name] = { label: summary.label, count: 0, unit: summary.unit || '' };
      }
      monthlyTotals[summary.name].count += summary.count;
    }
  }

  return {
    month: parsedMonth?.key || (parsedDate ? parsedDate.slice(0, 7) : null),
    date: parsedDate,
    logs,
    days,
    monthlyTotals,
  };
}

async function getLastBatchStatus() {
  const supabase = getSupabase();
  if (!supabase) {
    return { hasRun: false, success: null, startedAt: null, finishedAt: null };
  }

  const { data, error } = await supabase
    .from('batch_sync_logs')
    .select('id, success, started_at, finished_at, trigger_source')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return { hasRun: false, success: null, startedAt: null, finishedAt: null };
    }
    throw error;
  }

  if (!data) {
    return { hasRun: false, success: null, startedAt: null, finishedAt: null };
  }

  return {
    hasRun: true,
    success: Boolean(data.success),
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    triggerSource: data.trigger_source,
  };
}

module.exports = {
  STEP_LABELS,
  runDailyBatch,
  getBatchSyncLogs,
  getLastBatchStatus,
  buildStepSummaries,
  summarizeStep,
  formatDuration,
};
