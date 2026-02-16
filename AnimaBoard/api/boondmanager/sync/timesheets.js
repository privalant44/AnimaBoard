/**
 * POST /api/boondmanager/sync/timesheets - Synchronisation des feuilles de temps vers KV
 */
const { createVercelHandler } = require('../../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const { startMonth, endMonth } = req.body || {};
  const syncTimesheets = require('../../../sync_timesheets');
  const result = await syncTimesheets(startMonth, endMonth);
  const count = result?.data?.length || 0;
  const totalEntries = result?.metadata?.totalEntries || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} feuilles de temps synchronisées (${totalEntries} entrées)`,
    count,
    totalEntries,
    metadata: result?.metadata
  });
}, { statusCode: 500, message: 'Erreur lors de la synchronisation des feuilles de temps' });
