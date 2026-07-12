const { getSupabase } = require('./supabaseClient');

const META_KEY = 'treasury_plan_settings';

const DEFAULT_SETTINGS = Object.freeze({
  averagePaymentDelayDays: 30,
  initialBalance: 0,
});

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeYear(yearLike, fallback = new Date().getFullYear()) {
  const y = parseInt(String(yearLike), 10);
  if (Number.isNaN(y) || y < 2000 || y > 2100) return fallback;
  return y;
}

function normalizeSettings(raw) {
  const delay = parseInt(String(raw?.averagePaymentDelayDays ?? DEFAULT_SETTINGS.averagePaymentDelayDays), 10);
  const balance = Number(raw?.initialBalance ?? DEFAULT_SETTINGS.initialBalance);
  return {
    averagePaymentDelayDays: Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 365) : DEFAULT_SETTINGS.averagePaymentDelayDays,
    initialBalance: Number.isFinite(balance) ? round2(balance) : DEFAULT_SETTINGS.initialBalance,
  };
}

function paymentDelayToMonthShift(delayDays) {
  return Math.max(0, Math.round((Number(delayDays) || 0) / 30));
}

function shiftMonthKey(monthKey, monthShift) {
  const parts = String(monthKey || '').split('-');
  if (parts.length < 2) return monthKey;
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  if (Number.isNaN(year) || Number.isNaN(month)) return monthKey;

  month -= monthShift;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${pad2(month)}`;
}

async function getTreasuryPlanSettings() {
  const supabase = getSupabase();
  if (!supabase) return { ...DEFAULT_SETTINGS };

  const { data, error } = await supabase
    .from('app_metadata')
    .select('value')
    .eq('key', META_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeSettings(data?.value || DEFAULT_SETTINGS);
}

async function saveTreasuryPlanSettings(input) {
  const supabase = getSupabase();
  if (!supabase) {
    const err = new Error('Supabase non configuré');
    err.status = 503;
    throw err;
  }

  const settings = normalizeSettings(input);
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('app_metadata')
    .upsert({ key: META_KEY, value: settings, updated_at: updatedAt });
  if (error) throw error;
  return settings;
}

function buildCaByMonthFromRecap(recap) {
  const map = new Map();
  (recap?.monthly || []).forEach((row) => {
    const month = String(row.month || '');
    if (!month) return;
    const ca = round2((Number(row.caAnimaNeo) || 0) + (Number(row.caSousTraitance) || 0));
    map.set(month, ca);
  });
  return map;
}

async function getTreasuryPlanData(yearLike, scenario, dashboardService) {
  const year = normalizeYear(yearLike);
  const settings = await getTreasuryPlanSettings();
  const monthShift = paymentDelayToMonthShift(settings.averagePaymentDelayDays);

  const recap = await dashboardService.getHomeMonthlyRecap(year, scenario);
  const caByMonth = buildCaByMonthFromRecap(recap);

  let extendedCaByMonth = caByMonth;
  if (monthShift > 0) {
    const prevRecap = await dashboardService.getHomeMonthlyRecap(year - 1, scenario);
    extendedCaByMonth = new Map(buildCaByMonthFromRecap(prevRecap));
    caByMonth.forEach((value, key) => extendedCaByMonth.set(key, value));
  }

  const supabase = getSupabase();
  const chargesByMonth = new Map();
  if (supabase) {
    const { data: incomeRows, error } = await supabase
      .from('pennylane_income_statement_monthly')
      .select('month, charges')
      .eq('year', year)
      .order('month', { ascending: true });
    if (error) throw error;
    (incomeRows || []).forEach((row) => {
      chargesByMonth.set(String(row.month || ''), round2(Number(row.charges) || 0));
    });
  }

  let runningBalance = settings.initialBalance;
  const monthly = (recap.monthly || []).map((row) => {
    const month = String(row.month || '');
    const sourceMonth = shiftMonthKey(month, monthShift);
    const shiftedCa = extendedCaByMonth.get(sourceMonth) || 0;
    const charges = chargesByMonth.get(month) || 0;
    runningBalance = round2(runningBalance + shiftedCa - charges);
    return {
      month,
      sourceMonth,
      shiftedCa,
      charges,
      treasuryBalance: runningBalance,
    };
  });

  return {
    year,
    settings,
    monthly,
    meta: {
      monthShift,
      averagePaymentDelayDays: settings.averagePaymentDelayDays,
      initialBalance: settings.initialBalance,
      shiftedCaFormula:
        'CA encaissé du mois M = CA forecast (Anima Néo + sous-traitance) du mois source, décalé de round(délai_paiement_jours / 30) mois',
      treasuryBalanceFormula:
        'Solde cumulé = solde initial + Σ (CA encaissé − charges Pennylane) mois par mois',
      chargesSource: 'pennylane_income_statement_monthly.charges',
    },
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  META_KEY,
  normalizeSettings,
  paymentDelayToMonthShift,
  shiftMonthKey,
  getTreasuryPlanSettings,
  saveTreasuryPlanSettings,
  getTreasuryPlanData,
};
