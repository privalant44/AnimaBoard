/**
 * POST /api/auth/local/login — connexion compte administrateur local (Vercel).
 */
const { createVercelHandler } = require('../../../lib/errorHandler');
const { isAuthEnabled } = require('../../../lib/microsoftAuth');
const {
  authenticateLocal,
  signLocalToken,
  isLocalAuthConfigured,
} = require('../../../lib/localAuth');

module.exports = createVercelHandler(
  async (req, res) => {
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

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
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
  },
  { skipAuth: true }
);
