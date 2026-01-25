const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

require('dotenv').config();

const baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';

// Utiliser Basic Auth avec les identifiants depuis les variables d'environnement
let email = process.env.BOOND_EMAIL;
let password = process.env.BOOND_PASSWORD;

// Support rétrocompatible
if (!email && process.env.BOOND_TOKEN_CLIENT) {
  email = process.env.BOOND_TOKEN_CLIENT;
}
if (!password && process.env.BOOND_CLEF_CLIENT) {
  password = process.env.BOOND_CLEF_CLIENT;
}

console.log('🚀 Extraction des prestations via /api/deliveries/{id} (JSON)\n');
console.log('='.repeat(80));
if (!email || !password) {
  console.error('❌ Erreur: Les identifiants API ne sont pas configurés (BOOND_EMAIL et BOOND_PASSWORD requis)');
  process.exit(1);
}
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

async function extractDeliveries() {
  const outputPath = path.join(__dirname, 'data', 'deliveries.json');
  
  // Créer le dossier data s'il n'existe pas
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    // Le dossier existe déjà, c'est OK
  }
  
  // Config avec les headers spécifiés
  const config = {
    auth: {
      username: email,
      password: password
    },
    headers: {
      'Accept': 'application/hal+json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 60000
  };
  
  const allDeliveries = [];
  const startId = 1;
  const endId = 500; // Ajuster selon vos besoins
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  
  console.log(`📡 Début de la récupération des prestations (IDs ${startId} à ${endId})...\n`);
  
  for (let id = startId; id <= endId; id++) {
    const url = `${baseURL}/deliveries/${id}`;
    
    try {
      const response = await axios.get(url, config);
      
      // Extraire et filtrer les données
      if (response.data && response.data.data) {
        const deliveryData = response.data.data;
        
        // Vérifier que c'est bien du type "delivery"
        if (deliveryData.type === 'delivery') {
          const attributes = deliveryData.attributes || {};
          const relationships = deliveryData.relationships || {};
          
          // Extraire l'ID de la ressource depuis les relations
          let resourceId = null;
          if (relationships.dependsOn && relationships.dependsOn.data) {
            resourceId = relationships.dependsOn.data.id;
          }
          
          // Extraire les jours commandés - utiliser numberOfDaysInvoicedOrQuantity
          let orderedDays = null;
          if (attributes.numberOfDaysInvoicedOrQuantity !== undefined && attributes.numberOfDaysInvoicedOrQuantity !== null) {
            orderedDays = parseFloat(attributes.numberOfDaysInvoicedOrQuantity);
          } else if (attributes.orderedDays !== undefined && attributes.orderedDays !== null) {
            orderedDays = parseFloat(attributes.orderedDays);
          } else if (attributes.orderedQuantity !== undefined && attributes.orderedQuantity !== null) {
            orderedDays = parseFloat(attributes.orderedQuantity);
          } else if (attributes.quantity !== undefined && attributes.quantity !== null) {
            orderedDays = parseFloat(attributes.quantity);
          } else if (attributes.duration !== undefined && attributes.duration !== null) {
            orderedDays = parseFloat(attributes.duration);
          }
          
          // Créer l'objet avec seulement les champs demandés
          const filteredDelivery = {
            id: deliveryData.id,
            type: deliveryData.type,
            startDate: attributes.startDate || null,
            endDate: attributes.endDate || null,
            title: attributes.title || null,
            state: attributes.state !== undefined ? attributes.state : null,
            averageDailyPriceExcludingTax: attributes.averageDailyPriceExcludingTax !== undefined 
              ? attributes.averageDailyPriceExcludingTax 
              : null,
            averageDailyCost: attributes.averageDailyCost !== undefined 
              ? attributes.averageDailyCost 
              : null,
            resource_id: resourceId,
            orderedDays: orderedDays !== null && !isNaN(orderedDays) ? orderedDays : null
          };
          
          allDeliveries.push(filteredDelivery);
          successCount++;
          
          // Afficher un message tous les 50 IDs
          if (successCount % 50 === 0) {
            console.log(`   ✅ ${successCount} prestations récupérées (ID ${id})...`);
          }
        }
      }
      
      // Petite pause pour éviter de surcharger l'API
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      if (error.response && error.response.status === 404) {
        notFoundCount++;
        // Ne pas afficher les 404 pour ne pas surcharger la console
      } else {
        errorCount++;
        if (errorCount <= 5) { // Afficher seulement les 5 premières erreurs
          console.error(`   ❌ Erreur pour ID ${id}: ${error.response?.status || error.message}`);
        }
      }
    }
  }
  
  console.log(`\n📊 Récupération terminée !`);
  console.log(`   - Prestations trouvées: ${successCount}`);
  console.log(`   - IDs non trouvés (404): ${notFoundCount}`);
  console.log(`   - Erreurs: ${errorCount}`);
  console.log(`   - Total dans le tableau: ${allDeliveries.length}`);
  
  // Préparer les données pour la sauvegarde
  const outputData = {
    metadata: {
      extractedAt: new Date().toISOString(),
      method: 'GET',
      baseURL: `${baseURL}/deliveries/{id}`,
      idRange: `${startId}-${endId}`,
      successCount: successCount,
      notFoundCount: notFoundCount,
      errorCount: errorCount,
      totalRecords: allDeliveries.length
    },
    data: allDeliveries
  };
  
  // Sauvegarder en JSON
  try {
    console.log(`\n💾 Sauvegarde dans ${outputPath}...`);
    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2), 'utf8');
    
    console.log(`✅ Fichier sauvegardé avec succès !`);
    console.log(`\n📊 Statistiques:`);
    console.log(`   - Total d'enregistrements: ${allDeliveries.length}`);
    console.log(`   - Taille du fichier JSON: ${(JSON.stringify(outputData).length / 1024).toFixed(2)} KB`);
    
    // Afficher un aperçu du premier enregistrement
    if (allDeliveries.length > 0) {
      console.log(`\n📋 Aperçu du premier enregistrement:`);
      const firstRecord = allDeliveries[0];
      console.log(`   - ID: ${firstRecord.id || 'N/A'}`);
      console.log(`   - Type: ${firstRecord.type || 'N/A'}`);
      console.log(`   - Titre: ${firstRecord.title || 'N/A'}`);
      console.log(`   - Date début: ${firstRecord.startDate || 'N/A'}`);
      console.log(`   - Date fin: ${firstRecord.endDate || 'N/A'}`);
      console.log(`   - State: ${firstRecord.state !== null ? firstRecord.state : 'N/A'}`);
      console.log(`   - TJM: ${firstRecord.averageDailyPriceExcludingTax !== null ? firstRecord.averageDailyPriceExcludingTax : 'N/A'}`);
      console.log(`   - Coût moyen: ${firstRecord.averageDailyCost !== null ? firstRecord.averageDailyCost : 'N/A'}`);
      console.log(`   - Resource ID: ${firstRecord.resource_id || 'N/A'}`);
      console.log(`   - Jours commandés: ${firstRecord.orderedDays !== null ? firstRecord.orderedDays : 'N/A'}`);
    }
    
    return outputData;
    
  } catch (error) {
    console.error(`\n❌ Erreur lors de l'écriture du fichier: ${error.message}`);
    throw error;
  }
}

// Exporter la fonction pour pouvoir l'utiliser depuis d'autres modules
module.exports = extractDeliveries;

// Exécuter l'extraction si le script est appelé directement
if (require.main === module) {
  extractDeliveries()
    .then(() => {
      console.log('\n✅ Extraction terminée avec succès !');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Erreur fatale:', error.message);
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
      process.exit(1);
    });
}
