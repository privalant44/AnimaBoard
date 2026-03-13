/**
 * POST /api/data/forecast-times - Enregistrer un temps prévisionnel (KV)
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { createVercelHandler } = require('../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const { deliveryId, month, hours } = req.body || {};
  if (!deliveryId || !month || hours === undefined) {
    return res.status(400).json({ success: false, error: 'deliveryId, month et hours sont requis' });
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
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, message: 'Temps prévisionnel sauvegardé', data: data[deliveryId] });
}, { statusCode: 500, message: 'Erreur sauvegarde forecast-times' });
