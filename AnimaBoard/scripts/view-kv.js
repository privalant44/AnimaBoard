/**
 * Affiche le contenu du stockage (KV Redis ou cache mémoire) en dev.
 *
 * Usage:
 *   node scripts/view-kv.js        # résumé des clés
 *   node scripts/view-kv.js --full # affiche aussi un extrait des données
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const kvStorage = require('../lib/kvStorage');
const { KV_KEYS } = require('../lib/constants');

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
  console.log('📦 Contenu du stockage (dev)\n');
  console.log('Source:', kvStorage.isKVAvailable() ? 'Redis (Upstash/Vercel KV)' : 'Cache mémoire (pas de Redis configuré)');
  if (kvStorage.isKVAvailable()) {
    if (process.env.UPSTASH_REDIS_REST_URL) console.log('   → Upstash Console: https://console.upstash.com/');
    else console.log('   → Vercel Dashboard: Project → Storage → KV');
  }
  console.log('');

  const keys = Object.entries(KV_KEYS);
  for (const [name, key] of keys) {
    const value = await kvStorage.get(key, null);
    const isEmpty = value === null || value === undefined;
    const summary = summarize(value);
    console.log(`${isEmpty ? '○' : '●'} ${key}`);
    console.log(`    ${isEmpty ? 'vide' : summary}`);
    if (showFull && !isEmpty && typeof value === 'object') {
      const json = JSON.stringify(value, null, 2);
      const preview = json.length > 800 ? json.slice(0, 800) + '\n  ... (tronqué)' : json;
      console.log(preview.split('\n').map(l => '    ' + l).join('\n'));
      console.log('');
    }
  }

  console.log('\n💡 Pour remplir les données : Paramètres → Actualiser les ressources / prestations / timesheets.');
  console.log('   Ou en CLI : npm run sync  puis  node extract_deliveries.js  etc.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
