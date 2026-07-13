/**
 * Charge le .env racine puis client/.env.local (sans écraser les variables déjà définies).
 * Utilisé par dev.js et build-client.js pour que REACT_APP_* soit disponible au client CRA.
 */
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');

function loadRootEnv() {
  // override: true — le .env local prime sur des variables shell obsolètes (ex. SUPABASE_URL).
  dotenv.config({ path: path.join(root, '.env'), override: true });
  // client/.env.local : ne pas écraser les variables déjà définies par .env racine.
  dotenv.config({ path: path.join(root, 'client', '.env.local') });
}

module.exports = { loadRootEnv, root };
