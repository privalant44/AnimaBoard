/**
 * GET /api/data/resources.json - Ressources (BoondManager live ou KV en fallback)
 */
require('../../lib/secretEnv');
const boondManagerService = require('../../server/services/boondManagerService');
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
  try {
    const resources = await boondManagerService.getResources();
    const list = Array.isArray(resources) ? resources : (resources?.data || []);
    return okData(res, list, 'resources', list.length);
  } catch (error) {
    const fromKv = await kvStorage.get(KV_KEYS.RESOURCES, null);
    if (fromKv && Array.isArray(fromKv)) {
      return okData(res, fromKv, 'resources', fromKv.length);
    }
    return res.status(404).json({
      success: false,
      error: 'Ressources non disponibles. Lancez la synchronisation depuis Paramètres.',
      file: 'resources'
    });
  }
}, { statusCode: 404, message: 'Ressources non disponibles' });
