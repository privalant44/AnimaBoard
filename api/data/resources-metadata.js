/**
 * GET/POST /api/data/resources-metadata - Métadonnées ressources (Supabase)
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { createVercelHandler } = require('../../lib/errorHandler');

async function handleGet(req, res) {
  const data = await kvStorage.get(KV_KEYS.RESOURCES_METADATA, {});
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, data: data || {} });
}

async function handlePost(req, res) {
  await kvStorage.set(KV_KEYS.RESOURCES_METADATA, req.body || {});
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, message: 'Métadonnées sauvegardées avec succès' });
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}, { statusCode: 500, message: 'Erreur resources-metadata' });
