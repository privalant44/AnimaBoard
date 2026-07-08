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
const { createVercelHandler } = require(path.join(__dirname, '..', 'lib', 'errorHandler'));
const { resetTimesheetsWindow } = require(path.join(__dirname, '..', 'lib', 'timesheetsReset'));

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
  try {
    const { startMonth, endMonth, count, totalEntries } = await resetTimesheetsWindow({ monthsBack: 6 });
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
