/**
 * Settings routes for Vercel (single function + rewrite in vercel.json).
 *
 * GET/POST/DELETE /api/settings/logo — logo entreprise partagé (Supabase Storage)
 */
const { createVercelHandler, enforceAuthAndAuthorize } = require('../lib/errorHandler');
const {
  getCompanyLogo,
  uploadCompanyLogo,
  deleteCompanyLogo,
} = require('../lib/logoService');

function getRoutePath(req) {
  const routeParam = req.query && req.query.route;
  if (routeParam) {
    const r = String(routeParam).replace(/^\/+|\/+$/g, '');
    if (r) return r;
  }
  const url = req.url || '';
  const q = url.indexOf('?');
  const pathOnly = q >= 0 ? url.slice(0, q) : url;
  const parts = pathOnly.split('/').filter(Boolean);
  const settingsIdx = parts.indexOf('settings');
  if (settingsIdx >= 0 && parts[settingsIdx + 1]) {
    return parts.slice(settingsIdx + 1).join('/');
  }
  return '';
}

async function handleGetLogo(req, res) {
  const logo = await getCompanyLogo();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({ success: true, ...logo });
}

async function handlePostLogo(req, res) {
  const dataUrl = req.body?.dataUrl;
  if (!dataUrl) {
    return res.status(400).json({ success: false, error: 'dataUrl requis' });
  }
  const logo = await uploadCompanyLogo(dataUrl);
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, ...logo });
}

async function handleDeleteLogo(req, res) {
  const logo = await deleteCompanyLogo();
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, ...logo });
}

async function handleLogo(req, res) {
  if (req.method === 'GET') return handleGetLogo(req, res);

  const ok = await enforceAuthAndAuthorize(req, res);
  if (!ok) return;

  if (req.method === 'POST') return handlePostLogo(req, res);
  if (req.method === 'DELETE') return handleDeleteLogo(req, res);
  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}

const ROUTES = {
  logo: handleLogo,
};

const handler = createVercelHandler(
  async (req, res) => {
    const route = getRoutePath(req);
    const routeHandler = ROUTES[route];

    if (!routeHandler) {
      return res.status(404).json({
        success: false,
        error: `Route settings inconnue: ${route || '(vide)'}`,
        availableRoutes: Object.keys(ROUTES),
      });
    }

    try {
      return await routeHandler(req, res);
    } catch (err) {
      console.error(`settings/${route || '?'} error:`, err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Erreur logo entreprise',
      });
    }
  },
  { skipAuth: true, statusCode: 500, message: 'Erreur settings' }
);

handler.handleGet = handleGetLogo;
handler.handlePost = handlePostLogo;
handler.handleDelete = handleDeleteLogo;

module.exports = handler;
