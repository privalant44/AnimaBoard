/** Aligné sur lib/roles.js côté serveur. */
export const ROLES = ['admin', 'manager', 'commercial', 'consultation'] as const;
export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  commercial: 'Commercial',
  consultation: 'Consultation',
};

export const PERMISSIONS = {
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
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type ViewPermission =
  | typeof PERMISSIONS.VIEW_HOME_FINANCIAL
  | typeof PERMISSIONS.VIEW_HOME_BESOINS
  | typeof PERMISSIONS.VIEW_HOME_TREASURY
  | typeof PERMISSIONS.VIEW_FORECAST_PERSONAL
  | typeof PERMISSIONS.VIEW_FORECAST_SCENARIOS
  | typeof PERMISSIONS.VIEW_REPORT_FORECAST
  | typeof PERMISSIONS.VIEW_REPORT_INCOME;

export type AppTab = 'home' | 'resources' | 'forecast' | 'report' | 'settings';

export type ModuleDefinition = {
  id: number;
  label: string;
  adminOnly?: boolean;
  permissions: Array<{ key: Permission; label: string }>;
};

export const MODULES: ModuleDefinition[] = [
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
];

const TAB_PERMISSION: Record<AppTab, Permission> = {
  home: PERMISSIONS.TAB_HOME,
  resources: PERMISSIONS.TAB_RESOURCES,
  forecast: PERMISSIONS.TAB_FORECAST,
  report: PERMISSIONS.TAB_REPORT,
  settings: PERMISSIONS.TAB_SETTINGS,
};

export function hasPermission(permissions: string[], permission: Permission): boolean {
  return permissions.includes(permission);
}

export function canAccessView(permissions: string[], view: ViewPermission): boolean {
  return permissions.includes(view);
}

export function canAccessTab(permissions: string[], tab: AppTab): boolean {
  if (tab === 'home') {
    return (
      permissions.includes(PERMISSIONS.TAB_HOME) ||
      permissions.includes(PERMISSIONS.VIEW_HOME_FINANCIAL) ||
      permissions.includes(PERMISSIONS.VIEW_HOME_BESOINS) ||
      permissions.includes(PERMISSIONS.VIEW_HOME_TREASURY)
    );
  }
  if (tab === 'forecast') {
    return (
      permissions.includes(PERMISSIONS.TAB_FORECAST) ||
      permissions.includes(PERMISSIONS.VIEW_FORECAST_PERSONAL) ||
      permissions.includes(PERMISSIONS.VIEW_FORECAST_SCENARIOS)
    );
  }
  if (tab === 'report') {
    return (
      permissions.includes(PERMISSIONS.TAB_REPORT) ||
      permissions.includes(PERMISSIONS.VIEW_REPORT_FORECAST) ||
      permissions.includes(PERMISSIONS.VIEW_REPORT_INCOME)
    );
  }
  return permissions.includes(TAB_PERMISSION[tab]);
}

export function shouldRestrictForecastToPersonal(role: AppRole | null, permissions: string[]): boolean {
  if (role === 'consultation') return true;
  const hasPersonal = permissions.includes(PERMISSIONS.VIEW_FORECAST_PERSONAL);
  const hasScenarios = permissions.includes(PERMISSIONS.VIEW_FORECAST_SCENARIOS);
  const hasFullTab = permissions.includes(PERMISSIONS.TAB_FORECAST);
  return hasPersonal && !hasScenarios && !hasFullTab;
}

export function getResourceEmail(resource: { raw?: Record<string, unknown>; email?: string }): string | null {
  const raw = resource.raw || {};
  const candidates = [
    resource.email,
    raw.email,
    raw.Email,
    (raw.attributes as Record<string, unknown> | undefined)?.email,
    (raw.contact as Record<string, unknown> | undefined)?.email,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.includes('@')) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

export function filterResourcesByUserEmail<T extends { raw?: Record<string, unknown>; email?: string }>(
  resources: T[],
  userEmail: string
): T[] {
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized.includes('@')) return [];
  return resources.filter((resource) => getResourceEmail(resource) === normalized);
}
