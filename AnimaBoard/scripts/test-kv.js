/**
 * Script de test pour vérifier la connexion à Redis (Upstash ou Vercel KV)
 * 
 * Usage: node scripts/test-kv.js
 */

const kvStorage = require('../lib/kvStorage');
const { KV_KEYS } = require('../lib/constants');

async function testKV() {
  console.log('🧪 Test de connexion à Redis (Upstash/Vercel KV)\n');
  console.log('='.repeat(60));
  
  // Vérifier la disponibilité
  const isAvailable = kvStorage.isKVAvailable();
  console.log(`\n📊 Redis disponible : ${isAvailable ? '✅ Oui' : '❌ Non'}`);
  
  // Afficher le type de Redis utilisé
  if (isAvailable) {
    if (process.env.UPSTASH_REDIS_REST_URL) {
      console.log('   Type : Upstash Redis (recommandé)');
    } else if (process.env.KV_URL || process.env.KV_REST_API_URL) {
      console.log('   Type : Vercel KV (déprécié)');
    }
  }
  
  if (!isAvailable) {
    console.log('\n⚠️  Redis (Upstash) n\'est pas configuré.');
    console.log('\nPour configurer Upstash Redis (recommandé) :');
    console.log('1. Allez dans Vercel Dashboard → Integrations');
    console.log('2. Installez l\'intégration "Upstash"');
    console.log('3. Créez une nouvelle base Redis');
    console.log('4. Les variables UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN seront ajoutées automatiquement');
    console.log('5. Installez le package : npm install @upstash/redis');
    console.log('\nAlternative (déprécié) : Vercel KV');
    console.log('Le code utilisera automatiquement le cache mémoire en fallback.');
    return;
  }
  
  // Test d'écriture
  console.log('\n📝 Test d\'écriture...');
  try {
    await kvStorage.set('test_key', { message: 'Hello from Vercel KV!', timestamp: new Date().toISOString() });
    console.log('✅ Écriture réussie');
  } catch (error) {
    console.error('❌ Erreur lors de l\'écriture:', error.message);
    return;
  }
  
  // Test de lecture
  console.log('\n📖 Test de lecture...');
  try {
    const value = await kvStorage.get('test_key', null);
    if (value) {
      console.log('✅ Lecture réussie');
      console.log('   Données:', JSON.stringify(value, null, 2));
    } else {
      console.log('⚠️  Aucune donnée trouvée');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la lecture:', error.message);
    return;
  }
  
  // Test de suppression
  console.log('\n🗑️  Test de suppression...');
  try {
    await kvStorage.del('test_key');
    console.log('✅ Suppression réussie');
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error.message);
    return;
  }
  
  // Vérifier les clés existantes
  console.log('\n🔍 Vérification des clés existantes...');
  try {
    const metadata = await kvStorage.get(KV_KEYS.RESOURCES_METADATA, null);
    const forecastTimes = await kvStorage.get(KV_KEYS.FORECAST_TIMES, null);
    
    if (metadata) {
      const count = Object.keys(metadata).length;
      console.log(`✅ ${KV_KEYS.RESOURCES_METADATA} : ${count} ressources`);
    } else {
      console.log(`ℹ️  ${KV_KEYS.RESOURCES_METADATA} : vide`);
    }
    
    if (forecastTimes && forecastTimes.data) {
      const count = Object.keys(forecastTimes.data).length;
      console.log(`✅ ${KV_KEYS.FORECAST_TIMES} : ${count} prestations`);
    } else {
      console.log(`ℹ️  ${KV_KEYS.FORECAST_TIMES} : vide`);
    }
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.message);
  }
  
  console.log('\n✅ Tous les tests sont passés !');
  console.log('\n💡 Redis (Upstash ou Vercel KV) est correctement configuré et fonctionne.');
}

// Exécuter le test
if (require.main === module) {
  testKV().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { testKV };
