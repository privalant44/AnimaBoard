/**
 * GET /api/data/forecast-times.json - Temps prévisionnels (Supabase)
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { createVercelHandler } = require('../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const stored = await kvStorage.get(KV_KEYS.FORECAST_TIMES, null);
  const data = stored || { metadata: { createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString() }, data: {} };
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, file: 'forecast-times', data });
}, { statusCode: 500, message: 'Erreur forecast-times' });
