/**
 * Base URL de l'API. En dev, définir REACT_APP_API_URL=http://localhost:3000 dans client/.env.development
 * si le proxy échoue ("connexion refusée"). En prod, laisser vide pour utiliser les URLs relatives.
 */
export const API_BASE = process.env.REACT_APP_API_URL || '';

export function apiUrl(path: string): string {
  return API_BASE + path;
}
