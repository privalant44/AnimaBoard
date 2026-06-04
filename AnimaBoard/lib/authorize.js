/**
 * Contrôle d'accès par rôle sur les routes API (après authentification JWT).
 */
const { isAuthEnabled } = require('./microsoftAuth');
const { PERMISSIONS, roleHasAnyPermission } = require('./roles');
const { resolveUserAccess } = require('./userRoles');

/**
 * Permissions requises pour une route API (null = tout utilisateur authentifié).
 * @returns {string[] | null}
 */
function getRequiredPermissions(method, pathname) {
  const path = String(pathname || '');
  const m = (method || 'GET').toUpperCase();

  if (path === '/api/auth/me' || path.startsWith('/api/auth/me')) return null;
  if (path.startsWith('/api/auth/users')) return [PERMISSIONS.USERS_MANAGE];

  if (path.startsWith('/api/pennylane')) return [PERMISSIONS.DATA_FINANCE];
  if (path.includes('income-statement')) return [PERMISSIONS.DATA_FINANCE];

  if (
    path.includes('timesheets') ||
    path.includes('absence-monthly') ||
    path.includes('temps_missions')
  ) {
    return [PERMISSIONS.DATA_TIMESHEETS];
  }

  if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
    if (path.includes('/sync') || path === '/api/timesheets-reset' || path.includes('timesheets-reset')) {
      return [PERMISSIONS.OPS_SYNC];
    }
    if (path.includes('/api/init-dictionary')) return [PERMISSIONS.OPS_SYNC];
    if (path.includes('/api/data/forecast-times')) return [PERMISSIONS.DATA_WRITE];
    if (path.includes('/api/data/resources-metadata')) return [PERMISSIONS.DATA_WRITE];
    if (path.includes('/api/dashboard/income-statement')) return [PERMISSIONS.OPS_SYNC];
  }

  return null;
}

/**
 * Enrichit req.auth avec role, permissions, roleLabel.
 */
async function attachUserAccess(req) {
  if (!isAuthEnabled() || !req.auth) {
    req.access = null;
    return;
  }
  const access = await resolveUserAccess(req.auth);
  req.access = access;
  req.auth.role = access.role;
  req.auth.permissions = access.permissions;
}

/**
 * Middleware Express : vérifie les permissions de la route.
 */
function authorizeMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  const path = req.path || req.url?.split('?')[0] || '';
  if (!path.startsWith('/api')) return next();

  const required = getRequiredPermissions(req.method, path);
  if (!required) return next();

  const role = req.access?.role || req.auth?.role;
  if (!role) {
    return res.status(403).json({
      success: false,
      error: 'Accès refusé',
      errorDetail: 'Profil utilisateur non résolu',
    });
  }

  if (!roleHasAnyPermission(role, required)) {
    return res.status(403).json({
      success: false,
      error: 'Accès refusé',
      errorDetail: `Permission requise : ${required.join(' ou ')}`,
      role,
    });
  }

  return next();
}

module.exports = {
  getRequiredPermissions,
  attachUserAccess,
  authorizeMiddleware,
};
