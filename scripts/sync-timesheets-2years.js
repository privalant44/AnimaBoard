/**
 * Lance la synchronisation des feuilles de temps sur 2 ans (année n-1 et n).
 * Période : janvier (année-1) à décembre (année courante).
 *
 * Usage : node scripts/sync-timesheets-2years.js
 *    ou : npm run sync-timesheets-2years
 *
 * Nécessite Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) pour persister les données.
 */
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const syncTimesheets = require(path.join(projectRoot, 'sync_timesheets'));
const kvStorage = require(path.join(projectRoot, 'lib', 'kvStorage'));

const currentYear = new Date().getFullYear();
const startMonth = `${currentYear - 1}-01`;
const endMonth = `${currentYear}-12`;

console.log(`\n📅 Période 2 ans : ${startMonth} → ${endMonth}\n`);

syncTimesheets(startMonth, endMonth)
  .then((result) => {
    const count = result?.data?.length ?? 0;
    const totalEntries = result?.metadata?.totalEntries ?? 0;
    console.log('\n✅ Synchronisation terminée avec succès !');
    console.log(`   ${count} feuilles de temps, ${totalEntries} entrées.\n`);
    const { getSupabase } = require('../lib/supabaseClient');
    if (!getSupabase()) {
      console.log('⚠️  Supabase non configuré : les données ne sont pas persistées en base.\n');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  });
