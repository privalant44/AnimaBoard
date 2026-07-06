/**
 * Rôles applicatifs AnimaBoard et matrice de permissions.
 */
const ROLES = Object.freeze(['admin', 'manager', 'commercial', 'consultation']);

const ROLE_LABELS = Object.freeze({
  admin: 'Administrateur',
  manager: 'Manager',
  commercial: 'Commercial',
  consultation: 'Consultation',
});

/** Permissions granulaires (API + onglets UI). */
const PERMISSIONS = Object.freeze({
  TAB_HOME: 'tab:home',
  TAB_RESOURCES: 'tab:resources',
  TAB_FORECAST: 'tab:forecast',
  TAB_REPORT: 'tab:report',
  TAB_SETTINGS: 'tab:settings',
  OPS_SYNC: 'ops:sync',
  DATA_FINANCE: 'data:finance',
  DATA_TIMESHEETS: 'data:timesheets',
  DATA_WRITE: 'data:write',
  USERS_MANAGE: 'users:manage',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
  admin: ALL_PERMISSIONS,
  manager: [
    PERMISSIONS.TAB_HOME,
    PERMISSIONS.TAB_RESOURCES,
    PERMISSIONS.TAB_FORECAST,
    PERMISSIONS.TAB_REPORT,
    PERMISSIONS.OPS_SYNC,
    PERMISSIONS.DATA_FINANCE,
    PERMISSIONS.DATA_TIMESHEETS,
    PERMISSIONS.DATA_WRITE,
  ],
  commercial: [
    PERMISSIONS.TAB_HOME,
    PERMISSIONS.TAB_FORECAST,
    PERMISSIONS.TAB_REPORT,
    PERMISSIONS.DATA_FINANCE,
    PERMISSIONS.DATA_WRITE,
  ],
  consultation: [
    PERMISSIONS.TAB_HOME,
    PERMISSIONS.TAB_RESOURCES,
    PERMISSIONS.TAB_FORECAST,
  ],
});

function isValidRole(role) {
  return ROLES.includes(role);
}

function getPermissionsForRole(role) {
  if (!isValidRole(role)) return [];
  return ROLE_PERMISSIONS[role] || [];
}

function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

function roleHasAnyPermission(role, permissions) {
  if (!permissions || permissions.length === 0) return true;
  return permissions.some((p) => roleHasPermission(role, p));
}

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  isValidRole,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAnyPermission,
  getRoleLabel,
};
