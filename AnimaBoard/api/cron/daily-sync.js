const { createVercelHandler } = require('../../lib/errorHandler');
const { getSupabase } = require('../../lib/supabaseClient');
const boondManagerService = require('../../server/services/boondManagerService');
const dashboardService = require('../../server/services/dashboardService');
const BoondManagerSync = require('../../sync');
const extractDeliveries = require('../../extract_deliveries');
const syncTimesheets = require('../../sync_timesheets');
const { syncAbsences } = require('../../sync_absences');

function ensureSecretEnv() {
  try {
    require('../../lib/secretEnv');
  } catch (e) {
    // Optionnel en local; sur Vercel, les variables sont injectées.
  }
}

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

function getAbsenceRangeNAndNMinus1() {
  const y = new Date().getUTCFullYear();
  return {
    beginDate: `${y - 1}-01-01`,
    endDate: `${y}-12-31`,
  };
}

function parseDateLike(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const fromEpoch = (n) => {
    if (!Number.isFinite(n)) return null;
    const ms = Math.abs(n) < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  if (typeof value === 'number') return fromEpoch(value);
  const raw = String(value).trim();
  if (!raw) return null;
  const boondMsMatch = raw.match(/^\/Date\(([-]?\d+)\)\/$/);
  if (boondMsMatch) return fromEpoch(Number(boondMsMatch[1]));
  if (/^[-]?\d+(\.\d+)?$/.test(raw)) return fromEpoch(Number(raw));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoOrNull(value) {
  const d = parseDateLike(value);
  return d ? d.toISOString() : null;
}

function normalizeOpportunityToBesoin(item) {
  if (!item || typeof item !== 'object') return null;
  const attrs = item.attributes || {};
  const rawId = item.id ?? attrs.id ?? item.opportunityId ?? attrs.opportunityId ?? null;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return null;
  const title = attrs.title ?? item.title ?? attrs.name ?? item.name ?? attrs.label ?? item.label ?? '';
  const createdAt =
    attrs.creationDate ??
    item.creationDate ??
    attrs.createdAt ??
    item.createdAt ??
    attrs.created_at ??
    item.created_at ??
    null;
  const updatedAt =
    attrs.updateDate ??
    item.updateDate ??
    attrs.updatedAt ??
    item.updatedAt ??
    attrs.updated_at ??
    item.updated_at ??
    null;
  const typeOf = attrs.typeOf ?? item.typeOf ?? attrs.projectType ?? item.projectType ?? attrs.type ?? item.type ?? null;
  const state = attrs.state ?? item.state ?? attrs.status ?? item.status ?? null;
  return {
    id,
    titre: String(title || ''),
    date_creation: toIsoOrNull(createdAt),
    date_mise_a_jour: toIsoOrNull(updatedAt),
    type_of: typeOf !== undefined && typeOf !== null && typeOf !== '' ? String(typeOf) : null,
    state: state !== undefined && state !== null && state !== '' ? String(state) : null,
  };
}

function extractOpportunities(payload) {
  if (!payload) return [];
  return (
    (payload._embedded && Array.isArray(payload._embedded.opportunities) && payload._embedded.opportunities) ||
    (Array.isArray(payload.data) && payload.data) ||
    (Array.isArray(payload.opportunities) && payload.opportunities) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload) && payload) ||
    []
  );
}

async function fetchOpportunitiesAllPages(maxPages = 200) {
  const endpoints = ['/opportunites', '/opportunities'];
  const all = [];
  let usedEndpoint = null;
  let pagesFetched = 0;

  for (const endpoint of endpoints) {
    try {
      let page = 1;
      while (page <= maxPages) {
        const payload = await boondManagerService.makeRequest(endpoint, { page });
        const list = extractOpportunities(payload);
        if (list.length === 0) break;
        all.push(...list);
        pagesFetched += 1;
        if (list.length < 100) break;
        page += 1;
      }
      usedEndpoint = endpoint;
      break;
    } catch (err) {
      // Essayer l'autre endpoint.
    }
  }

  if (!usedEndpoint) {
    throw new Error('Impossible de récupérer les opportunités BoondManager (endpoints FR/EN indisponibles).');
  }

  return { list: all, pagesFetched, endpoint: usedEndpoint };
}

async function syncBesoinsRecentMonths(recentMonths = 2) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
  const { list: boondList, pagesFetched } = await fetchOpportunitiesAllPages();
  const normalized = boondList.map((item) => normalizeOpportunityToBesoin(item)).filter((row) => row !== null);
  const byId = new Map();
  normalized.forEach((row) => byId.set(row.id, row));
  const uniqueRows = Array.from(byId.values());

  const now = new Date();
  const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (recentMonths - 1), 1, 0, 0, 0, 0));
  const filteredRows = uniqueRows.filter((row) => {
    const ref = row.date_mise_a_jour || row.date_creation;
    if (!ref) return false;
    const d = new Date(ref);
    return !Number.isNaN(d.getTime()) && d >= cutoffDate;
  });

  for (let i = 0; i < filteredRows.length; i += 500) {
    const chunk = filteredRows.slice(i, i + 500);
    const { error } = await supabase.from('besoins').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  return {
    syncedCount: filteredRows.length,
    pagesFetched,
    recentMonths,
    cutoffIso: cutoffDate.toISOString(),
  };
}

function assertCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = String(req.headers.authorization || '');
  const expected = `Bearer ${secret}`;
  return auth === expected;
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  ensureSecretEnv();
  if (!assertCronAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized cron call' });
  }

  const startedAt = new Date().toISOString();
  const steps = [];
  const startedMs = Date.now();

  const runStep = async (name, fn) => {
    const t0 = Date.now();
    const details = await fn();
    steps.push({
      name,
      ok: true,
      durationMs: Date.now() - t0,
      details,
    });
  };

  await runStep('resources', async () => {
    const sync = new BoondManagerSync();
    const resources = await sync.syncResources();
    return { count: Array.isArray(resources) ? resources.length : 0 };
  });

  await runStep('deliveries', async () => {
    const result = await extractDeliveries();
    return { count: result?.data?.length || 0, metadata: result?.metadata || null };
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

  await runStep('absences_n-1_to_n', async () => {
    const { beginDate, endDate } = getAbsenceRangeNAndNMinus1();
    const result = await syncAbsences({ beginDate, endDate });
    return {
      beginDate,
      endDate,
      aggregatedRows: result?.data?.length || 0,
      rawRecordCount: result?.metadata?.rawRecordCount ?? 0,
    };
  });

  await runStep('besoins_recent_2_months', async () => syncBesoinsRecentMonths(2));

  await runStep('income_statement_current_year', async () => {
    const result = await dashboardService.syncPennylaneIncomeStatement();
    return {
      year: result?.year,
      months: Array.isArray(result?.monthly) ? result.monthly.length : 0,
      lastSyncAt: result?.lastSyncAt || null,
    };
  });

  return res.status(200).json({
    success: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    steps,
  });
}, { statusCode: 500, message: 'Erreur lors du batch daily-sync', skipAuth: true });

