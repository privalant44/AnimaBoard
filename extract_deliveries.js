require('dotenv').config();
require('./lib/secretEnv');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS, DELIVERIES_START_ID, DELIVERIES_END_ID } = require('./lib/constants');
const {
  DEFAULT_BASE_URL,
  getBoondAuthConfig,
  fetchDelivery,
} = require('./lib/deliveryBoond');

let email = process.env.BOOND_EMAIL;
let password = process.env.BOOND_PASSWORD;

console.log('🚀 Extraction des prestations via /api/deliveries/{id} (JSON)\n');
console.log('='.repeat(80));
if (!email || !password) {
  console.error('❌ Erreur: BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
  process.exit(1);
}
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

async function extractDeliveries() {
  const config = getBoondAuthConfig(email, password);
  const baseURL = DEFAULT_BASE_URL;

  const allDeliveries = [];
  const projectsMap = {};
  const startId = DELIVERIES_START_ID || 1;
  const endId = DELIVERIES_END_ID || 500;
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  console.log(`📡 Début de la récupération des prestations (IDs ${startId} à ${endId})...\n`);

  for (let id = startId; id <= endId; id++) {
    try {
      const result = await fetchDelivery(config, baseURL, id);

      if (result.status === 404) {
        notFoundCount++;
      } else if (result.delivery) {
        allDeliveries.push(result.delivery);
        successCount++;
        if (result.project && !projectsMap[result.project.id]) {
          projectsMap[result.project.id] = result.project;
        }

        if (successCount % 50 === 0) {
          console.log(`   ✅ ${successCount} prestations récupérées (ID ${id})...`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      errorCount++;
      if (errorCount <= 5) {
        console.error(`   ❌ Erreur pour ID ${id}: ${error.response?.status || error.message}`);
      }
    }
  }

  console.log(`\n📊 Récupération terminée !`);
  console.log(`   - Prestations trouvées: ${successCount}`);
  console.log(`   - IDs non trouvés (404): ${notFoundCount}`);
  console.log(`   - Erreurs: ${errorCount}`);
  console.log(`   - Total dans le tableau: ${allDeliveries.length}`);

  const outputData = {
    metadata: {
      extractedAt: new Date().toISOString(),
      method: 'GET',
      baseURL: `${baseURL}/deliveries/{id}`,
      idRange: `${startId}-${endId}`,
      successCount,
      notFoundCount,
      errorCount,
      totalRecords: allDeliveries.length,
    },
    data: allDeliveries,
  };

  try {
    console.log(`\n💾 Sauvegarde en KV...`);

    await kvStorage.set(KV_KEYS.DELIVERIES, outputData);
    console.log(`✅ Données prestations sauvegardées.`);

    const projectsList = Object.values(projectsMap);
    if (projectsList.length > 0) {
      const projectsForSave = projectsList.map((p) => ({
        id: p.id,
        project: p.raw || p,
        deliveries: [],
        creationDate: p.creationDate,
        updateDate: p.updateDate,
        reference: p.reference,
        name: p.name,
        state: p.state,
        startDate: p.startDate,
        endDate: p.endDate,
        clientName: p.clientName,
      }));
      await kvStorage.set(KV_KEYS.PROJECTS, projectsForSave);
      console.log(`✅ ${projectsList.length} projets sauvegardés.`);
    }

    console.log(`\n📊 Statistiques:`);
    console.log(`   - Total prestations: ${allDeliveries.length}`);
    console.log(`   - Total projets: ${projectsList.length}`);
    console.log(`   - Taille du fichier JSON: ${(JSON.stringify(outputData).length / 1024).toFixed(2)} KB`);

    if (allDeliveries.length > 0) {
      console.log(`\n📋 Aperçu du premier enregistrement:`);
      const firstRecord = allDeliveries[0];
      console.log(`   - ID: ${firstRecord.id || 'N/A'}`);
      console.log(`   - Type: ${firstRecord.type || 'N/A'}`);
      console.log(`   - Titre: ${firstRecord.title || 'N/A'}`);
      console.log(`   - Création Boond: ${firstRecord.creationDate || 'N/A'}`);
      console.log(`   - Mise à jour Boond: ${firstRecord.updateDate || 'N/A'}`);
      console.log(`   - Date début: ${firstRecord.startDate || 'N/A'}`);
      console.log(`   - Date fin: ${firstRecord.endDate || 'N/A'}`);
      console.log(`   - State: ${firstRecord.state !== null ? firstRecord.state : 'N/A'}`);
      console.log(`   - TJM: ${firstRecord.tjm !== null ? firstRecord.tjm : 'N/A'}`);
      console.log(`   - Coût moyen: ${firstRecord.averageDailyCost !== null ? firstRecord.averageDailyCost : 'N/A'}`);
      console.log(`   - Resource ID: ${firstRecord.resourceId || 'N/A'}`);
      console.log(`   - Project ID: ${firstRecord.projectId || 'N/A'}`);
      console.log(`   - Jours commandés: ${firstRecord.orderedDays !== null ? firstRecord.orderedDays : 'N/A'}`);
    }

    return outputData;
  } catch (error) {
    console.error(`\n❌ Erreur lors de l'écriture du fichier: ${error.message}`);
    throw error;
  }
}

module.exports = extractDeliveries;

if (require.main === module) {
  extractDeliveries()
    .then(() => {
      console.log('\n✅ Extraction terminée avec succès !');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error.message);
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
      process.exit(1);
    });
}
