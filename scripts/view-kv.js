/**
 * Affiche un résumé des données métier en base (Supabase via kvStorage / lib/db.js).
 *
 * Usage:
 *   node scripts/view-kv.js        # résumé des clés
 *   node scripts/view-kv.js --full # affiche aussi un extrait des données
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const kvStorage = require('../lib/kvStorage');
const { KV_KEYS } = require('../lib/constants');
const { getSupabase } = require('../lib/supabaseClient');

const showFull = process.argv.includes('--full');

function summarize(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return `[${value.length} éléments]`;
  if (typeof value === 'object') {
    if (value.data && Array.isArray(value.data)) return `{ data: ${value.data.length} éléments }`;
    if (value.data && typeof value.data === 'object' && !Array.isArray(value.data)) return `{ data: ${Object.keys(value.data).length} clés }`;
    return `{ ${Object.keys(value).length} clés }`;
  }
  return String(value).slice(0, 50);
}

async function main() {
  const supabase = getSupabase();
  console.log('📦 Contenu du stockage métier\n');
  console.log('Source:', supabase ? 'Supabase (service_role)' : '❌ Supabase non configuré (cache mémoire uniquement)');
  if (!supabase) {
    console.log('   → Définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env\n');
  } else {
    console.log('');
  }

  const keys = Object.entries(KV_KEYS);
  for (const [name, key] of keys) {
    const value = await kvStorage.get(key, null);
    const isEmpty = value === null || value === undefined;
    const summary = summarize(value);
    console.log(`${name} (${key}): ${isEmpty ? 'vide' : summary}`);
    if (showFull && !isEmpty) {
      const preview = JSON.stringify(value, null, 2);
      console.log(preview.length > 2000 ? `${preview.slice(0, 2000)}…` : preview);
      console.log('');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
