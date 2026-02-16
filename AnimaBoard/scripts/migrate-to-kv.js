/**
 * Script de migration des données JSON (ancien dossier data/) vers KV.
 * L’app n’utilise plus de fichiers JSON : tout est en KV (Redis). Ce script
 * sert uniquement à importer d’anciens fichiers locaux vers KV si besoin.
 * Usage: node scripts/migrate-to-kv.js
 */

const fs = require('fs').promises;
const path = require('path');
const kvStorage = require('../lib/kvStorage');
const { KV_KEYS } = require('../lib/constants');

const dataDir = path.join(__dirname, '..', 'data');

/**
 * Vérifie si Vercel KV est disponible
 */
async function checkKVAvailability() {
  const isAvailable = kvStorage.isKVAvailable();
  
  if (!isAvailable) {
    console.warn('⚠️  Vercel KV n\'est pas disponible.');
    console.warn('   Les données seront stockées dans le cache mémoire (non persistant).');
    console.warn('   Pour utiliser Vercel KV :');
    console.warn('   1. Créez une base KV dans Vercel Dashboard');
    console.warn('   2. Configurez les variables d\'environnement');
    console.warn('   3. Installez @vercel/kv : npm install @vercel/kv');
    return false;
  }
  
  console.log('✅ Vercel KV est disponible');
  return true;
}

/**
 * Migre les métadonnées des ressources
 */
async function migrateResourcesMetadata() {
  const filePath = path.join(dataDir, 'resources_metadata.json');
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const metadata = JSON.parse(data);
    
    if (Object.keys(metadata).length === 0) {
      console.log('ℹ️  resources_metadata.json est vide, rien à migrer');
      return;
    }
    
    await kvStorage.set(KV_KEYS.RESOURCES_METADATA, metadata);
    console.log(`✅ Métadonnées des ressources migrées (${Object.keys(metadata).length} ressources)`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️  resources_metadata.json n\'existe pas, rien à migrer');
    } else {
      console.error('❌ Erreur lors de la migration des métadonnées:', error.message);
      throw error;
    }
  }
}

/**
 * Migre les forecast times
 */
async function migrateForecastTimes() {
  const filePath = path.join(dataDir, 'forecast-times.json');
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const forecastData = JSON.parse(data);
    
    if (!forecastData.data || Object.keys(forecastData.data).length === 0) {
      console.log('ℹ️  forecast-times.json est vide, rien à migrer');
      return;
    }
    
    await kvStorage.set(KV_KEYS.FORECAST_TIMES, forecastData);
    
    const deliveryCount = Object.keys(forecastData.data).length;
    let totalForecasts = 0;
    Object.values(forecastData.data).forEach(delivery => {
      if (delivery.forecast) {
        totalForecasts += Object.keys(delivery.forecast).length;
      }
    });
    
    console.log(`✅ Forecast times migrés (${deliveryCount} prestations, ${totalForecasts} prévisionnels)`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️  forecast-times.json n\'existe pas, rien à migrer');
    } else {
      console.error('❌ Erreur lors de la migration des forecast times:', error.message);
      throw error;
    }
  }
}

/**
 * Vérifie que la migration a réussi
 */
async function verifyMigration() {
  console.log('\n🔍 Vérification de la migration...\n');
  
  // Vérifier resources_metadata
  const metadata = await kvStorage.get(KV_KEYS.RESOURCES_METADATA, {});
  if (Object.keys(metadata).length > 0) {
    console.log(`✅ resources_metadata : ${Object.keys(metadata).length} ressources`);
  } else {
    console.log('ℹ️  resources_metadata : vide (normal si pas de données)');
  }
  
  // Vérifier forecast_times
  const forecastTimes = await kvStorage.get(KV_KEYS.FORECAST_TIMES, { data: {} });
  if (forecastTimes.data && Object.keys(forecastTimes.data).length > 0) {
    console.log(`✅ forecast_times : ${Object.keys(forecastTimes.data).length} prestations`);
  } else {
    console.log('ℹ️  forecast_times : vide (normal si pas de données)');
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Migration des données JSON vers Vercel KV\n');
  console.log('='.repeat(60));
  
  // Vérifier la disponibilité de KV
  const kvAvailable = await checkKVAvailability();
  
  if (!kvAvailable) {
    console.log('\n⚠️  Migration annulée (KV non disponible)');
    console.log('   Les données seront stockées dans le cache mémoire.');
    return;
  }
  
  console.log('\n📦 Début de la migration...\n');
  
  try {
    // Migrer les données
    await migrateResourcesMetadata();
    await migrateForecastTimes();
    
    // Vérifier la migration
    await verifyMigration();
    
    console.log('\n✅ Migration terminée avec succès !');
    console.log('\n💡 Note : Les fichiers JSON locaux sont conservés comme backup.');
    console.log('   Vous pouvez les supprimer une fois que vous avez vérifié que tout fonctionne.');
    
  } catch (error) {
    console.error('\n❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
}

// Exécuter le script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { migrateResourcesMetadata, migrateForecastTimes };
