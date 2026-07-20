import type { AppRole } from './roles';
import { ROLES } from './roles';

export const SIMULATE_ROLE_QUERY_PARAM = 'simulateRole';

export const ROLE_SIMULATION_TITLE_PREFIX = 'Simutation du rôle ';

export function isValidSimulatedRole(value: string | null): value is AppRole {
  return value !== null && (ROLES as readonly string[]).includes(value);
}

export function getSimulatedRoleFromUrl(location: Location = window.location): AppRole | null {
  const params = new URLSearchParams(location.search);
  const role = params.get(SIMULATE_ROLE_QUERY_PARAM);
  return isValidSimulatedRole(role) ? role : null;
}

export function buildRoleSimulationWindowUrl(
  role: AppRole,
  origin: string = window.location.origin,
  pathname: string = window.location.pathname
): string {
  const url = new URL(`${origin}${pathname}`);
  url.searchParams.set(SIMULATE_ROLE_QUERY_PARAM, role);
  return url.toString();
}

export function isRoleSimulationWindow(location: Location = window.location): boolean {
  return getSimulatedRoleFromUrl(location) !== null;
}

export function buildRoleSimulationTitle(roleLabel: string): string {
  return `${ROLE_SIMULATION_TITLE_PREFIX}${roleLabel}`;
}
