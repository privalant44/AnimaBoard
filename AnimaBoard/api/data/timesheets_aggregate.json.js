/**
 * GET /api/data/timesheets_aggregate.json - Agrégat timesheets (Supabase)
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { createVercelHandler } = require('../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const stored = await kvStorage.get(KV_KEYS.TIMESHEETS_AGGREGATE, null);
  if (!stored) {
    return res.status(404).json({
      success: false,
      error: 'Agrégat timesheets non disponible. Lancez la synchronisation "Timesheets" depuis Paramètres.',
      file: 'timesheets_aggregate'
    });
  }
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, file: 'timesheets_aggregate', data: stored, count: (stored.data && stored.data.length) || 0 });
}, { statusCode: 404, message: 'Timesheets aggregate non disponible' });
