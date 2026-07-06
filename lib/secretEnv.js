/**
 * Déchiffrement optionnel du mot de passe Boond (BOOND_PASSWORD_ENC).
 * Si BOOND_PASSWORD_ENC et ANIMA_SECRET_KEY sont définis, on déchiffre
 * et on expose BOOND_PASSWORD pour le reste de l'app.
 * Ne pas commiter .env ni ANIMA_SECRET_KEY.
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const raw = process.env.ANIMA_SECRET_KEY;
  if (!raw || raw.length < 8) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function decrypt(encBase64) {
  const key = getKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(encBase64, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const cipher = buf.subarray(IV_LEN + TAG_LEN);
    const dec = crypto.createDecipheriv(ALGO, key, iv);
    dec.setAuthTag(tag);
    return dec.update(cipher) + dec.final('utf8');
  } catch (e) {
    return null;
  }
}

function init() {
  try {
    require('./tlsConfig').initTls();
  } catch (_) {
    // tlsConfig optionnel
  }

  const key = getKey();
  if (!key) return;

  if (process.env.BOOND_PASSWORD_ENC && !process.env.BOOND_PASSWORD) {
    const enc = (process.env.BOOND_PASSWORD_ENC || '').trim().replace(/\s/g, '');
    const v = decrypt(enc);
    if (v) process.env.BOOND_PASSWORD = v;
  }
}

init();

module.exports = { decrypt, hasSecretKey: () => !!getKey() };
