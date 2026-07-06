/**
 * Script d'initialisation de la base de production
 * Exécute toutes les synchronisations nécessaires :
 * 1. Ressources
 * 2. Prestations (deliveries)
 * 3. Projets
 * 4. Feuilles de temps (2 ans)
 * 5. Dictionnaire
 * 6. Jours fériés France (10 ans, table french_public_holiday)
 * 
 * Usage: 
 * Configurer les variables d'environnement de production puis exécuter :
 * node scripts/init-production.js
 */

const path = require('path');
require('dotenv').config();
require(path.join(__dirname, '..', 'lib', 'secretEnv'));

const { getSupabase } = require(path.join(__dirname, '..', 'lib', 'supabaseClient'));
const boondManagerService = require(path.join(__dirname, '..', 'server', 'services', 'boondManagerService'));
const kvStorage = require(path.join(__dirname, '..', 'lib', 'kvStorage'));
const { KV_KEYS } = require(path.join(__dirname, '..', 'lib', 'constants'));

async function initProduction() {
  console.log('🚀 Initialisation de la base de production\n');
  console.log('='.repeat(80));
  
  // Vérifier la connexion Supabase
  const supabase = getSupabase();
  if (!supabase) {
    console.error('❌ Supabase non configuré. Vérifiez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  console.log('✅ Connexion Supabase OK\n');

  // 1. Synchroniser les ressources (format attendu par lib/db.js : nom, prenom, typeOf, …)
  console.log('='.repeat(80));
  console.log('📋 ÉTAPE 1: Synchronisation des ressources');
  console.log('='.repeat(80));
  try {
    const resources = await boondManagerService.getResources();
    const rawList = Array.isArray(resources) ? resources : (resources?.data || []);
    const resourcesList = rawList.map((r) => ({
      id: r.id,
      nom: r.nom || r.lastName || r.LastName || '',
      prenom: r.prenom || r.firstName || r.FirstName || '',
      typeOf: r.typeOf ?? r.type ?? null,
      state: r.state ?? null,
      isVisible: r.isVisible ?? r.attributes?.isVisible ?? true,
      contracts: r.contracts || [],
      raw: r.raw || {}
    }));
    console.log(`📊 ${resourcesList.length} ressources à enregistrer`);
    await kvStorage.set(KV_KEYS.RESOURCES, resourcesList);
    console.log('✅ Ressources sauvegardées\n');
  } catch (error) {
    console.error('❌ Erreur ressources:', error.message);
  }

  // 2. Synchroniser les prestations
  console.log('='.repeat(80));
  console.log('📋 ÉTAPE 2: Synchronisation des prestations');
  console.log('='.repeat(80));
  try {
    const extractDeliveries = require(path.join(__dirname, '..', 'extract_deliveries'));
    await extractDeliveries();
    console.log('✅ Prestations sauvegardées\n');
  } catch (error) {
    console.error('❌ Erreur prestations:', error.message);
  }

  // 3. Synchroniser les feuilles de temps (2 ans)
  console.log('='.repeat(80));
  console.log('📋 ÉTAPE 3: Synchronisation des feuilles de temps (2 ans)');
  console.log('='.repeat(80));
  try {
    const syncTimesheets = require(path.join(__dirname, '..', 'sync_timesheets'));
    const currentYear = new Date().getFullYear();
    const startMonth = `${currentYear - 1}-01`;
    const endMonth = `${currentYear}-12`;
    console.log(`📅 Période: ${startMonth} à ${endMonth}`);
    
    await syncTimesheets(startMonth, endMonth);
    console.log('✅ Feuilles de temps sauvegardées\n');
  } catch (error) {
    console.error('❌ Erreur feuilles de temps:', error.message);
  }

  // 4. Initialiser le dictionnaire
  console.log('='.repeat(80));
  console.log('📋 ÉTAPE 4: Initialisation du dictionnaire');
  console.log('='.repeat(80));
  try {
    const dictionary = await boondManagerService.getDictionary();
    if (!dictionary || !dictionary.data) {
      throw new Error('Dictionnaire non disponible');
    }

    const entries = [];
    const fullDict = dictionary.data?.data || dictionary.data;

    // Types de ressources
    const typeOfList = fullDict?.setting?.typeOf?.resource || [];
    typeOfList.forEach((item) => {
      if (item.id !== undefined && item.value) {
        entries.push({
          table_name: 'resources',
          column_name: 'type_of',
          code: String(item.id),
          label: item.value
        });
      }
    });
    console.log(`📊 ${typeOfList.length} types trouvés`);

    // États de ressources
    const resourceStates = fullDict?.setting?.state?.resource || [];
    resourceStates.forEach((item) => {
      if (item.id !== undefined && item.value) {
        entries.push({
          table_name: 'resources',
          column_name: 'state',
          code: String(item.id),
          label: item.value
        });
      }
    });
    console.log(`📊 ${resourceStates.length} statuts trouvés`);

    // Insérer dans la table dictionnaire
    if (entries.length > 0) {
      const { error } = await supabase
        .from('dictionnaire')
        .upsert(entries, { onConflict: 'table_name,column_name,code' });
      if (error) throw error;
    }
    console.log(`✅ ${entries.length} entrées dictionnaire sauvegardées\n`);
  } catch (error) {
    console.error('❌ Erreur dictionnaire:', error.message);
  }

  // 5. Jours fériés France (table french_public_holiday)
  console.log('='.repeat(80));
  console.log('📋 ÉTAPE 5: Jours fériés France (10 ans)');
  console.log('='.repeat(80));
  try {
    const { seedFrenchHolidays } = require(path.join(__dirname, 'seed-french-holidays'));
    const y0 = new Date().getFullYear();
    await seedFrenchHolidays(y0, 10);
    console.log('✅ Jours fériés à jour\n');
  } catch (error) {
    console.error('❌ Erreur jours fériés:', error.message);
  }

  // Résumé
  console.log('='.repeat(80));
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(80));
  
  // Compter les enregistrements
  const { count: resourcesCount } = await supabase.from('resources').select('*', { count: 'exact', head: true });
  const { count: deliveriesCount } = await supabase.from('deliveries').select('*', { count: 'exact', head: true });
  const { count: projectsCount } = await supabase.from('projects').select('*', { count: 'exact', head: true });
  const { count: timesheetsCount } = await supabase.from('timesheets_detail').select('*', { count: 'exact', head: true });
  const { count: dictCount } = await supabase.from('dictionnaire').select('*', { count: 'exact', head: true });
  const { count: holidaysCount } = await supabase.from('french_public_holiday').select('*', { count: 'exact', head: true });

  console.log(`   - Ressources: ${resourcesCount || 0}`);
  console.log(`   - Prestations: ${deliveriesCount || 0}`);
  console.log(`   - Projets: ${projectsCount || 0}`);
  console.log(`   - Feuilles de temps (détail): ${timesheetsCount || 0}`);
  console.log(`   - Dictionnaire: ${dictCount || 0}`);
  console.log(`   - Jours fériés (lignes): ${holidaysCount || 0}`);
  
  console.log('\n✅ Initialisation terminée !');
}

// Exécuter
initProduction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error.message);
    process.exit(1);
  });
