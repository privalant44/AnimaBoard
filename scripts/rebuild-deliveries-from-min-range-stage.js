/**
 * Reconstruction `public.deliveries` à partir de BoondManager, via une table de staging.
 *
 * Étapes :
 * 1) MIN(id) dans `public.deliveries` (DB)
 * 2) MAX(id) existant côté Boond (GET /deliveries/{id})
 * 3) Vide entièrement `public.deliveries_stage` au début
 * 4) Insert dans `public.deliveries_stage` (conservée à la fin pour inspection)
 * 5) Upsert dans `public.deliveries` (mise à jour / insert, sans suppression)
 *
 * Usage :
 *   node scripts/rebuild-deliveries-from-min-range-stage.js
 * Options utiles :
 *   --min-id=123 --max-id=323 --delay=100
 *   --skip-stage-truncate   Ne pas vider deliveries_stage au début
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const { getSupabase } = require('../lib/supabaseClient');
const { DEFAULT_BASE_URL, getBoondAuthConfig, findMaxDeliveryId, fetchDelivery } = require('../lib/deliveryBoond');

function parseArgs(argv) {
  const opts = {
    minIdFromDb: true,
    minId: null,
    maxId: null,
    delayMs: 150,
    skipStageTruncate: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--min-id-from-db') opts.minIdFromDb = true;
    else if (arg.startsWith('--min-id=')) {
      opts.minIdFromDb = false;
      opts.minId = Number(arg.slice('--min-id='.length));
    } else if (arg.startsWith('--max-id=')) {
      opts.maxId = Number(arg.slice('--max-id='.length));
    } else if (arg.startsWith('--delay=')) opts.delayMs = Number(arg.slice('--delay='.length));
    else if (arg === '--skip-stage-truncate' || arg === '--skip-stage-delete') opts.skipStageTruncate = true;
  }

  if (!Number.isFinite(opts.delayMs)) opts.delayMs = 150;
  return opts;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dedupeRowsById(rows) {
  const byId = new Map();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()];
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min} min ${rem} s`;
}

function mapDeliveryToDeliveriesRow(d) {
  const nowIso = new Date().toISOString();
  return {
    id: Number(d.id),
    reference: null,
    title: d.title || '',
    tjm: d.tjm != null ? Number(d.tjm) : null,
    start_date: d.startDate || null,
    end_date: d.endDate || null,
    project_id: d.projectId != null ? Number(d.projectId) : null,
    resource_id: d.resourceId != null ? Number(d.resourceId) : null,
    resource_first_name: null,
    resource_last_name: null,
    state: d.state ?? null,
    ordered_days: d.orderedDays != null ? Number(d.orderedDays) : null,
    raw: {},
    synced_at: nowIso,
    average_daily_cost: d.averageDailyCost != null ? Number(d.averageDailyCost) : null,
    creation_date: d.creationDate || null,
    update_date: d.updateDate || null,
  };
}

async function getMinDeliveryId(supabase) {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.id == null) return null;
  const n = Number(data.id);
  return Number.isFinite(n) ? n : null;
}

async function truncateDeliveriesStage(supabase) {
  const { error: rpcError } = await supabase.rpc('clear_deliveries_stage');
  if (!rpcError) return;

  // Migration RPC absente : fallback delete filtré
  if (rpcError.code !== '42883' && !/clear_deliveries_stage/i.test(rpcError.message || '')) {
    console.warn('⚠️  clear_deliveries_stage indisponible, fallback delete:', rpcError.message);
  }

  const { error: deleteError } = await supabase.from('deliveries_stage').delete().not('id', 'is', null);
  if (deleteError) throw deleteError;
}

async function run() {
  const opts = parseArgs(process.argv);
  const startedMs = Date.now();

  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');

  const email = process.env.BOOND_EMAIL;
  const password = process.env.BOOND_PASSWORD;
  if (!email || !password) throw new Error('BOOND_EMAIL et BOOND_PASSWORD requis (ou BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY).');

  const config = getBoondAuthConfig(email, password);
  const baseURL = DEFAULT_BASE_URL;

  const minId =
    Number.isFinite(opts.minId) && opts.minId > 0
      ? opts.minId
      : opts.minIdFromDb
        ? (await getMinDeliveryId(supabase)) ?? 1
        : 1;

  const maxId =
    Number.isFinite(opts.maxId) && opts.maxId > 0
      ? opts.maxId
      : await findMaxDeliveryId(config, baseURL, { low: minId, delayMs: opts.delayMs });

  if (!Number.isFinite(minId) || !Number.isFinite(maxId)) {
    throw new Error(`minId/maxId invalides (minId=${String(minId)}, maxId=${String(maxId)})`);
  }
  if (maxId < minId) throw new Error(`maxId (${maxId}) < minId (${minId})`);

  console.log(`\n🚧 Rebuild deliveries [${minId}..${maxId}] (stage -> deliveries)\n`);
  console.log(`- delayMs: ${opts.delayMs} ms`);

  if (!opts.skipStageTruncate) {
    console.log('🗑️  Vidage complet de deliveries_stage…');
    await truncateDeliveriesStage(supabase);
  } else {
    console.log('- stage truncate: ignoré (--skip-stage-truncate)');
  }

  // 1) Fetch Boond deliveries
  const stageRows = [];
  let fetched = 0;
  let notFound = 0;
  let errors = 0;

  for (let id = minId; id <= maxId; id += 1) {
    fetched += 1;
    try {
      const result = await fetchDelivery(config, baseURL, id);
      if (result.status === 404) {
        notFound += 1;
      } else if (result.delivery) {
        stageRows.push(mapDeliveryToDeliveriesRow(result.delivery));
      }
    } catch (e) {
      errors += 1;
      if (errors <= 10) console.error(`   ❌ id ${id}:`, e.message || String(e));
    }

    if (opts.delayMs > 0) await new Promise((r) => setTimeout(r, opts.delayMs));
  }

  const uniqueRows = dedupeRowsById(stageRows);
  if (uniqueRows.length !== stageRows.length) {
    console.warn(`⚠️  ${stageRows.length - uniqueRows.length} doublon(s) d'ID ignoré(s) avant écriture.`);
  }

  console.log(
    `\n📦 Boond: ids interrogés=${fetched}, delivery trouvées=${uniqueRows.length}, 404=${notFound}, erreurs=${errors}`
  );
  if (uniqueRows.length === 0) {
    const durationMs = Date.now() - startedMs;
    console.warn(`Aucune delivery trouvée => aucune mise à jour DB. Durée: ${formatDuration(durationMs)}`);
    return { minId, maxId, stageUpserted: 0, mainUpserted: 0, durationMs };
  }

  // 2) Upsert stage (conservée à la fin pour inspection)
  const stageChunks = chunk(uniqueRows, 500);
  for (const c of stageChunks) {
    const { error: insStageErr } = await supabase.from('deliveries_stage').upsert(c, { onConflict: 'id' });
    if (insStageErr) throw insStageErr;
  }

  // 3) Main upsert (aucune suppression dans deliveries)
  for (const c of stageChunks) {
    const { error: upsertErr } = await supabase.from('deliveries').upsert(c, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
  }

  const durationMs = Date.now() - startedMs;
  console.log(
    `\n✅ Terminé en ${formatDuration(durationMs)}: stageUpserted=${uniqueRows.length}, mainUpserted=${uniqueRows.length}` +
      ` (deliveries_stage conservée: ${uniqueRows.length} ligne(s))\n`
  );
  return { minId, maxId, stageUpserted: uniqueRows.length, mainUpserted: uniqueRows.length, durationMs };
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ rebuild deliveries error:', err?.message || err);
    process.exit(1);
  });

