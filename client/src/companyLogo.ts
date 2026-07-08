import { apiFetch, apiUrl, parseApiJson } from './api';

export type CompanyLogoResponse = {
  success?: boolean;
  url?: string | null;
  updatedAt?: string | null;
  error?: string;
};

/** Lecture publique (page de connexion incluse). */
export async function fetchCompanyLogo(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('/api/settings/logo'));
    const data = await parseApiJson<CompanyLogoResponse>(res);
    if (res.ok && data.url) return data.url;
  } catch {
    // Logo optionnel — fallback UI par défaut
  }
  return null;
}

export async function uploadCompanyLogo(dataUrl: string): Promise<string | null> {
  const res = await apiFetch('/api/settings/logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const data = await parseApiJson<CompanyLogoResponse>(res);
  if (!res.ok) {
    throw new Error(data.error || `Échec upload logo (${res.status})`);
  }
  return data.url || null;
}

export async function deleteCompanyLogo(): Promise<void> {
  const res = await apiFetch('/api/settings/logo', { method: 'DELETE' });
  const data = await parseApiJson<CompanyLogoResponse>(res);
  if (!res.ok) {
    throw new Error(data.error || `Échec suppression logo (${res.status})`);
  }
}
