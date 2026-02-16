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
    if (process.env.BOOND_EMAIL && process.env.BOOND_PASSWORD_ENC && process.env.ANIMA_SECRET_KEY && !process.env.BOOND_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: 'Déchiffrement du mot de passe échoué',
        errorDetail: 'BOOND_PASSWORD_ENC et ANIMA_SECRET_KEY sont définis mais le déchiffrement n\'a pas produit de mot de passe. Vérifiez que ANIMA_SECRET_KEY est exactement la même que celle utilisée pour chiffrer (node scripts/encrypt-env.js), et que BOOND_PASSWORD_ENC ne contient pas d\'espaces ou de retours à la ligne en trop (copier-coller la valeur sans modifier).'
      });
    }
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
    let message = err.message || 'Erreur lors de la synchronisation des ressources';
    let detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : undefined;
    if (/BOOND_EMAIL|BOOND_PASSWORD|requis/.test(message)) {
      detail = (detail ? detail + ' — ' : '') + 'Sur Vercel : ajoutez BOOND_EMAIL et BOOND_PASSWORD dans Settings → Environment Variables, puis redéployez.';
    }
    return res.status(500).json({
      success: false,
      error: message,
      errorDetail: detail || message
    });
  }
};
