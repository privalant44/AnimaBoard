/**
 * Sync incrémentale des prestations Boond actives sur une année civile.
 *
 * Stratégie (par défaut) :
 * 1. Re-fetch les prestations déjà en base avec creation_date sur l'année cible
 * 2. Re-fetch les prestations en base sans creation_date (backfill dates Boond)
 * 3. Scanner les nouveaux IDs Boond (max(id) en base + 1 → dernier ID existant)
 * 4. Upsert uniquement les prestations dont la période (start/end) chevauche l'année
 *
 * Usage:
 *   node scripts/sync-deliveries-year.js
 *   node scripts/sync-deliveries-year.js --year=2026
 *   node scripts/sync-deliveries-year.js --year=2026 --full-scan
 *   node scripts/sync-deliveries-year.js --year=2026 --no-scan-new
 *
 * Options:
 *   --year=YYYY       Année cible (défaut : année courante)
 *   --full-scan       Parcourt toute la plage d'IDs (lent, utile si creation_date manquante)
 *   --no-scan-new     Ne rafraîchit que les IDs déjà connus en base pour l'année
 *   --start-id=N      Borne basse (défaut : DELIVERIES_START_ID ou 1)
 *   --end-id=N        Borne haute (défaut : détection auto par dichotomie)
 *   --delay=MS        Pause entre appels Boond (défaut : 200)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const { getSupabase } = require('../lib/supabaseClient');
const kvStorage = require('../lib/kvStorage');
const { hasTableColumn, isMissingColumnError } = require('../lib/supabaseSchema');
const { KV_KEYS } = require('../lib/constants');
const {
  DEFAULT_BASE_URL,
  DELIVERIES_START_ID,
  getBoondAuthConfig,
  doesDeliveryOverlapYear,
  findMaxDeliveryId,
  fetchDelivery,
} = require('../lib/deliveryBoond');

function parseArgs(argv) {
  const options = {
    year: new Date().getFullYear(),
    fullScan: false,
    scanNew: true,
    startId: DELIVERIES_START_ID || 1,
    endId: null,
    delayMs: 200,
    recentBackfill: 200,
    help: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--full-scan') options.fullScan = true;
    else if (arg === '--no-scan-new') options.scanNew = false;
    else if (arg.startsWith('--year=')) options.year = parseInt(arg.slice('--year='.length), 10);
    else if (arg.startsWith('--start-id=')) options.startId = parseInt(arg.slice('--start-id='.length), 10);
    else if (arg.startsWith('--end-id=')) options.endId = parseInt(arg.slice('--end-id='.length), 10);
    else if (arg.startsWith('--delay=')) options.delayMs = parseInt(arg.slice('--delay='.length), 10);
    else if (arg.startsWith('--recent-backfill=')) options.recentBackfill = parseInt(arg.slice('--recent-backfill='.length), 10);
  }

  if (!Number.isFinite(options.year)) {
    throw new Error(`Année invalide : ${options.year}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Sync des prestations Boond créées sur une année civile.

  node scripts/sync-deliveries-year.js [options]

Options:
  --year=YYYY       Année cible (défaut : année courante)
  --full-scan       Parcourt toute la plage d'IDs (lent)
  --no-scan-new     IDs déjà en base pour l'année uniquement
  --start-id=N      Borne basse (défaut : 1)
  --end-id=N        Borne haute (défaut : auto)
  --delay=MS        Pause entre appels Boond (défaut : 200)
  --recent-backfill=N  Re-scan les N derniers IDs (défaut : 200)
  -h, --help        Cette aide
`);
}

async function getDeliveryIdsWithNullCreationDate() {
  const supabase = getSupabase();
  if (!supabase) return [];
  if (!(await hasTableColumn('deliveries', 'creation_date'))) return [];

  const { data, error } = await supabase
    .from('deliveries')
    .select('id')
    .is('creation_date', null)
    .order('id');

  if (error) {
    if (isMissingColumnError(error)) return [];
    throw error;
  }
  return (data || []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

async function getDeliveryIdsFromDbForYear(year) {
  const supabase = getSupabase();
  if (!supabase) return [];
  if (!(await hasTableColumn('deliveries', 'creation_date'))) return [];

  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;
  const { data, error } = await supabase
    .from('deliveries')
    .select('id')
    .gte('creation_date', start)
    .lt('creation_date', end)
    .order('id');

  if (error) {
    if (isMissingColumnError(error)) return [];
    throw error;
  }
  return (data || []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

async function getMaxDeliveryIdFromDb() {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('deliveries')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id != null ? Number(data.id) : 0;
}

function buildIdSet(options, endId, maxDbId, idsFromDb) {
  const ids = new Set(idsFromDb);

  if (options.fullScan) {
    for (let id = options.startId; id <= endId; id += 1) ids.add(id);
    return ids;
  }

  if (options.scanNew) {
    const from = Math.max(options.startId, maxDbId + 1);
    for (let id = from; id <= endId; id += 1) ids.add(id);
  }

  // Backfill de sécurité : rescanner les derniers IDs, même si maxDbId >= endId.
  // Ça rattrape les trous (prestations existantes mais jamais upsertées) sans coût d’un full-scan.
  const recent = Number(options.recentBackfill);
  if (Number.isFinite(recent) && recent > 0) {
    const from = Math.max(options.startId, endId - recent + 1);
    for (let id = from; id <= endId; id += 1) ids.add(id);
  }

  return ids;
}

async function saveResults(deliveries, projectsMap, metadata) {
  if (deliveries.length > 0) {
    await kvStorage.set(KV_KEYS.DELIVERIES, {
      metadata,
      data: deliveries,
    });
  }

  const projectsList = Object.values(projectsMap);
  if (projectsList.length > 0) {
    await kvStorage.set(
      KV_KEYS.PROJECTS,
      projectsList.map((p) => ({
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
      }))
    );
  }
}

async function syncDeliveriesYear(options = {}) {
  const email = process.env.BOOND_EMAIL;
  const password = process.env.BOOND_PASSWORD;
  if (!email || !password) {
    throw new Error('BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
  }

  const config = getBoondAuthConfig(email, password);
  const baseURL = DEFAULT_BASE_URL;
  const year = options.year;

  console.log(`\n🚀 Sync prestations Boond — actives sur ${year}\n`);
  console.log('='.repeat(72));

  const endId =
    options.endId ??
    (await findMaxDeliveryId(config, baseURL, {
      low: options.startId,
      high: options.endId ?? undefined,
      delayMs: options.delayMs,
    }));

  const [idsFromDb, idsWithNullDates, maxDbId] = await Promise.all([
    getDeliveryIdsFromDbForYear(year),
    getDeliveryIdsWithNullCreationDate(),
    getMaxDeliveryIdFromDb(),
  ]);

  const idsToFetch = buildIdSet(options, endId, maxDbId, [
    ...idsFromDb,
    ...idsWithNullDates,
  ]);
  const sortedIds = [...idsToFetch].sort((a, b) => a - b);

  console.log(`📡 Plage Boond détectée : ${options.startId} → ${endId}`);
  console.log(`📦 En base pour ${year} : ${idsFromDb.length} prestation(s)`);
  if (idsWithNullDates.length > 0) {
    console.log(`⚠️  Sans creation_date en base : ${idsWithNullDates.length} (backfill Boond)`);
  }
  console.log(`🔎 IDs à interroger : ${sortedIds.length}`);
  if (options.fullScan) console.log('   (mode full-scan)');
  else if (!options.scanNew) console.log('   (mode no-scan-new)');
  else console.log(`   (refresh base + scan ${Math.max(options.startId, maxDbId + 1)} → ${endId})`);
  console.log('');

  const deliveries = [];
  const projectsMap = {};
  let fetched = 0;
  let saved = 0;
  let skippedYear = 0;
  let notFound = 0;
  let errors = 0;

  for (const id of sortedIds) {
    fetched += 1;
    try {
      const result = await fetchDelivery(config, baseURL, id);
      if (result.status === 404) {
        notFound += 1;
      } else if (result.delivery) {
        if (doesDeliveryOverlapYear(result.delivery, year)) {
          deliveries.push(result.delivery);
          saved += 1;
          if (result.project && !projectsMap[result.project.id]) {
            projectsMap[result.project.id] = result.project;
          }
          if (saved % 25 === 0) {
            console.log(`   ✅ ${saved} prestation(s) (année ${year}) enregistrée(s) (dernier ID ${id})`);
          }
        } else {
          skippedYear += 1;
        }
      }
    } catch (error) {
      errors += 1;
      if (errors <= 5) {
        console.error(`   ❌ ID ${id} : ${error.message}`);
      }
    }

    if (options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  const metadata = {
    extractedAt: new Date().toISOString(),
    method: 'sync-deliveries-year',
    baseURL: `${baseURL}/deliveries/{id}`,
    targetYear: year,
    idRange: `${options.startId}-${endId}`,
    idsRequested: sortedIds.length,
    idsFetched: fetched,
    savedCount: saved,
    skippedNotInYear: skippedYear,
    notFoundCount: notFound,
    errorCount: errors,
    idsFromDbCount: idsFromDb.length,
    idsNullCreationDateCount: idsWithNullDates.length,
    fullScan: options.fullScan,
    scanNew: options.scanNew,
  };

  await saveResults(deliveries, projectsMap, metadata);

  console.log('\n📊 Terminé');
  console.log(`   - IDs interrogés : ${fetched}`);
  console.log(`   - Enregistrés (${year}) : ${saved}`);
  console.log(`   - Hors année (ignorés) : ${skippedYear}`);
  console.log(`   - 404 : ${notFound}`);
  console.log(`   - Erreurs : ${errors}`);
  console.log(`   - Projets associés : ${Object.keys(projectsMap).length}`);

  return { metadata, data: deliveries };
}

module.exports = syncDeliveriesYear;

if (require.main === module) {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  syncDeliveriesYear(options)
    .then(() => {
      console.log('\n✅ Sync annuelle terminée.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale :', error.message);
      process.exit(1);
    });
}
