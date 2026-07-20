/**
 * Auth routes for Vercel (single function + rewrites in vercel.json).
 *
 * GET    /api/auth/me
 * POST   /api/auth/local/login
 * GET    /api/auth/users
 * POST   /api/auth/users
 * DELETE /api/auth/users/:email
 */
const path = require('path');
const { createVercelHandler } = require(path.join(__dirname, '..', 'lib', 'errorHandler'));
const { isAuthEnabled } = require(path.join(__dirname, '..', 'lib', 'microsoftAuth'));
const { getDisplayNameFromAuth } = require(path.join(__dirname, '..', 'lib', 'authUser'));
const { ROLES, getRoleLabel } = require(path.join(__dirname, '..', 'lib', 'roles'));
const {
  resolveUserAccess,
  listUserRoles,
  upsertUserRole,
  deleteUserRole,
} = require(path.join(__dirname, '..', 'lib', 'userRoles'));
const {
  listRolePermissionMatrix,
  updateRolePermissions,
  buildRolePreview,
} = require(path.join(__dirname, '..', 'lib', 'rolePermissions'));
const { PERMISSIONS, roleHasPermission } = require(path.join(__dirname, '..', 'lib', 'roles'));
const {
  authenticateLocal,
  signLocalToken,
  isLocalAuthConfigured,
} = require(path.join(__dirname, '..', 'lib', 'localAuth'));

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
  const match = url.match(/\/api\/auth\/([^?]*)/);
  return match ? decodeURIComponent(match[1]).replace(/\/$/, '') : '';
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

      if (route === 'role-permissions' && req.method === 'GET') {
        const access = req.access;
        if (!access || !roleHasPermission(access.role, PERMISSIONS.USERS_MANAGE)) {
          return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
        }
        const payload = await listRolePermissionMatrix();
        return res.status(200).json({ success: true, ...payload });
      }

      const rolePermissionsPreviewMatch = route.match(/^role-permissions\/([^/]+)\/preview$/);
      if (rolePermissionsPreviewMatch && req.method === 'GET') {
        const access = req.access;
        if (!access || !roleHasPermission(access.role, PERMISSIONS.USERS_MANAGE)) {
          return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
        }
        const role = decodeURIComponent(rolePermissionsPreviewMatch[1]).trim().toLowerCase();
        try {
          const preview = await buildRolePreview(role);
          return res.status(200).json({ success: true, ...preview });
        } catch (err) {
          return res.status(400).json({ success: false, error: err.message });
        }
      }

      const rolePermissionsMatch = route.match(/^role-permissions\/([^/]+)$/);
      if (rolePermissionsMatch && req.method === 'PUT') {
        const access = req.access;
        if (!access || !roleHasPermission(access.role, PERMISSIONS.USERS_MANAGE)) {
          return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
        }
        const role = decodeURIComponent(rolePermissionsMatch[1]).trim().toLowerCase();
        const body = readJsonBody(req);
        const effective = await updateRolePermissions(role, body.permissions);
        return res.status(200).json({ success: true, role, permissions: effective });
      }

      if (route === 'users' && req.method === 'GET') {
        const users = await listUserRoles();
        return res.status(200).json({
          success: true,
          users,
          roles: ROLES,
          roleLabels: ROLES.map((r) => ({ id: r, label: getRoleLabel(r) })),
        });
      }

      if (route === 'users' && req.method === 'POST') {
        const body = readJsonBody(req);
        const { email, role, displayName } = body;
        const user = await upsertUserRole({ email, role, displayName });
        return res.status(200).json({ success: true, user });
      }

      const usersDeleteMatch = route.match(/^users\/(.+)$/);
      if (usersDeleteMatch && req.method === 'DELETE') {
        const email = decodeURIComponent(usersDeleteMatch[1]);
        await deleteUserRole(email);
        return res.status(200).json({ success: true });
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
