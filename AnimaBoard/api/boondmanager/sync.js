/**
 * Boond sync routes for Vercel (single function + rewrite in vercel.json).
 *
 * POST /api/boondmanager/sync/resources
 * POST /api/boondmanager/sync/deliveries
 */
const path = require('path');
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));

function loadSecretEnv() {
  try {
    require(path.join(__dirname, '..', '..', 'lib', 'secretEnv.js'));
  } catch (e) {
    console.warn('secretEnv load (optional):', e.message);
  }
}

function getRoutePath(req) {
  const fromQuery = req.query.route;
  if (Array.isArray(fromQuery)) return fromQuery.filter(Boolean).join('/');
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return decodeURIComponent(fromQuery.trim()).replace(/\/$/, '');
  }

  const raw = req.query.path;
  if (Array.isArray(raw)) return raw.filter(Boolean).join('/');
  if (typeof raw === 'string' && raw.trim()) return raw.trim();

  const url = String(req.url || '');
  const match = url.match(/\/api\/boondmanager\/sync\/([^?]*)/);
  return match ? decodeURIComponent(match[1]).replace(/\/$/, '') : '';
}

async function handleResourcesSync(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  loadSecretEnv();
  if (
    process.env.BOOND_EMAIL &&
    process.env.BOOND_PASSWORD_ENC &&
    process.env.ANIMA_SECRET_KEY &&
    !process.env.BOOND_PASSWORD
  ) {
    return res.status(500).json({
      success: false,
      error: 'Déchiffrement du mot de passe échoué',
      errorDetail:
        "BOOND_PASSWORD_ENC et ANIMA_SECRET_KEY sont définis mais le déchiffrement n'a pas produit de mot de passe.",
    });
  }

  const BoondManagerSync = require(path.join(__dirname, '..', '..', 'sync.js'));
  const sync = new BoondManagerSync();
  const result = await sync.syncResources();
  const count = Array.isArray(result) ? result.length : 0;
  return res.status(200).json({
    success: true,
    message: `Synchronisation réussie: ${count} ressources synchronisées`,
    count,
  });
}

async function handleDeliveriesSync(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const extractDeliveries = require(path.join(__dirname, '..', '..', 'extract_deliveries'));
  const result = await extractDeliveries();
  const count = result?.data?.length || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Extraction réussie: ${count} prestations extraites`,
    count,
    metadata: result?.metadata,
  });
}

module.exports = createVercelHandler(async (req, res) => {
  const route = getRoutePath(req);

  try {
    if (route === 'resources') {
      return await handleResourcesSync(req, res);
    }
    if (route === 'deliveries') {
      return await handleDeliveriesSync(req, res);
    }
    return res.status(404).json({
      success: false,
      error: `Route sync Boond inconnue: ${route || '(vide)'}`,
    });
  } catch (err) {
    if (route === 'resources') {
      console.error('sync/resources error:', err);
      let message = err.message || 'Erreur lors de la synchronisation des ressources';
      let detail = err.response?.data
        ? JSON.stringify(err.response.data).slice(0, 500)
        : undefined;
      if (/BOOND_EMAIL|BOOND_PASSWORD|requis/.test(message)) {
        detail =
          (detail ? `${detail} — ` : '') +
          'Sur Vercel : ajoutez BOOND_EMAIL et BOOND_PASSWORD dans Environment Variables.';
      }
      return res.status(500).json({
        success: false,
        error: message,
        errorDetail: detail || message,
      });
    }
    throw err;
  }
}, { statusCode: 500, message: 'Erreur sync Boond' });
