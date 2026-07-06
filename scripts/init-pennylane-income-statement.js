#!/usr/bin/env node
require('dotenv').config();
require('../lib/secretEnv');

const dashboardService = require('../server/services/dashboardService');

function parseYearsArg(argv) {
  const arg = argv.find((a) => a.startsWith('--years='));
  if (!arg) return [2025, 2026];
  const raw = arg.split('=')[1] || '';
  const years = raw
    .split(',')
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 2000 && n <= 2100);
  return years.length > 0 ? years : [2025, 2026];
}

async function run() {
  const years = parseYearsArg(process.argv.slice(2));
  console.log(`🚀 Initialisation compte de résultat pour ${years.join(', ')}...`);
  const result = await dashboardService.syncPennylaneIncomeStatementYears(years);
  result.forEach((row) => {
    console.log(`✅ ${row.year}: ${row.months} mois upsertés (syncedAt=${row.syncedAt})`);
  });
  console.log('🎉 Initialisation terminée.');
}

run().catch((error) => {
  console.error('❌ Échec initialisation compte de résultat:', error.message || error);
  process.exit(1);
});
