/**
 * Lance la synchronisation des feuilles de temps sur 2 ans (année n-1 et n).
 * Période : janvier (année-1) à décembre (année courante).
 *
 * Usage : node scripts/sync-timesheets-2years.js
 *    ou : npm run sync-timesheets-2years
 *
 * En dev sans Redis : les données sont stockées en mémoire et perdues à la sortie
 * du script. Pour voir les temps consommés dans Forecast, lancez la synchro
 * depuis l'app (Paramètres > Timesheets) ou configurez Redis (UPSTASH_*).
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
    if (!kvStorage.isKVAvailable()) {
      console.log('⚠️  En dev sans Redis : les données viennent d\'être écrites en mémoire et seront perdues à la fin de ce script.');
      console.log('   Pour afficher les temps consommés dans la vue Forecast, lancez la synchro depuis l\'app : Paramètres > bouton "Timesheets".\n');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  });
