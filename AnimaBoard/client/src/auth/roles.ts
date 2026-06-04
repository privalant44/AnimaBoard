/** Aligné sur lib/roles.js côté serveur. */
export const ROLES = ['admin', 'manager', 'commercial', 'consultation'] as const;
export type AppRole = (typeof ROLES)[number];

export const PERMISSIONS = {
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
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type AppTab = 'home' | 'resources' | 'forecast' | 'report' | 'settings';

const TAB_PERMISSION: Record<AppTab, Permission> = {
  home: PERMISSIONS.TAB_HOME,
  resources: PERMISSIONS.TAB_RESOURCES,
  forecast: PERMISSIONS.TAB_FORECAST,
  report: PERMISSIONS.TAB_REPORT,
  settings: PERMISSIONS.TAB_SETTINGS,
};

export function canAccessTab(permissions: string[], tab: AppTab): boolean {
  const required = TAB_PERMISSION[tab];
  return permissions.includes(required);
}

export function hasPermission(permissions: string[], permission: Permission): boolean {
  return permissions.includes(permission);
}
