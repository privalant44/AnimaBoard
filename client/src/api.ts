/**
 * Base URL de l'API. En dev, laisser vide : les URLs /api/* passent par le proxy (même hôte que le client).
 * Définir REACT_APP_API_URL=http://127.0.0.1:3000 seulement si le proxy échoue. En prod, vide = URLs relatives.
 */
const explicitApiBase = process.env.REACT_APP_API_URL || '';

function getDevFallbackBase(): string {
  if (process.env.NODE_ENV === 'production') return '';
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  // En dev local, le client tourne sur 3001 et l'API sur 3000.
  if (isLocalHost && window.location.port === '3001') {
    return 'http://localhost:3000';
  }
  return '';
}

export const API_BASE = explicitApiBase || getDevFallbackBase();

export function apiUrl(path: string): string {
  return API_BASE + path;
}

type TokenGetter = () => Promise<string | null>;

let authTokenGetter: TokenGetter = async () => null;

/** Enregistré par AuthProvider lorsque l’auth Microsoft est active. */
export function setAuthTokenGetter(getter: TokenGetter): void {
  authTokenGetter = getter;
}

/** fetch vers l’API avec jeton Bearer Microsoft si disponible. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = await authTokenGetter();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(apiUrl(path), { ...init, headers });
}

/** Parse une réponse API en JSON avec message clair si le serveur renvoie du HTML (timeout Vercel, etc.). */
export async function parseApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const isHtml = (res.headers.get('content-type') || '').includes('text/html');
    const hint = isHtml ? ' — timeout ou route API absente (Vercel)' : '';
    throw new Error(`Réponse invalide du serveur (${res.status})${hint}. Vérifiez les logs du déploiement.`);
  }
}
