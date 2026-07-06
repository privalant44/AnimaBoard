/**
 * Affiche toutes les données Boond pour une prestation (delivery) et met en évidence
 * les champs susceptibles de porter la marge (TJM, coûts, marges explicites, etc.).
 *
 * Usage:
 *   node scripts/inspect-boond-delivery.js <deliveryId>
 *   node scripts/inspect-boond-delivery.js 42 --save delivery-42.json
 *   node scripts/inspect-boond-delivery.js 42 --db
 *
 * Dépend de .env : BOOND_EMAIL, BOOND_PASSWORD (ou BOOND_PASSWORD_ENC + ANIMA_SECRET_KEY).
 * Option --db : lit aussi la ligne Supabase `deliveries` (colonne raw si présente).
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const axios = require('axios');

const baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';
const email = process.env.BOOND_EMAIL;
const password = process.env.BOOND_PASSWORD;

const MARGIN_KEY_RE =
  /margin|marge|profit|rentab|cost|co[uû]t|price|prix|tjm|tarif|amount|montant|turnover|ca|revenue|fee|rate|daily|journalier|quantity|quantit|days|jours|invoic|factur|excluding|ttc|ht|tax/i;

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = { save: null, db: false, full: false, help: false };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--db') flags.db = true;
    else if (a === '--full') flags.full = true;
    else if (a.startsWith('--save=')) flags.save = a.slice('--save='.length);
    else if (a === '--save') {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags.save = next;
        i += 1;
      } else {
        flags.save = '';
      }
    } else positional.push(a);
  }

  return { flags, deliveryId: positional[0] || null };
}

function printHelp() {
  console.log(`
Inspection d'une prestation BoondManager

  node scripts/inspect-boond-delivery.js <deliveryId> [options]

Options:
  --db              Affiche aussi la ligne Supabase (table deliveries)
  --full            Affiche le JSON Boond complet sur stdout
  --save[=fichier]  Écrit la réponse Boond brute dans un fichier JSON
  -h, --help        Cette aide
`);
}

function boondConfig() {
  return {
    auth: { username: email, password },
    headers: {
      Accept: 'application/hal+json, application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 60000,
    validateStatus: (s) => s < 500,
  };
}

function flattenObject(obj, prefix = '') {
  const out = [];
  if (obj == null || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      out.push(...flattenObject(item, `${prefix}[${i}]`));
    });
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenObject(v, key));
    } else {
      out.push({ key, value: v });
    }
  }
  return out;
}

function numeric(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function section(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function printKeyValueRows(rows, filterRe = null) {
  const list = filterRe ? rows.filter((r) => filterRe.test(r.key)) : rows;
  if (list.length === 0) {
    console.log('  (aucun)');
    return;
  }
  const maxKey = Math.min(60, Math.max(...list.map((r) => r.key.length), 10));
  for (const { key, value } of list.sort((a, b) => a.key.localeCompare(b.key))) {
    const display =
      value != null && typeof value === 'object' ? JSON.stringify(value) : String(value);
    console.log(`  ${key.padEnd(maxKey)}  ${display}`);
  }
}

function computeMarginHints(attributes) {
  const hints = [];
  const priceKeys = [
    'averageDailyPriceExcludingTax',
    'unitPriceExcludingTax',
    'averageDailyPrice',
    'dailyPriceExcludingTax',
    'sellingPrice',
  ];
  const costKeys = [
    'averageDailyCost',
    'contractAverageDailyCost',
    'dailyCostExcludingTax',
    'costExcludingTax',
    'averageCost',
  ];

  let price = null;
  let priceKey = null;
  for (const k of priceKeys) {
    const n = numeric(attributes[k]);
    if (n != null) {
      price = n;
      priceKey = k;
      break;
    }
  }

  for (const costKey of costKeys) {
    const cost = numeric(attributes[costKey]);
    if (price != null && cost != null) {
      hints.push({
        label: `TJM (${priceKey}) − ${costKey}`,
        price,
        cost,
        marginDay: Math.round((price - cost) * 100) / 100,
        marginPct: cost !== 0 ? Math.round(((price - cost) / price) * 10000) / 100 : null,
      });
    }
  }

  const explicitMarginKeys = Object.keys(attributes || {}).filter((k) =>
    /margin|marge|profit|rentab/i.test(k)
  );
  for (const k of explicitMarginKeys) {
    hints.push({ label: `Champ explicite: ${k}`, value: attributes[k] });
  }

  return hints;
}

function summarizeIncluded(included) {
  if (!Array.isArray(included) || included.length === 0) return [];
  const byType = {};
  included.forEach((item) => {
    const t = item.type || 'unknown';
    if (!byType[t]) byType[t] = [];
    byType[t].push(item);
  });
  return Object.entries(byType).map(([type, items]) => ({ type, count: items.length, items }));
}

function whatExtractDeliveriesKeeps(attributes, relationships) {
  const resourceId = relationships?.dependsOn?.data?.id ?? null;
  const projectId = relationships?.project?.data?.id ?? null;
  return {
    id: '(from data.id)',
    type: 'delivery',
    creationDate: attributes.creationDate ?? null,
    updateDate: attributes.updateDate ?? null,
    startDate: attributes.startDate ?? null,
    endDate: attributes.endDate ?? null,
    title: attributes.title ?? null,
    state: attributes.state ?? null,
    tjm: attributes.averageDailyPriceExcludingTax ?? null,
    averageDailyCost: attributes.averageDailyCost ?? null,
    resourceId,
    projectId,
    orderedDays:
      attributes.numberOfDaysInvoicedOrQuantity ??
      attributes.orderedDays ??
      attributes.orderedQuantity ??
      attributes.quantity ??
      attributes.duration ??
      null,
    note: 'extract_deliveries.js ne conserve pas contractAverageDailyCost ni les autres attributs Boond.',
  };
}

async function fetchFromSupabase(deliveryId) {
  const { getSupabase } = require('../lib/supabaseClient');
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' };

  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('id', Number(deliveryId))
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: `Aucune ligne deliveries.id = ${deliveryId}` };
  return { row: data };
}

async function fetchFromBoond(deliveryId) {
  const url = `${baseURL}/deliveries/${deliveryId}`;
  const res = await axios.get(url, boondConfig());

  if (res.status === 404) {
    return { error: `Prestation ${deliveryId} introuvable (404)`, status: 404 };
  }
  if (res.status < 200 || res.status >= 300) {
    const detail =
      res.data?.errors?.[0]?.detail || res.data?.message || JSON.stringify(res.data || res.statusText);
    return { error: `Boond ${res.status}: ${detail}`, status: res.status, body: res.data };
  }

  return { ok: true, url, body: res.data };
}

async function main() {
  const { flags, deliveryId } = parseArgs(process.argv);

  if (flags.help || !deliveryId) {
    printHelp();
    process.exit(deliveryId ? 0 : 1);
  }

  if (!email || !password) {
    console.error('❌ BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis dans .env');
    process.exit(1);
  }

  console.log(`🔍 Prestation Boond #${deliveryId}`);
  console.log(`   API: ${baseURL}/deliveries/${deliveryId}`);
  console.log(`   Auth: ${email}`);

  const boond = await fetchFromBoond(deliveryId);
  if (!boond.ok) {
    console.error('\n❌', boond.error);
    if (boond.body) console.error(JSON.stringify(boond.body, null, 2));
    process.exit(1);
  }

  const payload = boond.body;
  const delivery = payload?.data;
  if (!delivery || delivery.type !== 'delivery') {
    console.error('\n❌ Réponse inattendue (data.type !== delivery)');
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const attributes = delivery.attributes || {};
  const relationships = delivery.relationships || {};
  const included = payload.included || [];
  const flat = flattenObject({ attributes, relationships });

  const defaultSave = path.join(__dirname, '..', `delivery-${deliveryId}-raw.json`);
  const outFile =
    flags.save === null ? null : !flags.save ? defaultSave : flags.save;
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\n💾 Réponse brute enregistrée: ${outFile}`);
  }

  section('Résumé');
  console.log(`  ID:          ${delivery.id}`);
  console.log(`  Titre:       ${attributes.title ?? '(sans titre)'}`);
  console.log(`  Période:     ${attributes.startDate ?? '?'} → ${attributes.endDate ?? '?'}`);
  console.log(`  Statut:      ${attributes.state ?? '?'}`);
  console.log(`  Ressource:   ${relationships.dependsOn?.data?.id ?? '?'}`);
  console.log(`  Projet:      ${relationships.project?.data?.id ?? '?'}`);
  console.log(`  Included:    ${included.length} entité(s)`);

  section('Attributs Boond (data.attributes)');
  printKeyValueRows(
    Object.entries(attributes).map(([key, value]) => ({ key, value }))
  );

  section('Champs liés à marge / prix / coût / quantité (filtrés)');
  printKeyValueRows(flat.filter((r) => r.key.startsWith('attributes.')), MARGIN_KEY_RE);

  section('Marge — calculs et champs explicites');
  const hints = computeMarginHints(attributes);
  if (hints.length === 0) {
    console.log('  Aucun couple TJM/coût reconnu et aucun champ margin/marge/profit dans attributes.');
    console.log('  Parcourez la section « Attributs Boond » ou le JSON --save pour d’autres noms de champs.');
  } else {
    hints.forEach((h) => {
      if (h.value !== undefined) {
        console.log(`  ${h.label}: ${JSON.stringify(h.value)}`);
      } else {
        console.log(
          `  ${h.label}: ${h.price} − ${h.cost} = ${h.marginDay} €/j` +
            (h.marginPct != null ? ` (${h.marginPct}% du TJM)` : '')
        );
      }
    });
  }

  section('Ce que extract_deliveries.js enregistre aujourd’hui');
  console.log(JSON.stringify(whatExtractDeliveriesKeeps(attributes, relationships), null, 2));

  const contractCost = numeric(attributes.contractAverageDailyCost);
  const tjm = numeric(attributes.averageDailyPriceExcludingTax);
  if (contractCost != null && tjm != null) {
    section('Marge journalière (champs CSV test_deliveries — non syncés actuellement)');
    const m = Math.round((tjm - contractCost) * 100) / 100;
    const pct = tjm !== 0 ? Math.round((m / tjm) * 10000) / 100 : null;
    console.log(`  averageDailyPriceExcludingTax (TJM): ${tjm}`);
    console.log(`  contractAverageDailyCost:            ${contractCost}`);
    console.log(`  Marge / jour:                        ${m} €` + (pct != null ? ` (${pct}%)` : ''));
  }

  section('Entités included (résumé)');
  const groups = summarizeIncluded(included);
  if (groups.length === 0) {
    console.log('  (vide)');
  } else {
    for (const g of groups) {
      console.log(`\n  --- ${g.type} (${g.count}) ---`);
      g.items.slice(0, 3).forEach((item) => {
        const a = item.attributes || {};
        const label = a.name || a.title || a.reference || a.firstName || item.id;
        console.log(`    id=${item.id}  ${label}`);
        const marginFields = flattenObject(a).filter((r) => MARGIN_KEY_RE.test(r.key));
        if (marginFields.length > 0) {
          marginFields.slice(0, 8).forEach(({ key, value }) => {
            console.log(`      ${key}: ${value}`);
          });
          if (marginFields.length > 8) console.log(`      … +${marginFields.length - 8} champ(s)`);
        }
      });
      if (g.count > 3) console.log(`    … +${g.count - 3} autre(s)`);
    }
  }

  if (flags.db) {
    section('Supabase — table deliveries');
    const db = await fetchFromSupabase(deliveryId);
    if (db.error) {
      console.log('  ⚠️', db.error);
    } else {
      const { row } = db;
      console.log('  Colonnes normalisées:');
      ['id', 'title', 'tjm', 'start_date', 'end_date', 'project_id', 'resource_id', 'ordered_days', 'state', 'synced_at'].forEach(
        (k) => console.log(`    ${k}: ${row[k] ?? 'null'}`)
      );
      if (row.raw && Object.keys(row.raw).length > 0) {
        console.log('\n  raw (JSON stocké):');
        console.log(JSON.stringify(row.raw, null, 2));
      } else {
        console.log('\n  raw: vide — la sync actuelle ne stocke pas le payload Boond complet.');
      }
    }
  }

  if (flags.full) {
    section('JSON Boond complet');
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('\n💡 Astuce: --full pour le JSON complet, --save=fichier.json pour l’exporter.');
  }
}

main().catch((err) => {
  console.error('\n❌ Erreur:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
