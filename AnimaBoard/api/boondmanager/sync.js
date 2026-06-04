/**
 * Boond sync routes for Vercel (single function + rewrite in vercel.json).
 *
 * POST /api/boondmanager/sync/resources
 * POST /api/boondmanager/sync/deliveries
 * POST /api/boondmanager/sync/dictionary
 * POST /api/boondmanager/sync/timesheets
 * POST /api/boondmanager/sync/absences
 * POST /api/boondmanager/sync/time-reports
 * POST /api/boondmanager/sync/besoins/snapshot
 */
const path = require('path');
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));
const boondManagerService = require(path.join(__dirname, '..', '..', 'server', 'services', 'boondManagerService'));
const { getSupabase } = require(path.join(__dirname, '..', '..', 'lib', 'supabaseClient'));
const {
  fetchBoondOpportunities,
  normalizeOpportunityToBesoin,
} = require(path.join(__dirname, '..', '..', 'server', 'routes', 'boondManager'));

function loadSecretEnv() {
  try {
    require(path.join(__dirname, '..', '..', 'lib', 'secretEnv.js'));
  } catch (e) {
    console.warn('secretEnv load (optional):', e.message);
  }
}

function normalizeRoute(route) {
  return String(route || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/,/g, '/');
}

function getRoutePath(req) {
  const fromQuery = req.query.route;
  if (Array.isArray(fromQuery)) return normalizeRoute(fromQuery.filter(Boolean).join('/'));
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return normalizeRoute(decodeURIComponent(fromQuery.trim()));
  }

  const url = String(req.url || '');
  const match = url.match(/\/api\/boondmanager\/sync\/([^?]*)/);
  return match ? normalizeRoute(decodeURIComponent(match[1])) : '';
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function assertBoondPasswordReady(res) {
  if (
    process.env.BOOND_EMAIL &&
    process.env.BOOND_PASSWORD_ENC &&
    process.env.ANIMA_SECRET_KEY &&
    !process.env.BOOND_PASSWORD
  ) {
    res.status(500).json({
      success: false,
      error: 'Déchiffrement du mot de passe échoué',
      errorDetail:
        "BOOND_PASSWORD_ENC et ANIMA_SECRET_KEY sont définis mais le déchiffrement n'a pas produit de mot de passe.",
    });
    return false;
  }
  return true;
}

async function handleResourcesSync(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  if (!assertBoondPasswordReady(res)) return;

  const BoondManagerSync = require(path.join(__dirname, '..', '..', 'sync.js'));
  const sync = new BoondManagerSync();
  const result = await sync.syncResources();
  const count = Array.isArray(result) ? result.length : 0;
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} ressources synchronisées`,
    count,
  });
}

async function handleDeliveriesSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const extractDeliveries = require(path.join(__dirname, '..', '..', 'extract_deliveries'));
  const result = await extractDeliveries();
  const count = result?.data?.length || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Extraction réussie: ${count} prestations extraites`,
    count,
    metadata: result?.metadata,
  });
}

async function handleDictionarySync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Supabase non configuré' });
  }

  const dictionary = await boondManagerService.getDictionary();
  const dict = dictionary?.data?.data || dictionary?.data || dictionary || {};
  const typeOfList = dict?.setting?.typeOf?.resource || [];
  const opportunityTypeOfList = dict?.setting?.typeOf?.project || dict?.setting?.typeOf?.opportunity || [];
  const resourceStateList = dict?.setting?.state?.resource || [];
  const opportunityStateList = dict?.setting?.state?.opportunity || [];

  const rows = [];
  (Array.isArray(typeOfList) ? typeOfList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({ table_name: 'resources', column_name: 'type_of', code: String(item.id), label: String(item.value) });
    }
  });
  (Array.isArray(resourceStateList) ? resourceStateList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({ table_name: 'resources', column_name: 'state', code: String(item.id), label: String(item.value) });
    }
  });
  (Array.isArray(opportunityTypeOfList) ? opportunityTypeOfList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({ table_name: 'opportunities', column_name: 'type_of', code: String(item.id), label: String(item.value) });
    }
  });
  (Array.isArray(opportunityStateList) ? opportunityStateList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({ table_name: 'opportunities', column_name: 'state', code: String(item.id), label: String(item.value) });
    }
  });

  const seen = new Set();
  const uniqueRows = rows.filter((r) => {
    const key = `${r.table_name}|${r.column_name}|${r.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (let i = 0; i < uniqueRows.length; i += 100) {
    const chunk = uniqueRows.slice(i, i + 100);
    const { error } = await supabase.from('dictionnaire').upsert(chunk, { onConflict: 'table_name,column_name,code' });
    if (error) throw error;
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Dictionnaire synchronisé : ${uniqueRows.length} entrées`,
    count: uniqueRows.length,
  });
}

