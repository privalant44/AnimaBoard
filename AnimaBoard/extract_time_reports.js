const axios = require('axios');
const path = require('path');
const { parse } = require('csv-parse/sync');
require('dotenv').config();
require('./lib/secretEnv');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS } = require('./lib/constants');

const baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';

let email = process.env.BOOND_EMAIL;
let password = process.env.BOOND_PASSWORD;

console.log('🚀 Extraction des temps saisis via /api/time-reports/extraction (CSV)\n');
console.log('='.repeat(80));
if (!email || !password) {
  console.error('❌ Erreur: BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
  process.exit(1);
}
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

async function extractTimeReports(beginDate = null, endDate = null) {
  // Définir les dates par défaut (année en cours)
  const currentYear = new Date().getFullYear();
  const startDate = beginDate || `${currentYear}-01-01`;
  const endDateStr = endDate || `${currentYear}-12-31`;
  
  console.log(`📅 Période: ${startDate} à ${endDateStr}\n`);
  
  // Config avec les headers spécifiés
  const config = {
    auth: {
      username: email,
      password: password
    },
    headers: {
      'Accept': 'text/csv',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json'
    },
    timeout: 60000,
    // Ne pas rejeter automatiquement les erreurs pour voir la réponse complète
    validateStatus: function (status) {
      return status < 500; // Accepter les réponses < 500 pour voir les erreurs 4xx
    }
  };
  
  // Body avec les filtres de date
  const requestBody = {
    beginDate: startDate,
    endDate: endDateStr
  };
  
  // Essayer plusieurs variantes d'URL possibles
  const possibleUrls = [
    `${baseURL}/time-reports/extraction`,
    `${baseURL}/time-reports`,
    `https://ui.boondmanager.com/api/time-reports/extraction`,
    `https://ui.boondmanager.com/time-reports/extraction`
  ];
  
  let response = null;
  let usedUrl = null;
  let lastError = null;
  
  for (const url of possibleUrls) {
    try {
      console.log(`📡 Tentative avec l'URL: ${url}...`);
      console.log(`📋 Body:`, JSON.stringify(requestBody, null, 2));
      
      response = await axios.post(url, requestBody, config);
      
      // Vérifier le status de la réponse
      if (response.status >= 200 && response.status < 300) {
        usedUrl = url;
        console.log(`✅ Réponse reçue depuis ${url} (status: ${response.status})`);
        break;
      } else {
        console.log(`⚠️  URL ${url} retourne ${response.status}`);
        if (response.data) {
          console.log(`   Réponse:`, JSON.stringify(response.data, null, 2).substring(0, 500));
        }
        lastError = new Error(`HTTP ${response.status} from ${url}`);
        continue;
      }
    } catch (error) {
      lastError = error;
      if (error.response) {
        console.log(`⚠️  URL ${url} retourne ${error.response.status}`);
        if (error.response.data) {
          console.log(`   Réponse:`, JSON.stringify(error.response.data, null, 2).substring(0, 500));
        }
      } else {
        console.log(`⚠️  Erreur avec ${url}: ${error.message}`);
      }
      continue;
    }
  }
  
  if (!response) {
    throw lastError || new Error('Aucune URL n\'a fonctionné');
  }
  
  try {
    
    console.log(`✅ Réponse reçue depuis ${usedUrl} (status: ${response.status})`);
    console.log(`📊 Content-Type: ${response.headers['content-type']}`);
    console.log(`📊 Taille: ${response.data.length} caractères\n`);
    
    // Parser le CSV (séparateur ;)
    console.log('📝 Parsing du CSV...');
    const records = parse(response.data, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';',
      trim: true
    });
    
    console.log(`✅ ${records.length} lignes parsées\n`);
    
    // Afficher les colonnes disponibles
    if (records.length > 0) {
      console.log('📋 Colonnes disponibles:');
      Object.keys(records[0]).forEach((col, index) => {
        console.log(`   ${index + 1}. ${col}`);
      });
      console.log('');
    }
    
    // Filtrer pour garder seulement les colonnes demandées
    const columnsToKeep = ['Ressource', 'Projet', 'Prestation', 'Mois', 'Nombre de jours'];
    const filteredRecords = records.map(record => {
      const filtered = {};
      columnsToKeep.forEach(col => {
        if (record[col] !== undefined) {
          filtered[col] = record[col];
        } else {
          // Essayer des variations de casse
          const lowerCol = col.toLowerCase();
          const foundKey = Object.keys(record).find(key => key.toLowerCase() === lowerCol);
          if (foundKey) {
            filtered[col] = record[foundKey];
          } else {
            filtered[col] = null;
          }
        }
      });
      return filtered;
    });
    
    // Préparer les données pour la sauvegarde
    const outputData = {
      metadata: {
        extractedAt: new Date().toISOString(),
        method: 'POST',
        endpoint: usedUrl || `${baseURL}/time-reports/extraction`,
        period: {
          beginDate: startDate,
          endDate: endDateStr
        },
        totalRecords: filteredRecords.length,
        columns: columnsToKeep
      },
      data: filteredRecords
    };
    
    // Sauvegarder en JSON
    console.log(`💾 Sauvegarde temps_missions en KV...`);
    await kvStorage.set(KV_KEYS.TEMPS_MISSIONS, outputData);
    
    console.log(`✅ Données temps_missions sauvegardées en KV.`);
    console.log(`\n📊 Statistiques:`);
    console.log(`   - Total d'enregistrements: ${filteredRecords.length}`);
    console.log(`   - Colonnes conservées: ${columnsToKeep.join(', ')}`);
    console.log(`   - Taille du fichier JSON: ${(JSON.stringify(outputData).length / 1024).toFixed(2)} KB`);
    
    // Afficher un aperçu des premiers enregistrements
    if (filteredRecords.length > 0) {
      console.log(`\n📋 Aperçu des 3 premiers enregistrements:`);
      filteredRecords.slice(0, 3).forEach((record, index) => {
        console.log(`\n   Enregistrement ${index + 1}:`);
        columnsToKeep.forEach(col => {
          console.log(`     - ${col}: ${record[col] || 'N/A'}`);
        });
      });
    }
    
    return outputData;
    
  } catch (error) {
    console.error(`\n❌ Erreur lors de l'extraction:`, error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Headers:`, JSON.stringify(error.response.headers, null, 2));
      console.error(`   Data (premiers 500 caractères):`, error.response.data?.substring?.(0, 500) || error.response.data);
    }
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    throw error;
  }
}

// Exporter la fonction pour pouvoir l'utiliser depuis d'autres modules
module.exports = extractTimeReports;

// Exécuter l'extraction si le script est appelé directement
if (require.main === module) {
  // Récupérer les dates depuis les arguments de ligne de commande si fournis
  const args = process.argv.slice(2);
  let beginDate = null;
  let endDate = null;
  
  if (args.length >= 1) {
    beginDate = args[0];
  }
  if (args.length >= 2) {
    endDate = args[1];
  }
  
  extractTimeReports(beginDate, endDate)
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
