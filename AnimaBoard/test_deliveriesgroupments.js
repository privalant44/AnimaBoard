const axios = require('axios');
const fs = require('fs');
const path = require('path');

const baseURL = 'https://ui.boondmanager.com/api';

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
  timeout: 30000
};

console.log('🚀 Test de l\'endpoint /api/deliveriesgroupments/extraction\n');
console.log('='.repeat(80));
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

// Préparer le fichier CSV
const csvFilePath = path.join(__dirname, 'test2.csv');
let csvContent = '';

// Fonction pour échapper les valeurs CSV
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Remplacer les ";" par des "," et les retours à la ligne par des espaces
  return str.replace(/;/g, ',').replace(/\n/g, ' ').replace(/\r/g, '');
};

// Fonction pour convertir un objet en ligne CSV (récursive pour les objets imbriqués)
const objectToCSVLine = (obj, prefix = '') => {
  const line = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      line.push('');
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Objet imbriqué : récursion
      const nested = objectToCSVLine(value, fullKey);
      line.push(...nested);
    } else if (Array.isArray(value)) {
      // Tableau : convertir en chaîne
      line.push(escapeCSV(JSON.stringify(value)));
    } else {
      line.push(escapeCSV(value));
    }
  }
  return line;
};

async function testExtraction() {
  const url = `${baseURL}/deliveriesgroupments/extraction`;
  
  // Essayer différentes méthodes et configurations
  let response;
  let method = 'GET';
  let success = false;
  
  // Test 1: GET simple
  try {
    console.log(`📡 Test 1: GET simple`);
    response = await axios.get(url, config);
    console.log(`✅ GET réussi ! Status: ${response.status}`);
    success = true;
  } catch (error) {
    console.log(`❌ GET échoué: ${error.response?.status || error.message}`);
    
    // Test 2: GET avec paramètres
    try {
      console.log(`\n📡 Test 2: GET avec paramètres de requête`);
      const getConfigWithParams = {
        ...config,
        params: {
          maxResults: 100
        }
      };
      response = await axios.get(url, getConfigWithParams);
      console.log(`✅ GET avec params réussi ! Status: ${response.status}`);
      method = 'GET (avec params)';
      success = true;
    } catch (error2) {
      console.log(`❌ GET avec params échoué: ${error2.response?.status || error2.message}`);
      
      // Test 3: POST avec body
      try {
        console.log(`\n📡 Test 3: POST avec body JSON`);
        method = 'POST';
        response = await axios.post(url, { maxResults: 100 }, config);
        console.log(`✅ POST réussi ! Status: ${response.status}`);
        success = true;
      } catch (error3) {
        console.log(`❌ POST échoué: ${error3.response?.status || error3.message}`);
        
        // Afficher les détails de l'erreur
        if (error3.response) {
          console.log(`\n📋 Détails de l'erreur:`);
          console.log(`   Status: ${error3.response.status}`);
          console.log(`   Headers Allow: ${error3.response.headers['allow'] || 'N/A'}`);
          if (error3.response.data) {
            console.log(`   Réponse:`, JSON.stringify(error3.response.data, null, 2).substring(0, 500));
          }
        }
        
        throw new Error(`Toutes les méthodes ont échoué. Dernière erreur: ${error3.response?.status || error3.message}`);
      }
    }
  }
  
  if (!success) {
    throw new Error('Aucune méthode n\'a fonctionné');
  }
  
  try {
    
    console.log(`✅ Succès avec ${method} ! Status: ${response.status}`);
    console.log(`📊 Type de réponse: ${typeof response.data}`);
    
    const data = response.data;
    
    // Afficher la structure de la réponse
    console.log(`\n📋 Structure de la réponse:`);
    if (Array.isArray(data)) {
      console.log(`   - Tableau avec ${data.length} éléments`);
      if (data.length > 0) {
        console.log(`   - Clés du premier élément:`, Object.keys(data[0]));
      }
    } else if (data && typeof data === 'object') {
      console.log(`   - Objet avec clés:`, Object.keys(data));
      if (data.data && Array.isArray(data.data)) {
        console.log(`   - data.data est un tableau avec ${data.data.length} éléments`);
      }
      if (data._embedded) {
        console.log(`   - _embedded avec clés:`, Object.keys(data._embedded));
      }
    }
    
    // Extraire les données pour le CSV
    let items = [];
    
    if (Array.isArray(data)) {
      items = data;
    } else if (data?.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data?._embedded?.deliveriesgroupments && Array.isArray(data._embedded.deliveriesgroupments)) {
      items = data._embedded.deliveriesgroupments;
    } else if (data?._embedded && typeof data._embedded === 'object') {
      // Chercher le premier tableau dans _embedded
      for (const key in data._embedded) {
        if (Array.isArray(data._embedded[key])) {
          items = data._embedded[key];
          console.log(`   - Données trouvées dans _embedded.${key}`);
          break;
        }
      }
    } else if (data && typeof data === 'object') {
      // Si c'est un objet unique, le traiter comme un tableau avec un élément
      items = [data];
    }
    
    console.log(`\n📊 ${items.length} éléments trouvés pour export CSV`);
    
    if (items.length === 0) {
      console.log(`\n⚠️  Aucune donnée à exporter. Structure complète de la réponse:`);
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
      return { success: true, count: 0 };
    }
    
    // Créer l'en-tête CSV à partir du premier élément
    const firstItem = items[0];
    const allKeys = new Set();
    
    // Collecter toutes les clés (y compris imbriquées)
    items.forEach(item => {
      const collectKeys = (obj, prefix = '') => {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const key in obj) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (obj[key] !== null && obj[key] !== undefined) {
              if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && !(obj[key] instanceof Date)) {
                collectKeys(obj[key], fullKey);
              } else {
                allKeys.add(fullKey);
              }
            }
          }
        }
      };
      collectKeys(item);
    });
    
    const sortedKeys = Array.from(allKeys).sort();
    
    // Créer l'en-tête CSV
    csvContent = sortedKeys.join(';') + '\n';
    
    // Créer les lignes CSV
    items.forEach((item, index) => {
      const line = sortedKeys.map(key => {
        const keys = key.split('.');
        let value = item;
        
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = value[k];
          } else {
            value = null;
            break;
          }
        }
        
        if (value === null || value === undefined) {
          return '';
        } else if (Array.isArray(value)) {
          return escapeCSV(JSON.stringify(value));
        } else if (typeof value === 'object' && !(value instanceof Date)) {
          return escapeCSV(JSON.stringify(value));
        } else {
          return escapeCSV(value);
        }
      });
      
      csvContent += line.join(';') + '\n';
      
      // Afficher un message de progression tous les 10 éléments
      if ((index + 1) % 10 === 0) {
        console.log(`   📝 ${index + 1}/${items.length} éléments traités...`);
      }
    });
    
    // Sauvegarder le fichier CSV
    try {
      fs.writeFileSync(csvFilePath, csvContent, 'utf8');
      console.log(`\n✅ Fichier CSV créé: ${csvFilePath}`);
      console.log(`📊 ${items.length} éléments exportés dans le fichier CSV`);
      console.log(`📋 ${sortedKeys.length} colonnes dans le CSV`);
      
      // Afficher un aperçu des premières colonnes
      console.log(`\n📋 Aperçu des colonnes (10 premières):`);
      sortedKeys.slice(0, 10).forEach((key, i) => {
        console.log(`   ${i + 1}. ${key}`);
      });
      if (sortedKeys.length > 10) {
        console.log(`   ... et ${sortedKeys.length - 10} autres colonnes`);
      }
      
      return { success: true, count: items.length, columns: sortedKeys.length };
    } catch (error) {
      console.error(`\n❌ Erreur lors de l'écriture du fichier CSV: ${error.message}`);
      return { success: false, error: error.message };
    }
    
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      console.log(`\n❌ Erreur ${status}: ${error.response.statusText}`);
      if (error.response.data) {
        console.log(`📋 Détails de l'erreur:`);
        console.log(JSON.stringify(error.response.data, null, 2).substring(0, 1000));
      }
    } else {
      console.log(`\n❌ Erreur réseau: ${error.message}`);
    }
    return { success: false, error: error.message };
  }
}

// Exécuter le test
testExtraction().then(result => {
  if (result.success) {
    console.log(`\n✅ Test terminé avec succès !`);
    if (result.count !== undefined) {
      console.log(`📊 ${result.count} éléments exportés`);
    }
  } else {
    console.log(`\n❌ Test échoué`);
    process.exit(1);
  }
}).catch(error => {
  console.error('\n❌ Erreur fatale:', error);
  process.exit(1);
});
