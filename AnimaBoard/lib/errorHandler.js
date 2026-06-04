/**
 * Gestionnaire d'erreur standardisé pour les API routes
 */
const { enforceAuth, isAuthEnabled } = require('./microsoftAuth');
const { attachUserAccess, getRequiredPermissions } = require('./authorize');
const { roleHasAnyPermission } = require('./roles');

/**
 * Crée une réponse d'erreur standardisée
 * @param {Error} error - L'erreur à formater
 * @param {Object} options - Options supplémentaires
 * @returns {Object} Réponse d'erreur formatée
 */
function formatError(error, options = {}) {
  const {
    statusCode = 500,
    message = null,
    includeStack = process.env.NODE_ENV === 'development',
    includeDetails = process.env.NODE_ENV === 'development'
  } = options;

  const response = {
    success: false,
    error: message || error.message || 'Une erreur est survenue',
    // Toujours inclure la cause réelle pour diagnostic (ex. sur Vercel)
    ...(message && error.message && message !== error.message && { errorDetail: error.message }),
    ...(includeDetails && error.response && {
      details: {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      }
    }),
    ...(includeStack && error.stack && { stack: error.stack })
  };

  return { statusCode, response };
}

/**
 * Middleware de gestion d'erreur pour les routes API
 * @param {Function} handler - Fonction async à exécuter
 * @param {Object} options - Options de gestion d'erreur
 * @returns {Function} Middleware Express
 */
function asyncHandler(handler, options = {}) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      const { statusCode, response } = formatError(error, options);
      
      console.error(`❌ Erreur dans ${req.method} ${req.path}:`, error);
      
      res.status(statusCode).json(response);
    }
  };
}

/**
 * Crée un handler pour les routes serverless Vercel
 * @param {Function} handler - Fonction async à exécuter
 * @param {Object} options - Options de gestion d'erreur
 * @returns {Function} Handler Vercel
 */
function getEffectiveApiPath(req) {
  const pathOnly = (req.url || '').split('?')[0];
  const route = req.query?.route;
  if (route) {
    const sub = Array.isArray(route) ? route.filter(Boolean).join('/') : String(route);
    const normalized = sub.replace(/,/g, '/').replace(/^\//, '');
    if (normalized) {
      if (pathOnly === '/api/dashboard' || pathOnly.endsWith('/api/dashboard')) {
        return `/api/dashboard/${normalized}`;
      }
      if (pathOnly === '/api/auth' || pathOnly.endsWith('/api/auth')) {
        return `/api/auth/${normalized}`;
      }
      if (pathOnly.includes('/api/boondmanager/sync')) {
        return `/api/boondmanager/sync/${normalized}`;
      }
    }
  }
  return pathOnly;
}

async function enforceAuthAndAuthorize(req, res) {
  const authResult = await enforceAuth(req, res);
  if (!authResult.ok) return false;
  if (authResult.user) req.auth = authResult.user;
  if (isAuthEnabled() && req.auth) {
    await attachUserAccess(req);
    const path = getEffectiveApiPath(req);
    const required = getRequiredPermissions(req.method, path);
    if (required) {
      const role = req.access?.role;
      if (!role || !roleHasAnyPermission(role, required)) {
        res.status(403).json({
          success: false,
          error: 'Accès refusé',
          errorDetail: required.length ? `Permission requise : ${required.join(' ou ')}` : undefined,
          role: role || null,
        });
        return false;
      }
    }
  }
  return true;
}

function createVercelHandler(handler, options = {}) {
  return async (req, res) => {
    try {
      if (!options.skipAuth) {
        const ok = await enforceAuthAndAuthorize(req, res);
        if (!ok) return;
      }
      await handler(req, res);
    } catch (error) {
      const { statusCode, response } = formatError(error, options);
      
      console.error(`❌ Erreur dans ${req.method} ${req.path}:`, error);
      
      res.status(statusCode).json(response);
    }
  };
}

module.exports = {
  formatError,
  asyncHandler,
  createVercelHandler
};
