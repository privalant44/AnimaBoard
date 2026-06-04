const { enforceAuth, isAuthEnabled } = require('./microsoftAuth');
const { attachUserAccess, authorizeMiddleware } = require('./authorize');

/**
 * Middleware Express : JWT puis rôle/permissions puis contrôle route.
 */
function requireAuthMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  const path = req.path || req.url?.split('?')[0] || '';
  if (!path.startsWith('/api')) return next();

  enforceAuth(req, res)
    .then(async (result) => {
      if (!result.ok) return;
      if (result.user) req.auth = result.user;
      await attachUserAccess(req);
      authorizeMiddleware(req, res, next);
    })
    .catch((err) => {
      console.error('[requireAuth]', err);
      res.status(500).json({ success: false, error: 'Erreur authentification' });
    });
}

module.exports = {
  requireAuthMiddleware,
};
