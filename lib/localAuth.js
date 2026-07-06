/**
 * Authentification locale (compte administrateur) + JWT HS256 pour l'API.
 * Hash mot de passe : scrypt (Node crypto), salt fixe documenté dans env.example.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SCRYPT_SALT = Buffer.from('anima-board-local-admin-v1', 'utf8');
const DEFAULT_USERNAME = 'administrateur';
/** Hash scrypt (base64) du mot de passe dev par défaut — ne pas committer de mot de passe en clair. */
const DEV_DEFAULT_PASSWORD_HASH =
  'tyB2mi129FbXRxKk++CinZP3kd7AzWurJm26azblWY54Mp2TyABjA6muZT8NyaYsP5wGkOZaUlOtLu8u5NhnbA==';

const LOCAL_JWT_ISSUER = 'anima-board-local';
const LOCAL_JWT_AUDIENCE = 'anima-board-api';

function getLocalAdminUsername() {
  return (process.env.LOCAL_ADMIN_USERNAME || DEFAULT_USERNAME).trim();
}

function getPasswordHashB64() {
  const fromEnv = (process.env.LOCAL_ADMIN_PASSWORD_HASH || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return DEV_DEFAULT_PASSWORD_HASH;
  return '';
}

function hashPassword(password) {
  return crypto.scryptSync(String(password), SCRYPT_SALT, 64).toString('base64');
}

function verifyPassword(password) {
  const expected = getPasswordHashB64();
  if (!expected) return false;
  const actual = hashPassword(password);
  try {
    const a = Buffer.from(actual, 'base64');
    const b = Buffer.from(expected, 'base64');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getJwtSecret() {
  const secret = (process.env.LOCAL_AUTH_JWT_SECRET || process.env.JWT_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') {
    return 'anima-board-dev-local-auth-secret-change-in-production';
  }
  return '';
}

function isLocalAuthConfigured() {
  return Boolean(getPasswordHashB64() && getJwtSecret());
}

function authenticateLocal(username, password) {
  const expectedUser = getLocalAdminUsername();
  const given = String(username || '').trim();
  if (given.toLowerCase() !== expectedUser.toLowerCase()) return null;
  if (!verifyPassword(password)) return null;
  const displayName = expectedUser;
  const email = (process.env.LOCAL_ADMIN_EMAIL || '').trim() || 'admin@local';
  return { displayName, email };
}

function signLocalToken(user) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('LOCAL_AUTH_JWT_SECRET manquant côté serveur');
  }
  return jwt.sign(
    {
      sub: 'local-admin',
      name: user.displayName,
      preferred_username: user.email,
      email: user.email,
      authMethod: 'local',
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: process.env.LOCAL_AUTH_JWT_EXPIRES || '8h',
      issuer: LOCAL_JWT_ISSUER,
      audience: LOCAL_JWT_AUDIENCE,
    }
  );
}

function verifyLocalToken(token) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('LOCAL_AUTH_JWT_SECRET manquant côté serveur');
  }
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: LOCAL_JWT_ISSUER,
    audience: LOCAL_JWT_AUDIENCE,
  });
}

function isLocalJwt(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header) return false;
  if (decoded.header.kid) return false;
  return decoded.header.alg === 'HS256';
}

module.exports = {
  getLocalAdminUsername,
  getPasswordHashB64,
  hashPassword,
  verifyPassword,
  authenticateLocal,
  signLocalToken,
  verifyLocalToken,
  isLocalAuthConfigured,
  isLocalJwt,
  SCRYPT_SALT,
};
