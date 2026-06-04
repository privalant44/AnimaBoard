/**
 * Résolution du rôle utilisateur (e-mail → rôle) via Supabase, variables d'env ou compte local.
 */
const { getSupabase } = require('./supabaseClient');
const { ROLES, isValidRole, getPermissionsForRole, getRoleLabel } = require('./roles');
const { getUserEmailFromAuth } = require('./authUser');

const DEFAULT_ROLE = 'consultation';
const LOCAL_ADMIN_ROLE = 'admin';

/** Cache mémoire court (évite une requête Supabase par appel API). */
const roleCache = new Map();
const CACHE_TTL_MS = 60_000;

function parseRoleOverrides() {
  const raw = (process.env.AUTH_ROLE_OVERRIDES || '').trim();
  if (!raw) return new Map();
  const map = new Map();
  for (const part of raw.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    const email = piece.slice(0, eq).trim().toLowerCase();
    const role = piece.slice(eq + 1).trim().toLowerCase();
    if (email && isValidRole(role)) map.set(email, role);
  }
  return map;
}

function getDefaultRole() {
  const fromEnv = (process.env.AUTH_DEFAULT_ROLE || '').trim().toLowerCase();
  if (isValidRole(fromEnv)) return fromEnv;
  return DEFAULT_ROLE;
}

function isLocalAdminAuth(authPayload) {
  return authPayload?.authMethod === 'local' || authPayload?.sub === 'local-admin';
}

async function fetchRoleFromSupabase(email) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('app_user_roles')
    .select('role')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.warn('[userRoles] Lecture Supabase:', error.message);
    return null;
  }
  const role = data?.role;
  return isValidRole(role) ? role : null;
}

/**
 * @param {object} authPayload — JWT Microsoft ou local (req.auth)
 * @returns {Promise<{ email: string, role: string, permissions: string[], roleLabel: string }>}
 */
async function resolveUserAccess(authPayload) {
  const email = getUserEmailFromAuth(authPayload);
  if (!email) {
    throw new Error('Compte sans adresse e-mail');
  }

  if (isLocalAdminAuth(authPayload)) {
    return buildAccess(email, LOCAL_ADMIN_ROLE);
  }

  const overrides = parseRoleOverrides();
  if (overrides.has(email)) {
    return buildAccess(email, overrides.get(email));
  }

  const cached = roleCache.get(email);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return buildAccess(email, cached.role);
  }

  const fromDb = await fetchRoleFromSupabase(email);
  const role = fromDb || getDefaultRole();
  roleCache.set(email, { role, at: Date.now() });
  return buildAccess(email, role);
}

function buildAccess(email, role) {
  const permissions = getPermissionsForRole(role);
  return {
    email,
    role,
    permissions,
    roleLabel: getRoleLabel(role),
  };
}

function clearRoleCache(email) {
  if (email) roleCache.delete(String(email).toLowerCase());
  else roleCache.clear();
}

async function listUserRoles() {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('app_user_roles')
    .select('email, role, display_name, updated_at')
    .order('email');

  if (error) throw new Error(error.message);
  return data || [];
}

async function upsertUserRole({ email, role, displayName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('E-mail invalide');
  }
  if (!isValidRole(role)) {
    throw new Error(`Rôle invalide. Valeurs : ${ROLES.join(', ')}`);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }

  const row = {
    email: normalizedEmail,
    role,
    display_name: displayName ? String(displayName).trim() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('app_user_roles')
    .upsert(row, { onConflict: 'email' })
    .select('email, role, display_name, updated_at')
    .single();

  if (error) throw new Error(error.message);
  clearRoleCache(normalizedEmail);
  return data;
}

async function deleteUserRole(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré');

  const { error } = await supabase.from('app_user_roles').delete().eq('email', normalizedEmail);
  if (error) throw new Error(error.message);
  clearRoleCache(normalizedEmail);
}

module.exports = {
  ROLES,
  DEFAULT_ROLE,
  LOCAL_ADMIN_ROLE,
  getDefaultRole,
  resolveUserAccess,
  clearRoleCache,
  listUserRoles,
  upsertUserRole,
  deleteUserRole,
};
