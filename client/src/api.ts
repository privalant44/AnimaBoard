/**
 * Base URL de l'API. En dev, laisser vide : les URLs /api/* passent par le proxy (même hôte que le client).
 * Définir REACT_APP_API_URL=http://127.0.0.1:3000 seulement si le proxy échoue. En prod, vide = URLs relatives.
 */
/** Vide en dev : URLs relatives /api/* → setupProxy.js (127.0.0.1:3000). */
export const API_BASE = process.env.REACT_APP_API_URL || '';

if (
  process.env.NODE_ENV !== 'production' &&
  typeof window !== 'undefined' &&
  /\/\/localhost:3000/i.test(API_BASE)
) {
  console.warn(
    '[api] REACT_APP_API_URL pointe sur localhost:3000 — sur Windows, préférez laisser vide (proxy CRA) ou http://127.0.0.1:3000.'
  );
}

export function apiUrl(path: string): string {
  return API_BASE + path;
}

/** URL affichée dans les messages d'erreur (origine du navigateur + chemin relatif en dev). */
export function describeApiEndpoint(path: string): string {
  const resolved = apiUrl(path);
  if (resolved.startsWith('http')) return resolved;
  if (typeof window !== 'undefined') return `${window.location.origin}${resolved}`;
  return resolved;
}

export function normalizeApiError(err: unknown, endpointHint?: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
    const isDev = process.env.NODE_ENV !== 'production';
    const devHint = isDev
      ? 'En dev local : ouvrez http://localhost:3001 et lancez npm run dev (API Express sur le port 3000). Laissez REACT_APP_API_URL vide pour utiliser le proxy.'
      : 'Vérifiez que le serveur API est démarré et que la route existe (notamment en déploiement Vercel).';
    return [
      'Impossible de joindre l’API (erreur réseau).',
      endpointHint ? `Endpoint: ${endpointHint}.` : '',
      devHint,
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (/JSON\.parse|unexpected character|SyntaxError/i.test(msg)) {
    const isDev = process.env.NODE_ENV !== 'production';
    return isDev
      ? 'Réponse invalide du serveur : l’API n’a pas renvoyé de JSON. Vérifiez les logs du terminal npm run dev.'
      : 'Réponse invalide du serveur : l’API n’a pas renvoyé de JSON (erreur ou timeout Vercel). Vérifiez les logs du déploiement.';
  }
  return msg;
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
