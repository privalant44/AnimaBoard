/**
 * GET /api/data/deliveries.json - Prestations (Supabase)
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { createVercelHandler } = require('../../lib/errorHandler');

function okData(res, data, fileLabel, count) {
  const payload = { success: true, data };
  if (fileLabel) payload.file = fileLabel;
  if (count != null) payload.count = count;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(payload);
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const stored = await kvStorage.get(KV_KEYS.DELIVERIES, null);
  if (!stored) {
    return res.status(404).json({
      success: false,
      error: 'Aucune donnée prestations. Lancez la synchronisation "Prestations" depuis Paramètres.',
      file: 'deliveries'
    });
  }
  const data = stored.data || stored;
  const list = Array.isArray(data) ? data : (data.data || []);
  return okData(res, stored.metadata ? { metadata: stored.metadata, data: list } : list, 'deliveries', list.length);
}, { statusCode: 404, message: 'Prestations non disponibles' });
