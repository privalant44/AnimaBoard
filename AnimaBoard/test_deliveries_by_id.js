const axios = require('axios');
const fs = require('fs');
const path = require('path');

const baseURL = 'https://ui.boondmanager.com/api/deliveries';

// Utiliser Basic Auth avec les identifiants fournis
const email = 'philippe.rivalant@animaneo.fr';
const password = 'Fl@nico050670';

// Config avec Basic Auth
const config = {
  auth: {
    username: email,
    password: password
  },
  headers: {
    'Accept': 'application/hal+json'
  },
  timeout: 10000
};

console.log('🚀 Test des endpoints /api/deliveries/{id} pour les IDs de 1 à 300\n');
console.log('='.repeat(80));
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

// Préparer le fichier CSV
const csvFilePath = path.join(__dirname, 'test_deliveries.csv');
const csvHeader = 'ID;Date début;Date fin;TJM (averageDailyPriceExcludingTax);Titre prestation;Titre opportunity;Coût contractuel (contractAverageDailyCost);Prénom ressource;Nom ressource\n';
let csvContent = csvHeader;

async function testDeliveryById(id) {
  const url = `${baseURL}/${id}`;
  
  try {
    const response = await axios.get(url, config);
    
    const responseData = response.data;
    const deliveryData = responseData.data;
    const attributes = deliveryData?.attributes || {};
    const relationships = deliveryData?.relationships || {};
    const included = responseData?.included || [];
    
    // Extraire les informations demandées
    const deliveryId = deliveryData?.id || id;
    const startDate = attributes.startDate || 'N/A';
    const endDate = attributes.endDate || 'N/A';
    const averageDailyPriceExcludingTax = attributes.averageDailyPriceExcludingTax || 'N/A';
    const title = attributes.title || 'N/A';
    
    // Chercher l'opportunity dans included via le projet
    // L'opportunity est liée au projet, pas directement à la prestation
    const projectId = relationships.project?.data?.id;
    const project = projectId ? included.find(item => item.type === 'project' && item.id === projectId) : null;
    const opportunityId = project?.relationships?.opportunity?.data?.id;
    const opportunity = opportunityId ? included.find(item => item.type === 'opportunity' && item.id === opportunityId) : null;
    const opportunityTitle = opportunity?.attributes?.title || 'N/A';
    
    // Chercher le contract dans included
    const contractId = relationships.contract?.data?.id;
    const contract = contractId ? included.find(item => item.type === 'contract' && item.id === contractId) : null;
    const contractAverageDailyCost = contract?.attributes?.contractAverageDailyCost || 'N/A';
    
    // Chercher la ressource dans included
    const resourceId = relationships.dependsOn?.data?.id;
    const resource = resourceId ? included.find(item => item.type === 'resource' && item.id === resourceId) : null;
    const resourceFirstName = resource?.attributes?.firstName || 'N/A';
    const resourceLastName = resource?.attributes?.lastName || 'N/A';
    
    // Afficher les informations
    console.log(`✅ ID ${deliveryId}: Succès (Status ${response.status})`);
    
    // Ajouter la ligne au CSV (échapper les ";" dans les valeurs)
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Remplacer les ";" par des "," et les retours à la ligne par des espaces
      return str.replace(/;/g, ',').replace(/\n/g, ' ').replace(/\r/g, '');
    };
    
    const csvLine = [
      deliveryId,
      escapeCSV(startDate),
      escapeCSV(endDate),
      escapeCSV(averageDailyPriceExcludingTax),
      escapeCSV(title),
      escapeCSV(opportunityTitle),
      escapeCSV(contractAverageDailyCost),
      escapeCSV(resourceFirstName),
      escapeCSV(resourceLastName)
    ].join(';') + '\n';
    
    csvContent += csvLine;
    
    return { 
      success: true, 
      id: deliveryId, 
      data: {
        id: deliveryId,
        startDate,
        endDate,
        averageDailyPriceExcludingTax,
        title,
        opportunityTitle,
        contractAverageDailyCost,
        resourceFirstName,
        resourceLastName
      },
      fullData: response.data
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 404) {
        console.log(`⚠️  ID ${id}: Non trouvé (404)`);
      } else {
        console.log(`❌ ID ${id}: Erreur ${status} - ${error.response.statusText}`);
        if (status === 401) {
          console.log(`   🔐 Problème d'authentification`);
          if (error.response.data) {
            console.log(`   📋 Détails:`, JSON.stringify(error.response.data).substring(0, 200));
          }
        }
      }
    } else {
      console.log(`❌ ID ${id}: Erreur réseau - ${error.message}`);
    }
    return { success: false, id, error: error.message };
  }
}

async function testAllDeliveries() {
  const results = {
    success: [],
    notFound: [],
    errors: []
  };
  
  for (let id = 1; id <= 300; id++) {
    const result = await testDeliveryById(id);
    
    if (result.success) {
      results.success.push(result);
    } else if (result.error && result.error.includes('404')) {
      results.notFound.push(id);
    } else {
      results.errors.push({ id: result.id, error: result.error });
    }
    
    // Petite pause pour éviter de surcharger l'API
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Résumé des tests:');
  console.log(`   ✅ Succès: ${results.success.length} prestations trouvées`);
  console.log(`   ⚠️  Non trouvées (404): ${results.notFound.length}`);
  console.log(`   ❌ Erreurs: ${results.errors.length}`);
  
  if (results.success.length > 0) {
    console.log(`\n✅ IDs avec succès: ${results.success.map(r => r.id).join(', ')}`);
  }
  
  if (results.notFound.length > 0) {
    console.log(`\n⚠️  IDs non trouvés: ${results.notFound.join(', ')}`);
  }
  
  if (results.errors.length > 0) {
    console.log(`\n❌ IDs avec erreurs:`);
    results.errors.forEach(e => {
      console.log(`   - ID ${e.id}: ${e.error}`);
    });
  }
  
  // Sauvegarder le fichier CSV
  try {
    fs.writeFileSync(csvFilePath, csvContent, 'utf8');
    console.log(`\n✅ Fichier CSV créé: ${csvFilePath}`);
    console.log(`📊 ${results.success.length} prestations exportées dans le fichier CSV`);
  } catch (error) {
    console.error(`\n❌ Erreur lors de l'écriture du fichier CSV: ${error.message}`);
  }
}

// Exécuter les tests
testAllDeliveries().catch(error => {
  console.error('\n❌ Erreur fatale:', error);
  process.exit(1);
});
