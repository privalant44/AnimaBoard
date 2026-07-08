/**
 * Boond sync routes for Vercel (single function + rewrite in vercel.json).
 *
 * POST /api/boondmanager/sync/resources
 * POST /api/boondmanager/sync/deliveries
 * POST /api/boondmanager/sync/dictionary
 * POST /api/boondmanager/sync/timesheets
 * POST /api/boondmanager/sync/absences
 * POST /api/boondmanager/sync/besoins/snapshot
 * POST /api/timesheets-reset (rewrite → route=timesheets-reset)
 */
const path = require('path');
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));
const { resetTimesheetsWindow } = require(path.join(__dirname, '..', '..', 'lib', 'timesheetsReset'));
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
  if (!assertBoondPasswordReady(res)) return;

  const syncDeliveriesYear = require(path.join(__dirname, '..', '..', 'scripts', 'sync-deliveries-year'));
  const result = await syncDeliveriesYear();
  const count = result?.metadata?.savedCount ?? result?.data?.length ?? 0;
  const year = result?.metadata?.targetYear ?? new Date().getFullYear();
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} prestation(s) pour ${year}`,
    count,
    metadata: result?.metadata,
  });
}

async function handleDictionarySync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { syncDictionaryFromBoond } = require(path.join(__dirname, '..', '..', 'lib', 'dictionarySync'));
  const result = await syncDictionaryFromBoond();

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Dictionnaire synchronisé : ${result.resourcesTypeOf} types ressources, ${result.resourcesState} statuts ressources, ${result.opportunitiesTypeOf} types opportunités, ${result.opportunitiesState} statuts opportunités.`,
    count: result.count,
    details: result,
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

function formatBesoinsSyncError(err) {
  const message = err?.message || 'Erreur lors de la synchronisation des besoins';
  let hint;
  if (err?.code === '42P01') {
    hint = 'La table besoins est absente. Appliquez la migration Supabase ou réexécutez fix_public_schema_grants.sql.';
  } else if (/permission denied/i.test(message)) {
    hint = 'Droits Supabase manquants sur public. Exécutez supabase/snippets/fix_public_schema_grants.sql en prod.';
  } else if (/BOOND_EMAIL|BOOND_PASSWORD|requis/i.test(message)) {
    hint = 'Vérifiez BOOND_EMAIL, BOOND_PASSWORD (ou BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY) sur Vercel.';
  } else if (/column.*state|state.*column/i.test(message)) {
    hint = 'Colonne state absente. Appliquez la migration 20260601192000_besoins_add_state.sql.';
  } else if (/timeout|timed out|FUNCTION_INVOCATION_TIMEOUT/i.test(message)) {
    hint = 'Délai Vercel dépassé pendant la pagination Boond. Réessayez ou lancez le batch via /api/batch-sync/run.';
  }
  return {
    success: false,
    error: message,
    hint,
    errorDetail: err?.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : err?.details || undefined,
  };
}

async function handleBesoinsSnapshotSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  if (!assertBoondPasswordReady(res)) return;
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

async function handleTimesheetsReset(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const { startMonth, endMonth, count, totalEntries } = await resetTimesheetsWindow({ monthsBack: 6 });
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Feuilles de temps réinitialisées et rechargées (${startMonth} à ${endMonth}) : ${count} feuilles, ${totalEntries} entrées.`,
  });
}

const ROUTES = {
  resources: handleResourcesSync,
  deliveries: handleDeliveriesSync,
  dictionary: handleDictionarySync,
  timesheets: handleTimesheetsSync,
  absences: handleAbsencesSync,
  'besoins/snapshot': handleBesoinsSnapshotSync,
  'timesheets-reset': handleTimesheetsReset,
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
    console.error(`sync/${route || '?'} error:`, err);
    if (route === 'resources' || route === 'deliveries') {
      let message = err.message || `Erreur lors de la synchronisation (${route})`;
      let detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : undefined;
      if (/BOOND_EMAIL|BOOND_PASSWORD|requis/.test(message)) {
        detail =
          (detail ? `${detail} — ` : '') +
          'Sur Vercel : ajoutez BOOND_EMAIL et BOOND_PASSWORD dans Environment Variables.';
      }
      return res.status(500).json({ success: false, error: message, errorDetail: detail || message });
    }
    if (route === 'besoins/snapshot') {
      return res.status(500).json(formatBesoinsSyncError(err));
    }
    throw err;
  }
}, { statusCode: 500 });
