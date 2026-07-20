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

/** Permissions granulaires (API + onglets UI + vues par module). */
const PERMISSIONS = Object.freeze({
  TAB_HOME: 'tab:home',
  TAB_RESOURCES: 'tab:resources',
  TAB_FORECAST: 'tab:forecast',
  TAB_REPORT: 'tab:report',
  TAB_SETTINGS: 'tab:settings',
  VIEW_HOME_FINANCIAL: 'view:home:financial',
  VIEW_HOME_BESOINS: 'view:home:besoins',
  VIEW_HOME_TREASURY: 'view:home:treasury',
  VIEW_FORECAST_PERSONAL: 'view:forecast:personal',
  VIEW_FORECAST_SCENARIOS: 'view:forecast:scenarios',
  VIEW_REPORT_FORECAST: 'view:report:forecast',
  VIEW_REPORT_INCOME: 'view:report:income',
  OPS_SYNC: 'ops:sync',
  DATA_FINANCE: 'data:finance',
  DATA_TIMESHEETS: 'data:timesheets',
  DATA_WRITE: 'data:write',
  USERS_MANAGE: 'users:manage',
});

/** Permissions configurables dans l'administration (cases à cocher par rôle). */
const CONFIGURABLE_PERMISSIONS = Object.freeze([
  PERMISSIONS.VIEW_HOME_FINANCIAL,
  PERMISSIONS.VIEW_HOME_BESOINS,
  PERMISSIONS.VIEW_HOME_TREASURY,
  PERMISSIONS.TAB_RESOURCES,
  PERMISSIONS.VIEW_FORECAST_PERSONAL,
  PERMISSIONS.VIEW_FORECAST_SCENARIOS,
  PERMISSIONS.VIEW_REPORT_FORECAST,
  PERMISSIONS.VIEW_REPORT_INCOME,
  PERMISSIONS.TAB_SETTINGS,
]);

/** Structure des modules pour l'UI d'administration. */
const MODULES = Object.freeze([
  {
    id: 1,
    label: 'Accueil',
    permissions: [
      { key: PERMISSIONS.VIEW_HOME_FINANCIAL, label: 'Tableau de bord financier' },
      { key: PERMISSIONS.VIEW_HOME_BESOINS, label: 'Tableau de bord besoins' },
      { key: PERMISSIONS.VIEW_HOME_TREASURY, label: 'Plan de trésorerie' },
    ],
  },
  {
    id: 2,
    label: 'Ressources',
    permissions: [{ key: PERMISSIONS.TAB_RESOURCES, label: 'Ressources' }],
  },
  {
    id: 3,
    label: 'Forecast',
    permissions: [
      { key: PERMISSIONS.VIEW_FORECAST_PERSONAL, label: 'Forecast personnel' },
      { key: PERMISSIONS.VIEW_FORECAST_SCENARIOS, label: 'Forecast et scénarios' },
    ],
  },
  {
    id: 4,
    label: 'Rapports',
    permissions: [
      { key: PERMISSIONS.VIEW_REPORT_FORECAST, label: 'Synthèse forecast' },
      { key: PERMISSIONS.VIEW_REPORT_INCOME, label: 'Compte de résultat' },
    ],
  },
  {
    id: 5,
    label: 'Administration',
    adminOnly: true,
    permissions: [{ key: PERMISSIONS.TAB_SETTINGS, label: 'Paramètres et administration' }],
  },
]);

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
  admin: ALL_PERMISSIONS,
  manager: [
    PERMISSIONS.VIEW_HOME_FINANCIAL,
    PERMISSIONS.VIEW_HOME_BESOINS,
    PERMISSIONS.VIEW_HOME_TREASURY,
    PERMISSIONS.TAB_RESOURCES,
    PERMISSIONS.VIEW_FORECAST_PERSONAL,
    PERMISSIONS.VIEW_FORECAST_SCENARIOS,
    PERMISSIONS.VIEW_REPORT_FORECAST,
    PERMISSIONS.VIEW_REPORT_INCOME,
    PERMISSIONS.OPS_SYNC,
    PERMISSIONS.DATA_FINANCE,
    PERMISSIONS.DATA_TIMESHEETS,
    PERMISSIONS.DATA_WRITE,
  ],
  commercial: [
    PERMISSIONS.VIEW_HOME_FINANCIAL,
    PERMISSIONS.VIEW_FORECAST_PERSONAL,
    PERMISSIONS.VIEW_FORECAST_SCENARIOS,
    PERMISSIONS.VIEW_REPORT_FORECAST,
    PERMISSIONS.VIEW_REPORT_INCOME,
    PERMISSIONS.DATA_FINANCE,
    PERMISSIONS.DATA_WRITE,
  ],
  consultation: [PERMISSIONS.VIEW_FORECAST_PERSONAL],
});

