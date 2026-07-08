/**
 * GET/POST/DELETE /api/settings/logo — logo entreprise partagé (Supabase Storage)
 */
const { createVercelHandler, enforceAuthAndAuthorize } = require('../../lib/errorHandler');
const {
  getCompanyLogo,
  uploadCompanyLogo,
  deleteCompanyLogo,
} = require('../../lib/logoService');

async function handleGet(req, res) {
  const logo = await getCompanyLogo();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({ success: true, ...logo });
}

async function handlePost(req, res) {
  const dataUrl = req.body?.dataUrl;
  if (!dataUrl) {
    return res.status(400).json({ success: false, error: 'dataUrl requis' });
  }
  const logo = await uploadCompanyLogo(dataUrl);
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, ...logo });
}

async function handleDelete(req, res) {
  const logo = await deleteCompanyLogo();
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, ...logo });
}

const handler = createVercelHandler(
  async (req, res) => {
    if (req.method === 'GET') return handleGet(req, res);

    const ok = await enforceAuthAndAuthorize(req, res);
    if (!ok) return;

    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  },
  { skipAuth: true, statusCode: 500, message: 'Erreur logo entreprise' }
);

handler.handleGet = handleGet;
handler.handlePost = handlePost;
handler.handleDelete = handleDelete;

module.exports = handler;
