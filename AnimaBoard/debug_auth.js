const axios = require('axios');

const token = '616e696d616e656f';
const key = '9fb1acb2c0deb05eab5e';

// Encoder en Base64
const auth = Buffer.from(token + ':' + key).toString('base64');
console.log(`🔑 Token Base64 encodé: ${auth}\n`);

async function testAuth() {
  const baseURLs = [
    'https://animaneo.boondmanager.com',
    'https://ui.boondmanager.com'
  ];

  const endpoints = [
    '/api/application/information',
    '/application/information'
  ];

  for (const baseURL of baseURLs) {
    console.log(`\n🌐 Test avec l'URL de base: ${baseURL}\n`);
    
    for (const endpoint of endpoints) {
      const fullUrl = `${baseURL}${endpoint}`;
      console.log(`📡 Tentative: ${fullUrl}`);
      
      try {
        const config = {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        };

        const response = await axios.get(fullUrl, config);
        
        console.log(`✅ Succès ! Status: ${response.status}`);
        console.log(`📊 Content-Type: ${response.headers['content-type']}`);
        
        // Si c'est du HTML, extraire la version depuis les meta tags
        if (response.headers['content-type']?.includes('text/html')) {
          const html = response.data;
          const versionMatch = html.match(/<meta name="version" content="([^"]+)"/);
          if (versionMatch) {
            console.log(`\n🎯 Version de l'application trouvée: ${versionMatch[1]}`);
          } else {
            console.log(`\n⚠️  Version non trouvée dans le HTML`);
          }
        } else {
          // Si c'est du JSON
          console.log(`📊 Données reçues:`, JSON.stringify(response.data, null, 2).substring(0, 500));
          
          // Chercher la version de l'application
          if (response.data) {
            const version = response.data.version || 
                           response.data.data?.version || 
                           response.data.application?.version ||
                           response.data.information?.version;
            
            if (version) {
              console.log(`\n🎯 Version de l'application trouvée: ${version}`);
            } else {
              console.log(`\n⚠️  Version non trouvée dans la réponse JSON`);
            }
          }
        }
        
        return { success: true, url: fullUrl, data: response.data };
      } catch (error) {
        if (error.response) {
          console.log(`❌ Erreur ${error.response.status}: ${error.response.statusText}`);
          if (error.response.status === 404) {
            console.log(`   ⚠️  Endpoint non trouvé, on continue...`);
          }
        } else {
          console.log(`❌ Erreur: ${error.message}`);
        }
      }
    }
  }
  
  console.log(`\n❌ Aucun endpoint n'a fonctionné`);
  return { success: false };
}

// Test spécifique pour GET /deliveries avec paramètres
async function testDeliveriesGet() {
  console.log(`\n\n📋 Test GET /deliveries avec paramètres\n`);
  
  const fullUrl = 'https://animaneo.boondmanager.com/api/deliveries';
  console.log(`📡 Tentative GET: ${fullUrl}`);
  console.log(`📋 Paramètres: maxResults=50, order=asc`);
  console.log(`🔑 Header X-Jwt-Client: ${auth}\n`);
  
  try {
    const config = {
      params: {
        maxResults: 50,
        order: 'asc'
      },
      headers: {
        'X-Jwt-Client': auth,
        'Accept': 'application/hal+json',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    const response = await axios.get(fullUrl, config);
    
    console.log(`✅ Succès ! Status: ${response.status}`);
    
    // Afficher le nombre de prestations
    if (response.data?._embedded?.deliveries) {
      console.log(`✅ Données reçues : ${response.data._embedded.deliveries.length}`);
      return { success: true, url: fullUrl, deliveries: response.data._embedded.deliveries };
    } else {
      console.log(`⚠️  Structure de réponse non reconnue`);
      console.log(`📋 Clés disponibles:`, Object.keys(response.data || {}));
      return { success: false, url: fullUrl, data: response.data };
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ Erreur ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data) {
        console.log(`📋 Détails:`, JSON.stringify(error.response.data).substring(0, 200));
      }
    } else {
      console.log(`❌ Erreur: ${error.message}`);
    }
    return { success: false, url: fullUrl, error: error.message };
  }
}

// Test également avec l'authentification JWT
async function testJwtAuth() {
  console.log(`\n\n🔐 Test avec authentification JWT (X-Jwt-Client)\n`);
  
  const baseURLs = [
    'https://animaneo.boondmanager.com',
    'https://ui.boondmanager.com'
  ];

  const endpoints = [
    '/api/deliveries/search',
    '/api/deliveries',
    '/deliveries/search',
    '/deliveries'
  ];

  for (const baseURL of baseURLs) {
    console.log(`\n🌐 Test avec l'URL de base: ${baseURL}\n`);
    
    for (const endpoint of endpoints) {
      const fullUrl = `${baseURL}${endpoint}`;
      console.log(`📡 Tentative POST: ${fullUrl}`);
      
      try {
        const config = {
          headers: {
            'X-Jwt-Client': `${token}:${key}`,
            'Accept': 'application/hal+json',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        };

        const response = await axios.post(fullUrl, {}, config);
        
        console.log(`✅ Succès ! Status: ${response.status}`);
        
        // Vérifier la structure de la réponse
        const deliveries = response.data?.data?._embedded?.deliveries || 
                          response.data?._embedded?.deliveries ||
                          [];
        
        console.log(`📊 Nombre de prestations trouvées: ${Array.isArray(deliveries) ? deliveries.length : 0}`);
        
        if (Array.isArray(deliveries) && deliveries.length > 0) {
          console.log(`✅ Endpoint fonctionnel: ${fullUrl}`);
          console.log(`📋 Exemple de prestation:`, JSON.stringify(deliveries[0], null, 2).substring(0, 300));
          return { success: true, url: fullUrl, deliveries: deliveries };
        }
      } catch (error) {
        if (error.response) {
          console.log(`❌ Erreur ${error.response.status}: ${error.response.statusText}`);
        } else {
          console.log(`❌ Erreur: ${error.message}`);
        }
      }
    }
  }
  
  console.log(`\n❌ Aucun endpoint deliveries n'a fonctionné`);
  return { success: false };
}

// Exécuter les tests
(async () => {
  console.log('🚀 Démarrage des tests d\'authentification BoondManager\n');
  console.log('='.repeat(80));
  
  // Test 1: Basic Auth avec /application/information
  const result1 = await testAuth();
  
  // Test 2: GET /deliveries avec paramètres (test spécifique)
  const result2 = await testDeliveriesGet();
  
  // Test 3: JWT Auth avec /deliveries (autres endpoints)
  const result3 = await testJwtAuth();
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Résumé des tests:');
  console.log(`   Test Basic Auth: ${result1.success ? '✅ Succès' : '❌ Échec'}`);
  console.log(`   Test GET /deliveries: ${result2.success ? '✅ Succès' : '❌ Échec'}`);
  console.log(`   Test JWT Auth (autres): ${result3.success ? '✅ Succès' : '❌ Échec'}`);
  
  if (result1.success) {
    console.log(`\n✅ URL fonctionnelle pour Basic Auth: ${result1.url}`);
  }
  
  if (result2.success) {
    console.log(`\n✅ URL fonctionnelle pour GET /deliveries: ${result2.url}`);
    console.log(`📊 Nombre de prestations: ${result2.deliveries?.length || 0}`);
  }
  
  if (result3.success) {
    console.log(`\n✅ URL fonctionnelle pour JWT Auth: ${result3.url}`);
    console.log(`📊 Nombre de prestations: ${result3.deliveries?.length || 0}`);
  }
})();
