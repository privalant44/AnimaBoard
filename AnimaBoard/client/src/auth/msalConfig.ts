import { Configuration, PopupRequest } from '@azure/msal-browser';

export function isAuthEnabled(): boolean {
  const v = (process.env.REACT_APP_AUTH_ENABLED || '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

export function getAzureClientId(): string {
  return (process.env.REACT_APP_AZURE_CLIENT_ID || '').trim();
}

export function getAzureTenantId(): string {
  return (process.env.REACT_APP_AZURE_TENANT_ID || '').trim();
}

export function getApiScope(): string {
  const clientId = getAzureClientId();
  return `api://${clientId}/access_as_user`;
}

export function buildMsalConfig(): Configuration | null {
  const clientId = getAzureClientId();
  const tenantId = getAzureTenantId();
  if (!clientId || !tenantId) return null;

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
      postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };
}

export function buildLoginRequest(): PopupRequest {
  const scope = getApiScope();
  return {
    scopes: [scope, 'openid', 'profile', 'email'],
  };
}

export function buildTokenRequest(): PopupRequest {
  return buildLoginRequest();
}

/** Choisit le jeton à envoyer à notre API (id_token SPA en priorité, puis access token API). */
export function pickMicrosoftApiToken(result: {
  accessToken?: string | null;
  idToken?: string | null;
}): string | null {
  const id = result.idToken?.trim();
  if (id) return id;

  const clientId = getAzureClientId();
  const access = result.accessToken?.trim();
  if (access && clientId) {
    try {
      const payload = JSON.parse(
        atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      ) as { aud?: string | string[] };
      const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
      if (
        aud === clientId ||
        aud === `api://${clientId}` ||
        String(aud || '').startsWith(`api://${clientId}`)
      ) {
        return access;
      }
    } catch {
      return access;
    }
  }
  return access || null;
}
