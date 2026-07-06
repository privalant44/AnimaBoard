/**
 * Batch sync routes for Vercel (single function + rewrites in vercel.json).
 *
 * POST /api/batch-sync/run
 * GET  /api/batch-sync/status
 * GET  /api/batch-sync/logs
 */
const { createVercelHandler } = require('../lib/errorHandler');
const {
  runDailyBatch,
  getLastBatchStatus,
  getBatchSyncLogs,
} = require('../lib/dailyBatchSync');

function ensureSecretEnv() {
  try {
    require('../lib/secretEnv');
  } catch (e) {
    // Optionnel en local.
  }
}

function getRoutePath(req) {
  const fromQuery = req.query.route;
  if (Array.isArray(fromQuery)) return fromQuery.filter(Boolean).join('/');
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return decodeURIComponent(fromQuery.trim()).replace(/\/$/, '');
  }

  const raw = req.query.path;
  if (Array.isArray(raw)) return raw.filter(Boolean).join('/');
  if (typeof raw === 'string' && raw.trim()) return raw.trim();

  const url = String(req.url || '');
  const match = url.match(/\/api\/batch-sync\/([^?]*)/);
  return match ? decodeURIComponent(match[1]).replace(/\/$/, '') : '';
}

module.exports = createVercelHandler(async (req, res) => {
  const route = getRoutePath(req);

  if (route === 'run' && req.method === 'POST') {
    ensureSecretEnv();
    const triggeredBy = req.auth?.email || req.auth?.preferredUsername || req.auth?.name || null;
    try {
      const result = await runDailyBatch({ triggerSource: 'manual', triggeredBy });
      return res.status(200).json(result);
    } catch (error) {
      if (error.batchResult) {
        return res.status(500).json(error.batchResult);
      }
      throw error;
    }
  }

  if (route === 'status' && req.method === 'GET') {
    const status = await getLastBatchStatus();
    return res.status(200).json({ success: true, ...status });
  }

  if (route === 'logs' && req.method === 'GET') {
    const month = req.query.month;
    const date = req.query.date;
    const data = await getBatchSyncLogs({ month, date });
    return res.status(200).json({ success: true, ...data });
  }

  return res.status(404).json({
    success: false,
    error: `Route batch-sync inconnue: ${route || '(vide)'}`,
  });
}, { statusCode: 500, message: 'Erreur batch-sync' });