async function handleTimesheetsSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const body = readJsonBody(req);
  const syncTimesheets = require(path.join(__dirname, '..', '..', 'sync_timesheets'));
  const result = await syncTimesheets(body.startMonth, body.endMonth);
  const count = result?.metadata?.totalTimesheets ?? (Array.isArray(result?.data) ? result.data.length : 0);
  const totalEntries = result?.metadata?.totalEntries || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} feuilles de temps (${totalEntries} entrées)`,
    count,
    totalEntries,
    metadata: result?.metadata,
  });
}

async function handleAbsencesSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const body = readJsonBody(req);
  let { beginDate, endDate } = body || {};
  if (!beginDate || !endDate) {
    const y = new Date().getFullYear();
    beginDate = beginDate || `${y - 1}-01-01`;
    endDate = endDate || `${y}-12-31`;
  }
  const { syncAbsences } = require(path.join(__dirname, '..', '..', 'sync_absences'));
  const result = await syncAbsences({ beginDate, endDate });
  const count = result?.data?.length || 0;
  const rawCount = result?.metadata?.rawRecordCount ?? 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} lignes (collaborateur × mois)`,
    count,
    rawRecordCount: rawCount,
    metadata: result?.metadata,
    beginDate,
    endDate,
  });
}

async function handleTimeReportsSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const body = readJsonBody(req);
  const extractTimeReports = require(path.join(__dirname, '..', '..', 'extract_time_reports'));
  const result = await extractTimeReports(body.beginDate, body.endDate);
  const count = result?.data?.length || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Extraction réussie: ${count} enregistrements de temps`,
    count,
    metadata: result?.metadata,
  });
}

async function handleBesoinsSnapshotSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
    });
  }

  const body = readJsonBody(req);
  const recentMonthsRaw = req.query.recentMonths ?? body?.recentMonths;
  const recentMonths = Number.parseInt(String(recentMonthsRaw ?? ''), 10);
  const useRecentMode = Number.isFinite(recentMonths) && recentMonths > 0;

  const query = { ...(req.query || {}) };
  delete query.route;
  delete query.allPages;
  delete query.recentMonths;

  const { list: boondList, pagesFetched } = await fetchBoondOpportunities(query, { paginate: true });
  const normalized = boondList.map((item) => normalizeOpportunityToBesoin(item)).filter((row) => row !== null);

  const byId = new Map();
  normalized.forEach((row) => byId.set(row.id, row));
  const uniqueRows = Array.from(byId.values());
  let rowsToUpsert = uniqueRows;
  let cutoffIso = null;

  if (useRecentMode) {
    const now = new Date();
    const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (recentMonths - 1), 1, 0, 0, 0, 0));
    cutoffIso = cutoffDate.toISOString();
    rowsToUpsert = uniqueRows.filter((row) => {
      const ref = row.date_mise_a_jour || row.date_creation;
      if (!ref) return false;
      const d = new Date(ref);
      return !Number.isNaN(d.getTime()) && d >= cutoffDate;
    });
  } else {
    const { error: deleteError } = await supabase.from('besoins').delete().not('id', 'is', null);
    if (deleteError) throw deleteError;
  }

  for (let i = 0; i < rowsToUpsert.length; i += 500) {
    const chunk = rowsToUpsert.slice(i, i + 500);
    const { error } = await supabase.from('besoins').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: useRecentMode
      ? `Synchronisation des besoins (${recentMonths} derniers mois) : ${rowsToUpsert.length} besoins`
      : `Synchronisation des besoins : ${rowsToUpsert.length} besoins`,
    details: {
      syncedCount: rowsToUpsert.length,
      pagesFetched,
      mode: useRecentMode ? 'recent-months' : 'full',
      recentMonths: useRecentMode ? recentMonths : null,
      cutoffIso,
    },
  });
}

const ROUTES = {
  resources: handleResourcesSync,
  deliveries: handleDeliveriesSync,
  dictionary: handleDictionarySync,
  timesheets: handleTimesheetsSync,
  absences: handleAbsencesSync,
  'time-reports': handleTimeReportsSync,
  'besoins/snapshot': handleBesoinsSnapshotSync,
};

module.exports = createVercelHandler(async (req, res) => {
  loadSecretEnv();
  const route = getRoutePath(req);
  const handler = ROUTES[route];

  if (!handler) {
    return res.status(404).json({
      success: false,
      error: `Route sync Boond inconnue: ${route || '(vide)'}`,
      availableRoutes: Object.keys(ROUTES),
    });
  }

  try {
    return await handler(req, res);
  } catch (err) {
    if (route === 'resources') {
      console.error('sync/resources error:', err);
      let message = err.message || 'Erreur lors de la synchronisation des ressources';
      let detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : undefined;
      if (/BOOND_EMAIL|BOOND_PASSWORD|requis/.test(message)) {
        detail =
          (detail ? `${detail} — ` : '') +
          'Sur Vercel : ajoutez BOOND_EMAIL et BOOND_PASSWORD dans Environment Variables.';
      }
      return res.status(500).json({ success: false, error: message, errorDetail: detail || message });
    }
    throw err;
  }
}, { statusCode: 500, message: 'Erreur sync Boond' });
