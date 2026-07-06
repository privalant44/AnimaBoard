require('dotenv').config();
require('./lib/secretEnv');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS, PROJECTS_START_ID, PROJECTS_END_ID } = require('./lib/constants');
const {
  DEFAULT_BASE_URL,
  getBoondAuthConfig,
  fetchProject,
} = require('./lib/projectBoond');

let email = process.env.BOOND_EMAIL;
let password = process.env.BOOND_PASSWORD;

console.log('🚀 Extraction des projets via /api/projects/{id} (JSON)\n');
console.log('='.repeat(80));
if (!email || !password) {
  console.error('❌ Erreur: BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
  process.exit(1);
}
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

async function extractProjects() {
  const config = getBoondAuthConfig(email, password);
  const baseURL = DEFAULT_BASE_URL;

  const allProjects = [];
  const startId = PROJECTS_START_ID || 1;
  const endId = PROJECTS_END_ID || 150;
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  console.log(`📡 Début de la récupération des projets (IDs ${startId} à ${endId})...\n`);

  for (let id = startId; id <= endId; id++) {
    try {
      const result = await fetchProject(config, baseURL, id);

      if (result.status === 404) {
        notFoundCount++;
      } else if (result.project) {
        allProjects.push(result.project);
        successCount++;

        if (successCount % 25 === 0) {
          console.log(`   ✅ ${successCount} projets récupérés (ID ${id})...`);
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
  console.log(`   - Projets trouvés: ${successCount}`);
  console.log(`   - IDs non trouvés (404): ${notFoundCount}`);
  console.log(`   - Erreurs: ${errorCount}`);

  const projectsForSave = allProjects.map((p) => ({
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

  console.log(`\n💾 Sauvegarde en base...`);
  await kvStorage.set(KV_KEYS.PROJECTS, projectsForSave);
  console.log(`✅ ${projectsForSave.length} projets sauvegardés.`);

  if (allProjects.length > 0) {
    const first = allProjects[0];
    console.log(`\n📋 Aperçu du premier enregistrement:`);
    console.log(`   - ID: ${first.id || 'N/A'}`);
    console.log(`   - Référence: ${first.reference || 'N/A'}`);
    console.log(`   - Création Boond: ${first.creationDate || 'N/A'}`);
    console.log(`   - Mise à jour Boond: ${first.updateDate || 'N/A'}`);
    console.log(`   - Client: ${first.clientName || 'N/A'}`);
  }

  return {
    metadata: {
      extractedAt: new Date().toISOString(),
      method: 'GET',
      baseURL: `${baseURL}/projects/{id}`,
      idRange: `${startId}-${endId}`,
      successCount,
      notFoundCount,
      errorCount,
      totalRecords: allProjects.length,
    },
    data: allProjects,
  };
}

module.exports = extractProjects;

if (require.main === module) {
  extractProjects()
    .then(() => {
      console.log('\n✅ Extraction terminée avec succès !');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error.message);
      process.exit(1);
    });
}
