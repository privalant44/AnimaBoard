/**
 * POST /api/data/timesheets-reset - Réinitialise les feuilles de temps (année n-1 et n) en supprimant les données en KV.
 * Après appel, les données pour les années précédente et courante sont vidées ; une nouvelle synchro (3 derniers mois) les recréera.
 */
const path = require('path');
try {
  require(path.join(__dirname, '..', '..', 'lib', 'secretEnv'));
} catch (e) {
  // optionnel en prod Vercel
}
const kvStorage = require(path.join(__dirname, '..', '..', 'lib', 'kvStorage'));
const { KV_KEYS } = require(path.join(__dirname, '..', '..', 'lib', 'constants'));
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));

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
    sendJson(res, 200, {
      success: true,
      message: 'Feuilles de temps réinitialisées (année n-1 et n). Lancez une synchronisation pour recréer les données (3 derniers mois).'
    });
  } catch (err) {
    console.error('timesheets-reset error:', err);
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Erreur lors de la réinitialisation'
    });
  }
});
