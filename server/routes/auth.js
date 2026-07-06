const express = require('express');
const { isAuthEnabled, enforceAuth } = require('../../lib/microsoftAuth');
const { attachUserAccess } = require('../../lib/authorize');
const { PERMISSIONS, roleHasPermission, ROLES, getRoleLabel } = require('../../lib/roles');
const { getDisplayNameFromAuth } = require('../../lib/authUser');
const { resolveUserAccess, listUserRoles, upsertUserRole, deleteUserRole } = require('../../lib/userRoles');
const {
  authenticateLocal,
  signLocalToken,
  isLocalAuthConfigured,
} = require('../../lib/localAuth');

const router = express.Router();

async function withAuth(req, res, next) {
  if (!isAuthEnabled()) return next();
  const result = await enforceAuth(req, res);
  if (!result.ok) return;
  if (result.user) req.auth = result.user;
  try {
    await attachUserAccess(req);
  } catch (err) {
    return res.status(403).json({ success: false, error: err.message });
  }
  return next();
}

function requireAccess(req, res) {
  if (!req.access) {
    res.status(403).json({ success: false, error: 'Profil utilisateur non disponible' });
    return null;
  }
  return req.access;
}

router.get('/me', withAuth, async (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({
      success: true,
      authEnabled: false,
      role: null,
      permissions: [],
    });
  }
  if (!req.auth) {
    return res.status(401).json({ success: false, error: 'Authentification requise' });
  }
  try {
    const access = req.access || (await resolveUserAccess(req.auth));
    return res.json({
      success: true,
      authEnabled: true,
      email: access.email,
      displayName: getDisplayNameFromAuth(req.auth),
      authMethod: req.auth.authMethod || 'microsoft',
      role: access.role,
      roleLabel: access.roleLabel,
      permissions: access.permissions,
    });
  } catch (err) {
    return res.status(403).json({ success: false, error: err.message });
  }
});

router.get('/users', withAuth, async (req, res) => {
  const access = requireAccess(req, res);
  if (!access) return;
  if (!roleHasPermission(access.role, PERMISSIONS.USERS_MANAGE)) {
    return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
  }
  try {
    const users = await listUserRoles();
    return res.json({ success: true, users, roles: ROLES, roleLabels: ROLES.map((r) => ({ id: r, label: getRoleLabel(r) })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/users', withAuth, async (req, res) => {
  const access = requireAccess(req, res);
  if (!access) return;
  if (!roleHasPermission(access.role, PERMISSIONS.USERS_MANAGE)) {
    return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
  }
  const { email, role, displayName } = req.body || {};
  try {
    const user = await upsertUserRole({ email, role, displayName });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/users/:email', withAuth, async (req, res) => {
  const access = requireAccess(req, res);
  if (!access) return;
  if (!roleHasPermission(access.role, PERMISSIONS.USERS_MANAGE)) {
    return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
  }
  try {
    await deleteUserRole(req.params.email);
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/local/login', async (req, res) => {
  if (!isAuthEnabled()) {
    return res.status(400).json({
      success: false,
      error: 'Authentification désactivée (AUTH_ENABLED)',
    });
  }
  if (!isLocalAuthConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Connexion locale non configurée (LOCAL_ADMIN_PASSWORD_HASH / LOCAL_AUTH_JWT_SECRET)',
    });
  }

  const { username, password } = req.body || {};
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

  try {
    const token = signLocalToken(user);
    const access = await resolveUserAccess({
      preferred_username: user.email,
      email: user.email,
      authMethod: 'local',
      sub: 'local-admin',
    });
    return res.json({
      success: true,
      token,
      user: {
        displayName: user.displayName,
        email: user.email,
        authMethod: 'local',
        role: access.role,
        roleLabel: access.roleLabel,
        permissions: access.permissions,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Erreur lors de la création du jeton',
    });
  }
});

module.exports = router;
