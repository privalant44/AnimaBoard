/**
 * Utilitaire pour la gestion du stockage applicatif.
 *
 * Toutes les données métier (resources, deliveries, timesheets, etc.) sont
 * stockées dans les tables Supabase via `lib/db.js`.
 *
 * Un petit cache mémoire est gardé en secours, mais aucune donnée n'est
 * plus écrite dans une table clé/valeur générique.
 */

const db = require('./db');

// Cache mémoire de secours (partagé entre toutes les instances)
const memoryCache = {};

async function get(key, defaultValue = null) {
  if (db.isTableKey(key)) {
    const value = await db.getTable(key, defaultValue);
    if (value !== undefined && value !== null) {
      memoryCache[key] = value;
      return value;
    }
    return defaultValue;
  }

  return memoryCache[key] !== undefined ? memoryCache[key] : defaultValue;
}

async function set(key, value) {
  if (db.isTableKey(key)) {
    await db.setTable(key, value);
  }
  memoryCache[key] = value;
}

async function del(key) {
  delete memoryCache[key];

  if (db.isTableKey(key)) {
    await db.delTable(key);
  }
}

function isKVAvailable() {
  return true;
}

module.exports = {
  get,
  set,
  del,
  isKVAvailable
};

