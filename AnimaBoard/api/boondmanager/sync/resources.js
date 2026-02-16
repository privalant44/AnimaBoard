/**
 * POST /api/boondmanager/sync/resources - Synchronisation des ressources vers KV
 * Sur Vercel : charger secretEnv pour déchiffrer BOOND_PASSWORD_ENC avant d'utiliser sync.
 */
const path = require('path');

function loadSecretEnv() {
  try {
    const secretEnvPath = path.join(__dirname, '..', '..', '..', 'lib', 'secretEnv.js');
    require(secretEnvPath);
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
    const syncPath = path.join(__dirname, '..', '..', '..', 'sync.js');
    const BoondManagerSync = require(syncPath);
    const sync = new BoondManagerSync();
    const result = await sync.syncResources();
    const count = Array.isArray(result) ? result.length : 0;
    return res.status(200).json({
      success: true,
      message: `Synchronisation réussie: ${count} ressources synchronisées`,
      count
    });
  } catch (err) {
    console.error('sync/resources error:', err);
    const message = err.message || 'Erreur lors de la synchronisation des ressources';
    const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : undefined;
    return res.status(500).json({
      success: false,
      error: message,
      errorDetail: detail || message
    });
  }
};
