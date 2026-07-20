import type { AppRole } from './roles';

const STORAGE_KEY = 'anima_role_simulation_v1';

export function getStoredSimulatedRole(): AppRole | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: AppRole };
    return parsed.role || null;
  } catch {
    return null;
  }
}

export function setStoredSimulatedRole(role: AppRole | null): void {
  if (!role) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ role }));
}
