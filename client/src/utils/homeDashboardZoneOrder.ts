export type HomeDashboardZoneId = 'financial' | 'besoins' | 'treasury';

export const DEFAULT_HOME_DASHBOARD_ZONE_ORDER: HomeDashboardZoneId[] = [
  'financial',
  'besoins',
  'treasury',
];

const STORAGE_KEY = 'home_dashboard_zone_order';

const VALID_ZONE_IDS = new Set<HomeDashboardZoneId>(DEFAULT_HOME_DASHBOARD_ZONE_ORDER);

function isZoneId(value: unknown): value is HomeDashboardZoneId {
  return typeof value === 'string' && VALID_ZONE_IDS.has(value as HomeDashboardZoneId);
}

export function loadHomeDashboardZoneOrder(): HomeDashboardZoneId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_HOME_DASHBOARD_ZONE_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_HOME_DASHBOARD_ZONE_ORDER];
    const filtered = parsed.filter(isZoneId);
    if (filtered.length === 0) return [...DEFAULT_HOME_DASHBOARD_ZONE_ORDER];
    return normalizeHomeDashboardZoneOrder(filtered, DEFAULT_HOME_DASHBOARD_ZONE_ORDER);
  } catch {
    return [...DEFAULT_HOME_DASHBOARD_ZONE_ORDER];
  }
}

export function saveHomeDashboardZoneOrder(order: HomeDashboardZoneId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Ignore quota / private mode errors
  }
}

export function normalizeHomeDashboardZoneOrder(
  order: HomeDashboardZoneId[],
  visible: HomeDashboardZoneId[]
): HomeDashboardZoneId[] {
  const visibleSet = new Set(visible);
  const normalized: HomeDashboardZoneId[] = [];

  for (const zoneId of order) {
    if (visibleSet.has(zoneId) && !normalized.includes(zoneId)) {
      normalized.push(zoneId);
    }
  }

  for (const zoneId of DEFAULT_HOME_DASHBOARD_ZONE_ORDER) {
    if (visibleSet.has(zoneId) && !normalized.includes(zoneId)) {
      normalized.push(zoneId);
    }
  }

  return normalized;
}

export function moveHomeDashboardZone(
  order: HomeDashboardZoneId[],
  zoneId: HomeDashboardZoneId,
  direction: 'earlier' | 'later'
): HomeDashboardZoneId[] {
  const index = order.indexOf(zoneId);
  if (index === -1) return order;

  const targetIndex = direction === 'earlier' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) return order;

  const next = [...order];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function zoneTestId(zoneId: HomeDashboardZoneId): string {
  return `home-zone-${zoneId}`;
}
