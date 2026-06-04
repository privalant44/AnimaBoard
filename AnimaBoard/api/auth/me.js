/**
 * GET /api/auth/me — profil et rôle de l'utilisateur connecté.
 */
const { createVercelHandler } = require('../../lib/errorHandler');
const { isAuthEnabled } = require('../../lib/microsoftAuth');
const { getDisplayNameFromAuth } = require('../../lib/authUser');
const { resolveUserAccess } = require('../../lib/userRoles');

module.exports = createVercelHandler(async (req, res) => {
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
});
