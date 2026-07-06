/**
 * Validation des jetons Microsoft Entra ID (Azure AD) pour l'API AnimaBoard.
 */
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { verifyLocalToken, isLocalJwt } = require('./localAuth');
const { getHttpsAgent } = require('./tlsConfig');

let jwks = null;

function isAuthEnabled() {
  const v = (process.env.AUTH_ENABLED || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function getTenantId() {
  return (process.env.AZURE_TENANT_ID || process.env.REACT_APP_AZURE_TENANT_ID || '').trim();
}

function getClientId() {
  return (process.env.AZURE_CLIENT_ID || process.env.REACT_APP_AZURE_CLIENT_ID || '').trim();
}

function getJwks() {
  const tenant = getTenantId() || 'common';
  if (!jwks) {
    const options = {
      jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 600000,
      rateLimit: true,
    };
    const agent = getHttpsAgent();
    if (agent) options.requestAgent = agent;
    jwks = jwksClient(options);
  }
  return jwks;
}

function getValidAudiences() {
  const clientId = getClientId();
  if (!clientId) return [];
  return [clientId, `api://${clientId}`, `api://${clientId}/access_as_user`];
}

function audienceMatchesClient(aud, clientId) {
  if (!clientId || aud == null) return false;
  const allowed = getValidAudiences();
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((value) => allowed.includes(String(value)));
}

function getValidIssuers() {
  const tenant = getTenantId();
  if (!tenant) return undefined;
  return [
    `https://login.microsoftonline.com/${tenant}/v2.0`,
    `https://sts.windows.net/${tenant}/`,
  ];
}

function getAllowedEmailDomains() {
  const raw = process.env.AUTH_ALLOWED_EMAIL_DOMAINS || '';
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function extractBearer(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

function getUserEmail(payload) {
  return String(
    payload.preferred_username || payload.email || payload.upn || ''
  ).toLowerCase();
}

function assertAllowedUser(payload) {
  const domains = getAllowedEmailDomains();
  if (domains.length === 0) return;

  const email = getUserEmail(payload);
  if (!email || !email.includes('@')) {
    throw new Error('Compte Microsoft sans adresse e-mail utilisable');
  }
  const domain = email.split('@')[1];
  if (!domains.includes(domain)) {
    throw new Error(`Domaine non autorisé (${domain})`);
  }
}

async function verifyMicrosoftToken(token) {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('AZURE_CLIENT_ID manquant côté serveur');
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) {
    throw new Error('Jeton JWT invalide');
  }

  const key = await getJwks().getSigningKey(decoded.header.kid);
  const signingKey = key.getPublicKey();

  const verifyOptions = {
    algorithms: ['RS256'],
    issuer: getValidIssuers(),
    clockTolerance: 30,
  };

  let payload;
  try {
    payload = jwt.verify(token, signingKey, {
      ...verifyOptions,
      audience: getValidAudiences(),
    });
  } catch (audErr) {
    const decodedPayload = jwt.decode(token);
    if (decodedPayload && audienceMatchesClient(decodedPayload.aud, clientId)) {
      payload = jwt.verify(token, signingKey, verifyOptions);
    } else {
      throw audErr;
    }
  }

  assertAllowedUser(payload);
  return payload;
}

function isPublicApiPath(pathname) {
  const path = String(pathname || '');
  if (path === '/api/health') return true;
  if (path === '/api/env-check') return true;
  if (path === '/api/auth/local/login') return true;
  if (path.startsWith('/api/cron/')) return true;
  return false;
}

/**
 * @returns {{ ok: true, user: object } | { ok: false, status: number, body: object }}
 */
async function enforceAuth(req, res) {
  if (!isAuthEnabled()) {
    return { ok: true, user: null };
  }

  const urlPath = (req.url || '').split('?')[0];
  if (isPublicApiPath(urlPath)) {
    return { ok: true, user: null };
  }

  const token = extractBearer(req);
  if (!token) {
    const body = { success: false, error: 'Authentification requise' };
    res.status(401).json(body);
    return { ok: false, status: 401, body };
  }

  try {
    if (isLocalJwt(token)) {
      const user = verifyLocalToken(token);
      return { ok: true, user };
    }
    const user = await verifyMicrosoftToken(token);
    return { ok: true, user };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] Validation jeton Microsoft:', err.message);
    }
    const msg = String(err.message || '');
    let error = 'Jeton invalide ou expiré';
    if (msg.includes('Domaine non autorisé')) error = msg;
    else if (msg.includes('certificate') || msg.includes('UNABLE_TO_VERIFY')) {
      error =
        'Connexion Microsoft impossible (certificat TLS). En dev : DEV_INSECURE_TLS=1 dans .env ; en entreprise : NODE_EXTRA_CA_CERTS.';
    } else if (msg.includes('audience')) error = 'Jeton Microsoft non reconnu (audience API). Vérifiez « Exposer une API » dans Azure.';
    const body = {
      success: false,
      error,
      errorDetail: msg,
    };
    res.status(401).json(body);
    return { ok: false, status: 401, body };
  }
}

module.exports = {
  isAuthEnabled,
  getClientId,
  getTenantId,
  extractBearer,
  verifyMicrosoftToken,
  enforceAuth,
  isPublicApiPath,
};
