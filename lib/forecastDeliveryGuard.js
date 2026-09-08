/**
 * Interdit la saisie forecast sur un mois strictement après la fin de prestation.
 * @param {string} monthYm - mois au format YYYY-MM
 * @param {string|null|undefined} endDateYmd - date de fin prestation (YYYY-MM-DD ou préfixe)
 * @returns {boolean}
 */
function isMonthBeyondDeliveryEnd(monthYm, endDateYmd) {
  if (!endDateYmd || !monthYm) return false;
  const endYm = String(endDateYmd).slice(0, 7);
  const month = String(monthYm).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}$/.test(endYm)) return false;
  return month > endYm;
}

/**
 * @param {object} kvStorage
 * @param {object} KV_KEYS
 * @param {string|number} deliveryId
 * @returns {Promise<string|null>}
 */
async function getDeliveryEndDate(kvStorage, KV_KEYS, deliveryId) {
  try {
    const { getSupabase } = require('./supabaseClient');
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('deliveries')
      .select('end_date')
      .eq('id', deliveryId)
      .maybeSingle();
    if (!error && data) {
      return data.end_date || null;
    }
  } catch (_) {
    // Repli sur le cache KV ci-dessous.
  }

  const stored = await kvStorage.get(KV_KEYS.DELIVERIES, null);
  const rows = stored?.data || stored;
  if (!Array.isArray(rows)) return null;
  const id = String(deliveryId);
  const delivery = rows.find((d) => String(d.id) === id);
  return delivery?.endDate || delivery?.end_date || null;
}

module.exports = {
  isMonthBeyondDeliveryEnd,
  getDeliveryEndDate,
};
