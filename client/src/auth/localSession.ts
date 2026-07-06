const STORAGE_KEY = 'anima_local_auth_v1';

export type LocalSession = {
  token: string;
  displayName: string;
  email: string;
};

export function getLocalSession(): LocalSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSession;
    if (!parsed?.token || !parsed.displayName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setLocalSession(session: LocalSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearLocalSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
