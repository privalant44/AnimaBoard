/**
 * Permissions configurables par rôle (Supabase) — l'admin voit toujours tout.
 */
const { getSupabase } = require('./supabaseClient');
const {
  ROLES,
  ROLE_PERMISSIONS,
  CONFIGURABLE_PERMISSIONS,
  MODULES,
  ALL_PERMISSIONS,
  isValidRole,
  isAdminRole,
  normalizePermissions,
  getRoleLabel,
  shouldRestrictForecastToPersonal,
  TAB_LABELS,
  APP_TABS,
  canAccessTab,
} = require('./roles');

const permissionCache = new Map();
const CACHE_TTL_MS = 30_000;

function clearPermissionCache(role) {
  if (role) permissionCache.delete(role);
  else permissionCache.clear();
}

async function fetchPermissionsFromDb(role) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('app_role_permissions')
    .select('permission')
    .eq('role', role);

  if (error) {
    console.warn('[rolePermissions] Lecture Supabase:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data.map((row) => row.permission);
}

async function getStoredPermissionsForRole(role) {
  if (!isValidRole(role) || isAdminRole(role)) return null;

  const cached = permissionCache.get(role);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.permissions;
  }

  const fromDb = await fetchPermissionsFromDb(role);
  permissionCache.set(role, { permissions: fromDb, at: Date.now() });
  return fromDb;
}

async function getEffectivePermissionsForRole(role) {
  if (!isValidRole(role)) return [];
  if (isAdminRole(role)) return [...ALL_PERMISSIONS];

  const stored = await getStoredPermissionsForRole(role);
  const base = stored && stored.length > 0 ? stored : ROLE_PERMISSIONS[role] || [];
  const normalized = normalizePermissions(base);

  const ops = ROLE_PERMISSIONS[role] || [];
  for (const permission of ops) {
    if (
      permission.startsWith('ops:') ||
      permission.startsWith('data:') ||
      permission === 'users:manage'
    ) {
      if (!normalized.includes(permission)) normalized.push(permission);
    }
  }

  return normalized;
}

async function listRolePermissionMatrix() {
  const matrix = {};
  for (const role of ROLES) {
    if (isAdminRole(role)) {
      matrix[role] = [...ALL_PERMISSIONS];
      continue;
    }
    const stored = await getStoredPermissionsForRole(role);
    const configurable = stored && stored.length > 0 ? stored : ROLE_PERMISSIONS[role] || [];
    matrix[role] = configurable.filter((p) => CONFIGURABLE_PERMISSIONS.includes(p));
  }
  return {
    roles: ROLES,
    modules: MODULES,
    configurablePermissions: CONFIGURABLE_PERMISSIONS,
    matrix,
  };
}

async function updateRolePermissions(role, permissions) {
  if (!isValidRole(role)) {
    throw new Error(`Rôle invalide. Valeurs : ${ROLES.join(', ')}`);
  }
  if (isAdminRole(role)) {
    throw new Error('Les permissions administrateur ne sont pas modifiables');
  }

  const normalized = [...new Set((permissions || []).map((p) => String(p).trim()).filter(Boolean))];
  for (const permission of normalized) {
    if (!CONFIGURABLE_PERMISSIONS.includes(permission)) {
      throw new Error(`Permission non configurable : ${permission}`);
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }

  const { error: deleteError } = await supabase.from('app_role_permissions').delete().eq('role', role);
  if (deleteError) throw new Error(deleteError.message);

  if (normalized.length > 0) {
    const rows = normalized.map((permission) => ({ role, permission }));
    const { error: insertError } = await supabase.from('app_role_permissions').insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  clearPermissionCache(role);
  return getEffectivePermissionsForRole(role);
}

async function buildRolePreview(role) {
  if (!isValidRole(role)) {
    throw new Error(`Rôle invalide. Valeurs : ${ROLES.join(', ')}`);
  }

  const permissions = await getEffectivePermissionsForRole(role);
  const tabs = APP_TABS.map((key) => ({
    key,
    label: TAB_LABELS[key] || key,
    visible: canAccessTab(permissions, key),
  }));

  const modules = MODULES.map((module) => {
    const views = module.permissions.map((entry) => ({
      key: entry.key,
      label: entry.label,
      visible: permissions.includes(entry.key),
    }));
    const visible = module.adminOnly ? isAdminRole(role) : views.some((view) => view.visible);
    return {
      id: module.id,
      label: module.label,
      adminOnly: !!module.adminOnly,
      visible,
      views,
    };
  });

  return {
    role,
    roleLabel: getRoleLabel(role),
    permissions,
    tabs,
    modules,
    restrictForecastToPersonal: shouldRestrictForecastToPersonal(role, permissions),
  };
}

module.exports = {
  clearPermissionCache,
  getEffectivePermissionsForRole,
  listRolePermissionMatrix,
  updateRolePermissions,
  buildRolePreview,
};