const TAB_PERMISSIONS = Object.freeze([
  PERMISSIONS.TAB_HOME,
  PERMISSIONS.TAB_RESOURCES,
  PERMISSIONS.TAB_FORECAST,
  PERMISSIONS.TAB_REPORT,
  PERMISSIONS.TAB_SETTINGS,
]);

function isValidRole(role) {
  return ROLES.includes(role);
}

function expandLegacyTabPermissions(permissions) {
  const expanded = new Set(permissions || []);
  if (expanded.has(PERMISSIONS.TAB_HOME)) {
    expanded.add(PERMISSIONS.VIEW_HOME_FINANCIAL);
    expanded.add(PERMISSIONS.VIEW_HOME_BESOINS);
    expanded.add(PERMISSIONS.VIEW_HOME_TREASURY);
  }
  if (expanded.has(PERMISSIONS.TAB_FORECAST)) {
    expanded.add(PERMISSIONS.VIEW_FORECAST_PERSONAL);
    expanded.add(PERMISSIONS.VIEW_FORECAST_SCENARIOS);
  }
  if (expanded.has(PERMISSIONS.TAB_REPORT)) {
    expanded.add(PERMISSIONS.VIEW_REPORT_FORECAST);
    expanded.add(PERMISSIONS.VIEW_REPORT_INCOME);
  }
  return [...expanded];
}

function deriveTabPermissions(permissions) {
  const set = new Set(permissions || []);
  if (
    set.has(PERMISSIONS.TAB_HOME) ||
    set.has(PERMISSIONS.VIEW_HOME_FINANCIAL) ||
    set.has(PERMISSIONS.VIEW_HOME_BESOINS) ||
    set.has(PERMISSIONS.VIEW_HOME_TREASURY)
  ) {
    set.add(PERMISSIONS.TAB_HOME);
  }
  if (
    set.has(PERMISSIONS.TAB_FORECAST) ||
    set.has(PERMISSIONS.VIEW_FORECAST_PERSONAL) ||
    set.has(PERMISSIONS.VIEW_FORECAST_SCENARIOS)
  ) {
    set.add(PERMISSIONS.TAB_FORECAST);
  }
  if (
    set.has(PERMISSIONS.TAB_REPORT) ||
    set.has(PERMISSIONS.VIEW_REPORT_FORECAST) ||
    set.has(PERMISSIONS.VIEW_REPORT_INCOME)
  ) {
    set.add(PERMISSIONS.TAB_REPORT);
  }
  return [...set];
}

function normalizePermissions(permissions) {
  const expanded = expandLegacyTabPermissions(permissions);
  return deriveTabPermissions(expanded);
}

function getPermissionsForRole(role) {
  if (!isValidRole(role)) return [];
  if (role === 'admin') return [...ALL_PERMISSIONS];
  return normalizePermissions(ROLE_PERMISSIONS[role] || []);
}

function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

function roleHasAnyPermission(role, permissions) {
  if (!permissions || permissions.length === 0) return true;
  const effective = getPermissionsForRole(role);
  return permissions.some((p) => effective.includes(p));
}

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function isAdminRole(role) {
  return role === 'admin';
}

function shouldRestrictForecastToPersonal(role, permissions) {
  if (role === 'consultation') return true;
  const perms = permissions || [];
  const hasPersonal = perms.includes(PERMISSIONS.VIEW_FORECAST_PERSONAL);
  const hasScenarios = perms.includes(PERMISSIONS.VIEW_FORECAST_SCENARIOS);
  const hasFullTab = perms.includes(PERMISSIONS.TAB_FORECAST);
  return hasPersonal && !hasScenarios && !hasFullTab;
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  CONFIGURABLE_PERMISSIONS,
  MODULES,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  TAB_PERMISSIONS,
  isValidRole,
  expandLegacyTabPermissions,
  deriveTabPermissions,
  normalizePermissions,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAnyPermission,
  getRoleLabel,
  isAdminRole,
  shouldRestrictForecastToPersonal,
};
