/**
 * GET  /api/data/forecast-times.json (voir forecast-times.json.js)
 * POST /api/data/forecast-times
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { createVercelHandler } = require('../../lib/errorHandler');

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

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const body = readJsonBody(req);
  const { deliveryId, month, hours } = body;
  if (!deliveryId || !month || hours === undefined) {
    return res.status(400).json({
      success: false,
      error: 'deliveryId, month et hours sont requis',
    });
  }

  const stored = await kvStorage.get(KV_KEYS.FORECAST_TIMES, { metadata: {}, data: {} });
  const data = stored.data || {};
  if (!data[deliveryId]) data[deliveryId] = {};
  if (!data[deliveryId].forecast) data[deliveryId].forecast = {};
  data[deliveryId].forecast[month] = parseFloat(hours) || 0;
  stored.metadata = stored.metadata || {};
  stored.metadata.lastUpdated = new Date().toISOString();
  stored.data = data;
  await kvStorage.set(KV_KEYS.FORECAST_TIMES, stored);

  return res.status(200).json({
    success: true,
    message: 'Temps prévisionnel sauvegardé',
    data: data[deliveryId],
  });
}, { statusCode: 500, message: 'Erreur forecast-times' });
