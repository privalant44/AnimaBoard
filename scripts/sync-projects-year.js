/**
 * Sync incrémentale des projets Boond créés sur une année civile.
 *
 * Stratégie (par défaut) :
 * 1. Re-fetch les projets déjà en base avec creation_date sur l'année cible
 * 2. Re-fetch les projets en base sans creation_date (backfill dates Boond)
 * 3. Scanner les nouveaux IDs Boond (max(id) en base + 1 → dernier ID existant)
 * 4. Upsert uniquement les projets dont creationDate tombe dans l'année
 *
 * Usage:
 *   node scripts/sync-projects-year.js
 *   node scripts/sync-projects-year.js --year=2026
 *   node scripts/sync-projects-year.js --year=2026 --full-scan
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const { getSupabase } = require('../lib/supabaseClient');
const kvStorage = require('../lib/kvStorage');
const { hasTableColumn, isMissingColumnError } = require('../lib/supabaseSchema');
const { KV_KEYS } = require('../lib/constants');
const {
  DEFAULT_BASE_URL,
  PROJECTS_START_ID,
  getBoondAuthConfig,
  isCreationInYear,
  findMaxProjectId,
  fetchProject,
} = require('../lib/projectBoond');

function parseArgs(argv) {
  const options = {
    year: new Date().getFullYear(),
    fullScan: false,
    scanNew: true,
    startId: PROJECTS_START_ID || 1,
    endId: null,
    delayMs: 200,
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
  }

  if (!Number.isFinite(options.year)) {
    throw new Error(`Année invalide : ${options.year}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Sync des projets Boond créés sur une année civile.

  node scripts/sync-projects-year.js [options]

Options:
  --year=YYYY       Année cible (défaut : année courante)
  --full-scan       Parcourt toute la plage d'IDs (lent)
  --no-scan-new     IDs déjà en base pour l'année uniquement
  --start-id=N      Borne basse (défaut : 1)
  --end-id=N        Borne haute (défaut : auto)
  --delay=MS        Pause entre appels Boond (défaut : 200)
  -h, --help        Cette aide
`);
}

async function getProjectIdsWithNullCreationDate() {
  const supabase = getSupabase();
  if (!supabase) return [];
  if (!(await hasTableColumn('projects', 'creation_date'))) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .is('creation_date', null)
    .order('id');

  if (error) {
    if (isMissingColumnError(error)) return [];
    throw error;
  }
  return (data || []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

async function getProjectIdsFromDbForYear(year) {
  const supabase = getSupabase();
  if (!supabase) return [];
  if (!(await hasTableColumn('projects', 'creation_date'))) return [];

  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;
  const { data, error } = await supabase
    .from('projects')
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

async function getMaxProjectIdFromDb() {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('projects')
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

  return ids;
}

function toProjectSaveRow(project) {
  return {
    id: project.id,
    project: project.raw || project,
    deliveries: [],
    creationDate: project.creationDate,
    updateDate: project.updateDate,
    reference: project.reference,
    name: project.name,
    state: project.state,
    startDate: project.startDate,
    endDate: project.endDate,
    clientName: project.clientName,
  };
}

async function saveProjects(projects, metadata) {
  if (projects.length === 0) return;

  await kvStorage.set(
    KV_KEYS.PROJECTS,
    projects.map(toProjectSaveRow)
  );

  console.log(`\n💾 ${projects.length} projet(s) enregistré(s) (metadata: ${metadata.method})`);
}

async function syncProjectsYear(options = {}) {
  const email = process.env.BOOND_EMAIL;
  const password = process.env.BOOND_PASSWORD;
  if (!email || !password) {
    throw new Error('BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
  }

  const config = getBoondAuthConfig(email, password);
  const baseURL = DEFAULT_BASE_URL;
  const year = options.year;

  console.log(`\n🚀 Sync projets Boond — créés en ${year}\n`);
  console.log('='.repeat(72));

  const endId =
    options.endId ??
    (await findMaxProjectId(config, baseURL, {
      low: options.startId,
      high: options.endId ?? undefined,
      delayMs: options.delayMs,
    }));

  const [idsFromDb, idsWithNullDates, maxDbId] = await Promise.all([
    getProjectIdsFromDbForYear(year),
    getProjectIdsWithNullCreationDate(),
    getMaxProjectIdFromDb(),
  ]);

  const idsToFetch = buildIdSet(options, endId, maxDbId, [
    ...idsFromDb,
    ...idsWithNullDates,
  ]);
  const sortedIds = [...idsToFetch].sort((a, b) => a - b);

  console.log(`📡 Plage Boond détectée : ${options.startId} → ${endId}`);
  console.log(`📦 En base pour ${year} : ${idsFromDb.length} projet(s)`);
  if (idsWithNullDates.length > 0) {
    console.log(`⚠️  Sans creation_date en base : ${idsWithNullDates.length} (backfill Boond)`);
  }
  console.log(`🔎 IDs à interroger : ${sortedIds.length}`);
  if (options.fullScan) console.log('   (mode full-scan)');
  else if (!options.scanNew) console.log('   (mode no-scan-new)');
  else console.log(`   (refresh base + scan ${Math.max(options.startId, maxDbId + 1)} → ${endId})`);
  console.log('');

  const projects = [];
  let fetched = 0;
  let saved = 0;
  let skippedYear = 0;
  let notFound = 0;
  let errors = 0;

  for (const id of sortedIds) {
    fetched += 1;
    try {
      const result = await fetchProject(config, baseURL, id);
      if (result.status === 404) {
        notFound += 1;
      } else if (result.project) {
        if (isCreationInYear(result.project.creationDate, year)) {
          projects.push(result.project);
          saved += 1;
          if (saved % 10 === 0) {
            console.log(`   ✅ ${saved} projet(s) ${year} enregistré(s) (dernier ID ${id})`);
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
    method: 'sync-projects-year',
    baseURL: `${baseURL}/projects/{id}`,
    targetYear: year,
    idRange: `${options.startId}-${endId}`,
    idsRequested: sortedIds.length,
    idsFetched: fetched,
    savedCount: saved,
    skippedOtherYear: skippedYear,
    notFoundCount: notFound,
    errorCount: errors,
    idsFromDbCount: idsFromDb.length,
    idsNullCreationDateCount: idsWithNullDates.length,
    fullScan: options.fullScan,
    scanNew: options.scanNew,
  };

  await saveProjects(projects, metadata);

  console.log('\n📊 Terminé');
  console.log(`   - IDs interrogés : ${fetched}`);
  console.log(`   - Enregistrés (${year}) : ${saved}`);
  console.log(`   - Hors année (ignorés) : ${skippedYear}`);
  console.log(`   - 404 : ${notFound}`);
  console.log(`   - Erreurs : ${errors}`);

  return { metadata, data: projects };
}

module.exports = syncProjectsYear;

if (require.main === module) {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  syncProjectsYear(options)
    .then(() => {
      console.log('\n✅ Sync annuelle projets terminée.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale :', error.message);
      process.exit(1);
    });
}
