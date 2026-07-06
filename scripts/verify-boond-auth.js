/**
 * Vérifie que BOOND_EMAIL et le mot de passe (BOOND_PASSWORD ou BOOND_PASSWORD_ENC)
 * permettent bien d'accéder à l'API BoondManager (Basic Auth).
 *
 * Usage: node scripts/verify-boond-auth.js
 *
 * Dépend de .env (et optionnellement BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const axios = require('axios');

const baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';
const email = process.env.BOOND_EMAIL;
const password = process.env.BOOND_PASSWORD;

function main() {
  console.log('Vérification des identifiants BoondManager (Basic Auth)\n');
  console.log('  URL:', baseURL);
  console.log('  Email:', email || '(non configuré)');
  console.log('  Mot de passe:', (password || process.env.BOOND_PASSWORD_ENC) ? '***' : '(non configuré)');
  console.log('');

  if (!email || !password) {
    console.error('Erreur: définissez BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY) dans .env');
    process.exit(1);
  }

  const config = {
    auth: { username: email, password },
    headers: { Accept: 'application/json, application/hal+json' },
    timeout: 10000,
    validateStatus: (s) => s < 500
  };

  axios
    .get(`${baseURL}/resources`, config)
    .then((res) => {
      if (res.status >= 200 && res.status < 300) {
        const total = res.data?.total ?? res.data?.data?.length ?? '?';
        console.log('OK – Connexion réussie. Le mot de passe est correct.');
        console.log('     (Ressources récupérées, total ou count:', total, ')');
        process.exit(0);
      }
      const detail = res.data?.errors?.[0]?.detail || res.data?.message || JSON.stringify(res.data || res.statusText);
      console.error('Erreur:', res.status, detail);
      process.exit(1);
    })
    .catch((err) => {
      const status = err.response?.status;
      const detail = err.response?.data?.errors?.[0]?.detail || err.response?.data?.message || err.message;
      if (status === 401 || status === 403 || status === 422) {
        console.error('Identifiants refusés (', status, '). Vérifiez email et mot de passe.');
        console.error('Détail:', detail);
      } else {
        console.error('Erreur réseau ou API:', detail);
      }
      process.exit(1);
    });
}

main();
