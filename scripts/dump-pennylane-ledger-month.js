/**
 * Visualise toutes les lignes d’écritures Pennylane d’un mois (GET /ledger_entry_lines, comme l’export PowerShell).
 *
 * Par défaut : toutes les lignes de tous les comptes.
 *
 * PowerShell (racine AnimaBoard) :
 *   .\scripts\dump-pennylane-ledger-month.ps1 -Year 2026 -Month 1
 *   .\scripts\dump-pennylane-ledger-month.ps1 2026 1
 *
 * Node :
 *   node scripts/dump-pennylane-ledger-month.js 2026 1
 *   npm run dump-ledger-month -- 2026 1
 *
 * Options :
 *   --pl-only       n’affiche que les lignes P&L (6 / 7 ou préfixes .env)
 *   --with-summary  ajoute synthèses P&L / par compte et champs d’agrégation dans le JSON
 *   --json=path     export JSON (détail ligne à ligne ; agrégats seulement avec --with-summary)
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('../lib/secretEnv');

const pennylaneService = require('../server/services/pennylaneService');

function fmtFr(n) {
  if (n == null || n === '') return '';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function argJsonPath(argv) {
  const raw = argv.find((a) => a.startsWith('--json='));
  if (!raw) return null;
  return raw.slice('--json='.length).replace(/^["']|["']$/g, '');
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const jsonOut = argJsonPath(rawArgv);
  const argv = rawArgv.filter((a) => !a.startsWith('--json='));

  const plOnly = argv.includes('--pl-only');
  const withSummary = argv.includes('--with-summary');
  const pos = argv.filter((a) => a !== '--pl-only' && a !== '--with-summary');
  const year = parseInt(pos[0] || new Date().getFullYear(), 10);
  const month = parseInt(pos[1] || new Date().getMonth() + 1, 10);

  if (!process.env.PENNYLANE_API_KEY) {
    console.error('PENNYLANE_API_KEY manquant dans .env');
    process.exit(1);
  }

  console.error('Chargement Pennylane via API (peut prendre une ou plusieurs minute(s))…');
  const data = await pennylaneService.debugExportLedgerMonth(year, month, {
    includeAllAccounts: !plOnly,
    includeAggregation: withSummary,
  });

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(data, null, 2), 'utf8');
    console.error(`JSON écrit : ${path.resolve(jsonOut)}`);
  }

  const mode = plOnly ? 'lignes P&L uniquement (6/7 ou préfixes .env)' : 'toutes les lignes (tous comptes), sans agrégation';
  console.log('=== Lignes d’écritures Pennylane (ledger_entry_lines) ===');
  console.log(`Période : ${data.period.startDate} → ${data.period.endDate}`);
  console.log(`Mode    : ${mode}${withSummary ? ' + synthèses (--with-summary)' : ''}`);
  console.log(`Pièces  : ${data.entriesCount} | Lignes : ${data.linesTotalAllAccounts} (affichées : ${data.linesReported})`);
  if (withSummary && data.env) {
    console.log('Variables .env (filtre API / P&L) :', JSON.stringify(data.env, null, 2));
    if (data.accountFilter) console.log('Filtre P&L :', data.accountFilter);
  }
  if (withSummary && data.totalsFromSumRows) {
    console.log('');
    console.log('--- Synthèse P&L (indicatif) ---');
    console.log(`  Charges (6) : ${fmtFr(data.totalsFromSumRows.chargesExploitationClasse6)}`);
    console.log(`  Produits (7): ${fmtFr(data.totalsFromSumRows.produitsClasse7)}`);
    console.log(`  Résultat    : ${fmtFr(data.totalsFromSumRows.resultat)}`);
  }
  console.log('');
  console.log('=== Liste des écritures (une ligne par pièce) ===');
  console.log(
    ['entry_id', 'date', 'statut', 'n_piece', 'n_facture', 'journal', 'nb_lignes', 'libelle_piece'].join('\t')
  );
  for (const e of data.entriesSummary || []) {
    console.log(
      [
        e.id ?? '',
        e.date ?? '',
        String(e.status ?? '').replace(/\t/g, ' '),
        String(e.pieceNumber ?? '').replace(/\t/g, ' '),
        String(e.invoiceNumber ?? '').replace(/\t/g, ' '),
        String(e.journal ?? '').replace(/\t/g, ' '),
        e.lineCount ?? 0,
        String(e.label || '').replace(/\t/g, ' '),
      ].join('\t')
    );
  }

  if (withSummary && data.byAccount && Object.keys(data.byAccount).length > 0) {
    console.log('');
    console.log('=== Synthèse par compte P&L (6/7, ce mois) ===');
    console.log(['compte', 'lignes', 'charges', 'produits'].join('\t'));
    for (const acc of Object.keys(data.byAccount).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )) {
      const b = data.byAccount[acc];
      console.log([acc, b.lineCount, fmtFr(b.charges), fmtFr(b.produits)].join('\t'));
    }
  }

  const showImpactCols = withSummary || plOnly;
  console.log('');
  console.log(
    showImpactCols
      ? '=== Détail des lignes (TSV) — avec impacts P&L par ligne si applicable ==='
      : '=== Détail des lignes (TSV) — une ligne par mouvement, sans agrégation ==='
  );
  const header = [
    'ledger_line_id',
    'entry_id',
    'date_piece',
    'statut_piece',
    'libelle_piece',
    'n_ligne',
    'nb_lignes_piece',
    'journal',
    'compte',
    'classe',
    'debit',
    'credit',
    ...(showImpactCols ? ['impact_charges_6', 'impact_produits_7'] : []),
    'libelle_ligne',
  ].join('\t');
  console.log(header);
  for (const r of data.rows) {
    const base = [
      r.ledgerLineId ?? '',
      r.ledgerEntryId ?? '',
      r.entryDate ?? '',
      String(r.entryStatus ?? '').replace(/\t/g, ' '),
      String(r.entryLabel ?? '').replace(/\t/g, ' '),
      r.lineIndex ?? '',
      r.entryLineCount ?? '',
      String(r.journal ?? '').replace(/\t/g, ' '),
      r.accountNumber ?? '',
      r.accountClass ?? '',
      fmtFr(r.debit),
      fmtFr(r.credit),
    ];
    if (showImpactCols) {
      base.push(
        r.impactCharges6 != null ? fmtFr(r.impactCharges6) : '',
        r.impactProduits7 != null ? fmtFr(r.impactProduits7) : ''
      );
    }
    base.push(String(r.label || '').replace(/\t/g, ' '));
    console.log(base.join('\t'));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
