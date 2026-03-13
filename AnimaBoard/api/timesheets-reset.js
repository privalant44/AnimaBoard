/**
 * POST /api/timesheets-reset - Réinitialise les feuilles de temps (année n-1 et n) en supprimant les données en KV.
 * Route au premier niveau pour éviter 404 sur Vercel (api/data/* parfois non résolu).
 */
const path = require('path');
try {
  require(path.join(__dirname, '..', 'lib', 'secretEnv'));
} catch (e) {
  // optionnel en prod Vercel
}
const kvStorage = require(path.join(__dirname, '..', 'lib', 'kvStorage'));
const { KV_KEYS } = require(path.join(__dirname, '..', 'lib', 'constants'));
const { createVercelHandler } = require(path.join(__dirname, '..', 'lib', 'errorHandler'));

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    return;
  }
  const keyData = KV_KEYS.TIMESHEETS_DATA;
  const keyAggregate = KV_KEYS.TIMESHEETS_AGGREGATE;
  if (!keyData || !keyAggregate) {
    sendJson(res, 500, { success: false, error: 'Configuration KV manquante (TIMESHEETS_DATA/TIMESHEETS_AGGREGATE).' });
    return;
  }
  try {
    await kvStorage.del(keyData);
    await kvStorage.del(keyAggregate);
    
    // Limiter à 6 mois pour éviter timeout Vercel (10s sur plan gratuit)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startMonth = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const syncTimesheets = require(path.join(__dirname, '..', 'sync_timesheets'));
    const result = await syncTimesheets(startMonth, endMonth);
    const count = result?.metadata?.totalTimesheets ?? 0;
    const totalEntries = result?.metadata?.totalEntries ?? 0;
    sendJson(res, 200, {
      success: true,
      message: `Feuilles de temps réinitialisées et rechargées (${startMonth} à ${endMonth}) : ${count} feuilles, ${totalEntries} entrées.`
    });
  } catch (err) {
    console.error('timesheets-reset error:', err);
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Erreur lors de la réinitialisation'
    });
  }
});
