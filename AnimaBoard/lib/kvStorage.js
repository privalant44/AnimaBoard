/**
 * Utilitaire pour la gestion du stockage avec Redis (Upstash ou Vercel KV) ou cache mémoire
 * Fournit une interface unifiée pour la persistance des données
 * 
 * Priorité :
 * 1. Upstash Redis (recommandé, via intégration Vercel)
 * 2. Vercel KV (déprécié, rétrocompatibilité)
 * 3. Cache mémoire (fallback)
 */

let kv = null;
let kvInitialized = false;

/**
 * Initialise Redis (Upstash ou Vercel KV) si disponible
 * Priorité : Upstash Redis (recommandé) > Vercel KV (déprécié)
 */
function initKV() {
  if (kvInitialized) {
    return kv !== null;
  }

  // Essayer d'abord Upstash Redis (recommandé par Vercel)
  try {
    const { Redis } = require('@upstash/redis');
    // Vérifier que les variables d'environnement sont présentes
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      kv = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      kvInitialized = true;
      return true;
    }
  } catch (error) {
    // Upstash non disponible, continuer
  }

  // Fallback sur @vercel/kv (déprécié mais fonctionne encore)
  // Vérifier que les variables d'environnement sont présentes
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const vercelKv = require('@vercel/kv');
      kv = vercelKv.kv;
      kvInitialized = true;
      return true;
    } catch (error) {
      // Package non installé ou erreur
    }
  }

  kvInitialized = true;
  return false;
}

// Cache mémoire de secours (partagé entre toutes les instances)
const memoryCache = {};

/**
 * Récupère une valeur depuis le stockage
 * @param {string} key - Clé de la valeur
 * @param {*} defaultValue - Valeur par défaut si la clé n'existe pas
 * @returns {Promise<*>} La valeur stockée ou la valeur par défaut
 */
async function get(key, defaultValue = null) {
  initKV();

  if (kv) {
    try {
      // Upstash Redis et Vercel KV ont la même API pour get()
      const value = await kv.get(key);
      return value !== null && value !== undefined ? value : defaultValue;
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération de ${key} depuis Redis:`, error);
      // Fallback sur le cache mémoire
      return memoryCache[key] !== undefined ? memoryCache[key] : defaultValue;
    }
  }

  return memoryCache[key] !== undefined ? memoryCache[key] : defaultValue;
}

/**
 * Sauvegarde une valeur dans le stockage
 * @param {string} key - Clé de la valeur
 * @param {*} value - Valeur à sauvegarder
 * @returns {Promise<void>}
 */
async function set(key, value) {
  initKV();

  if (kv) {
    try {
      // Upstash Redis et Vercel KV ont la même API pour set()
      await kv.set(key, value);
      // Mettre à jour aussi le cache mémoire pour cohérence
      memoryCache[key] = value;
    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde de ${key} dans Redis:`, error);
      // Fallback sur le cache mémoire
      memoryCache[key] = value;
    }
  } else {
    memoryCache[key] = value;
  }
}

/**
 * Supprime une valeur du stockage
 * @param {string} key - Clé de la valeur à supprimer
 * @returns {Promise<void>}
 */
async function del(key) {
  initKV();

  if (kv) {
    try {
      // Upstash Redis et Vercel KV ont la même API pour del()
      await kv.del(key);
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression de ${key} depuis Redis:`, error);
    }
  }

  delete memoryCache[key];
}

/**
 * Vérifie si Redis (Upstash ou Vercel KV) est disponible
 * @returns {boolean}
 */
function isKVAvailable() {
  initKV();
  return kv !== null;
}

module.exports = {
  get,
  set,
  del,
  isKVAvailable
};
