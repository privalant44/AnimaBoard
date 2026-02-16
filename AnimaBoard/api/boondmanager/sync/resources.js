/**
 * POST /api/boondmanager/sync/resources - Synchronisation des ressources vers KV
 */
const { createVercelHandler } = require('../../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const BoondManagerSync = require('../../../sync');
  const sync = new BoondManagerSync();
  const result = await sync.syncResources();
  const count = Array.isArray(result) ? result.length : 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} ressources synchronisées`,
    count
  });
}, { statusCode: 500, message: 'Erreur lors de la synchronisation des ressources' });
