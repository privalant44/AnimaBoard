/**
 * Helper partagé : réinitialiser les données timesheets en KV puis recharger une fenêtre temporelle.
 *
 * La fenêtre est volontairement limitée (par défaut "6 mois") pour éviter timeouts côté Vercel.
 */
const kvStorage = require('./kvStorage');
const { KV_KEYS } = require('./constants');

async function resetTimesheetsWindow({ monthsBack = 6 } = {}) {
  if (!KV_KEYS?.TIMESHEETS_DATA || !KV_KEYS?.TIMESHEETS_AGGREGATE) {
    throw new Error('Configuration KV manquante (TIMESHEETS_DATA/TIMESHEETS_AGGREGATE).');
  }

  await kvStorage.del(KV_KEYS.TIMESHEETS_DATA);
  await kvStorage.del(KV_KEYS.TIMESHEETS_AGGREGATE);

  // Reproduit la logique existante : "6 derniers mois" = on remonte de 5 mois
  const now = new Date();
  const startOffsetMonths = Math.max(1, monthsBack) - 1;
  const windowStart = new Date(now.getFullYear(), now.getMonth() - startOffsetMonths, 1);

  const startMonth = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, '0')}`;
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Lazy require : évite de charger heavy modules si l'appel n'est jamais fait.
  const syncTimesheets = require('../sync_timesheets');
  const result = await syncTimesheets(startMonth, endMonth);

  return {
    startMonth,
    endMonth,
    count: result?.metadata?.totalTimesheets ?? 0,
    totalEntries: result?.metadata?.totalEntries ?? 0,
  };
}

module.exports = { resetTimesheetsWindow };

