/**
 * TLS pour les appels HTTPS Node (axios, jwks-rsa → Microsoft, BoondManager, Pennylane, etc.).
 *
 * Erreur typique derrière un proxy d’entreprise (inspection SSL) :
 *   UNABLE_TO_VERIFY_LEAF_SIGNATURE / unable to verify the first certificate
 *
 * Préféré (prod + dev) : exporter le certificat racine du proxy et définir
 *   NODE_EXTRA_CA_CERTS=C:\chemin\vers\corporate-root.pem
 *
 * Contournement dev uniquement : DEV_INSECURE_TLS=1 (jamais en production).
 */
const https = require('https');

let warnedInsecure = false;
let axiosPatched = false;

function isDevInsecureTlsEnabled() {
  return (
    process.env.DEV_INSECURE_TLS === '1' &&
    process.env.NODE_ENV !== 'production'
  );
}

function getHttpsAgent() {
  if (!isDevInsecureTlsEnabled()) return undefined;

  if (!warnedInsecure) {
    warnedInsecure = true;
    console.warn(
      '⚠️  DEV_INSECURE_TLS=1 : validation des certificats HTTPS désactivée (axios, dev uniquement).'
    );
    console.warn(
      '   En entreprise, préférez NODE_EXTRA_CA_CERTS avec le certificat racine du proxy.'
    );
  }

  return new https.Agent({ rejectUnauthorized: false });
}

/** Applique httpsAgent sur l’instance axios passée (idempotent). */
function patchAxios(axios) {
  if (!axios || axiosPatched) return;
  const agent = getHttpsAgent();
  if (!agent) return;
  axios.defaults.httpsAgent = agent;
  axiosPatched = true;
}

/** Fusionne httpsAgent dans une config axios ponctuelle. */
function applyToAxiosConfig(config = {}) {
  const agent = getHttpsAgent();
  if (!agent) return config;
  return { ...config, httpsAgent: agent };
}

function initTls() {
  try {
    const path = require('path');
    const projectRoot = path.join(__dirname, '..');
    const axios = require(require.resolve('axios', { paths: [projectRoot] }));
    patchAxios(axios);
  } catch (_) {
    // axios absent (scripts sans dépendance HTTP)
  }
}

module.exports = {
  getHttpsAgent,
  patchAxios,
  applyToAxiosConfig,
  initTls,
};
