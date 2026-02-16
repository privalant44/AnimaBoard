/**
 * POST /api/boondmanager/sync/timesheets - Synchronisation des feuilles de temps vers KV
 * Toujours renvoyer du JSON pour éviter JSON.parse côté client.
 */
const path = require('path');

function loadSecretEnv() {
  try {
    require(path.join(__dirname, '..', '..', '..', 'lib', 'secretEnv.js'));
  } catch (e) {
    console.warn('secretEnv load (optional):', e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    loadSecretEnv();
    const { startMonth, endMonth } = req.body || {};
    const syncTimesheets = require(path.join(__dirname, '..', '..', '..', 'sync_timesheets.js'));
    const result = await syncTimesheets(startMonth, endMonth);
    const count = result?.data?.length || 0;
    const totalEntries = result?.metadata?.totalEntries || 0;
    return res.status(200).json({
      success: true,
      message: `Synchronisation réussie: ${count} feuilles de temps synchronisées (${totalEntries} entrées)`,
      count,
      totalEntries,
      metadata: result?.metadata
    });
  } catch (err) {
    console.error('sync/timesheets error:', err);
    const message = err.message || 'Erreur lors de la synchronisation des feuilles de temps';
    const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : undefined;
    return res.status(500).json({
      success: false,
      error: message,
      errorDetail: detail || message
    });
  }
};
