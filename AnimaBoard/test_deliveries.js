const axios = require('axios');

const fullUrl = 'https://ui.boondmanager.com/api/deliveries?maxResults=50';

const config = {
  headers: {
    'X-Jwt-Client': 'NjE2ZTY5NmQ2MTZlNjU2Zjo5ZmIxYWNiMmMwZGViMDVlYWI1ZQ==',
    'Accept': 'application/hal+json'
  },
  timeout: 10000
};

console.log('📡 Test GET:', fullUrl);
console.log('📡 Headers:', JSON.stringify(config.headers, null, 2));

axios.get(fullUrl, config)
  .then(response => {
    console.log('\n✅ Succès! Status:', response.status);
    console.log('\n📊 Réponse complète (response.data):');
    console.log(JSON.stringify(response.data, null, 2));
  })
  .catch(error => {
    console.log('\n❌ Erreur:', error.response?.status || error.message);
    if (error.response?.data) {
      console.log('\n📋 Détails de l\'erreur:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  });
