/**
 * Auth routes for Vercel (catch-all, 1 serverless function).
 *
 * GET  /api/auth/me
 * POST /api/auth/local/login
 */
const path = require('path');
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));
const { isAuthEnabled } = require(path.join(__dirname, '..', '..', 'lib', 'microsoftAuth'));
const { getDisplayNameFromAuth } = require(path.join(__dirname, '..', '..', 'lib', 'authUser'));
const { resolveUserAccess } = require(path.join(__dirname, '..', '..', 'lib', 'userRoles'));
const {
  authenticateLocal,
  signLocalToken,
  isLocalAuthConfigured,
} = require(path.join(__dirname, '..', '..', 'lib', 'localAuth'));

function getRoutePath(req) {
  const raw = req.query.path;
  if (Array.isArray(raw)) return raw.filter(Boolean).join('/');
  if (typeof raw === 'string' && raw.trim()) return raw.trim();

  const url = String(req.url || '');
  const match = url.match(/\/api\/auth\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  const route = getRoutePath(req);
  const handler = createVercelHandler(
    async (req, res) => {
      if (route === 'me') {
        if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!isAuthEnabled()) {
          return res.status(200).json({
            success: true,
            authEnabled: false,
            role: null,
            permissions: [],
          });
        }

        const access = req.access || (await resolveUserAccess(req.auth));
        return res.status(200).json({
          success: true,
          authEnabled: true,
          email: access.email,
          displayName: getDisplayNameFromAuth(req.auth),
          authMethod: req.auth.authMethod || 'microsoft',
          role: access.role,
          roleLabel: access.roleLabel,
          permissions: access.permissions,
        });
      }

      if (route === 'local/login') {
        if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!isAuthEnabled()) {
          return res.status(400).json({
            success: false,
            error: 'Authentification désactivée (AUTH_ENABLED)',
          });
        }
        if (!isLocalAuthConfigured()) {
          return res.status(503).json({
            success: false,
            error: 'Connexion locale non configurée',
          });
        }

        const body = readJsonBody(req);
        const { username, password } = body;
        if (!username || !password) {
          return res.status(400).json({
            success: false,
            error: 'Identifiant et mot de passe requis',
          });
        }

        const user = authenticateLocal(username, password);
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Identifiants invalides',
          });
        }

        const token = signLocalToken(user);
        return res.status(200).json({
          success: true,
          token,
          user: {
            displayName: user.displayName,
            email: user.email,
            authMethod: 'local',
          },
        });
      }

      return res.status(404).json({
        success: false,
        error: `Route auth inconnue: ${route || '(vide)'}`,
      });
    },
    { skipAuth: route === 'local/login' }
  );

  return handler(req, res);
};
