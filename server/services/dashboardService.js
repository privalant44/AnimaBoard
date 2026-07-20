const boondManagerService = require('./boondManagerService');
const pennylaneService = require('./pennylaneService');
const { getSupabase } = require('../../lib/supabaseClient');
const { loadDictionaryMaps } = require('../../lib/dictionarySync');
const { getHolidayRowsForYear } = require('../../lib/frenchHolidays');
const { toHolidayYmdString } = require('../../lib/holidayDate');
const {
  getPlannedCaContribution,
  parseScenarioFilter,
} = require('../../lib/plannedDeliveriesService');
const {
  listForecastScenarios,
  formatPlannedScenarioFilterLabel,
} = require('../../lib/forecastScenariosService');
const { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval } = require('date-fns');

const DEFAULT_INCOME_STATEMENT_COMMENT =
  'Données issues de ledger_entry_lines (lignes sur la période), charges = débit−crédit sur comptes 6, produits = crédit−débit sur comptes 7';

function toIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function maxIsoDate(a, b) {
  const da = a ? new Date(a) : null;
  const db = b ? new Date(b) : null;
  if (!da || Number.isNaN(da.getTime())) return b || null;
  if (!db || Number.isNaN(db.getTime())) return a || null;
  return da >= db ? a : b;
}

function normalizeYear(yearLike, fallback = null) {
  const y = parseInt(String(yearLike), 10);
  if (Number.isNaN(y) || y < 2000 || y > 2100) return fallback;
  return y;
}

function normalizeLedgerAccountNumber(s) {
  const t = String(s || '').trim().replace(/\s/g, '');
  const stripped = t.replace(/^0+/, '');
  return stripped.length ? stripped : '0';
}

function produitsSumByAccountPrefix(byAccount, prefix, excludePrefix = null) {
  if (!byAccount || typeof byAccount !== 'object') return 0;
  const p = normalizeLedgerAccountNumber(prefix);
  const ex = excludePrefix ? normalizeLedgerAccountNumber(excludePrefix) : null;
  let sum = 0;
  Object.keys(byAccount).forEach((acc) => {
    const nk = normalizeLedgerAccountNumber(acc);
    if (!nk.startsWith(p)) return;
    if (ex && nk.startsWith(ex)) return;
    sum += Number(byAccount[acc]?.produits) || 0;
  });
  return Math.round(sum * 100) / 100;
}

function chargesSumByAccountPrefix(byAccount, prefix) {
  if (!byAccount || typeof byAccount !== 'object') return 0;
  const p = normalizeLedgerAccountNumber(prefix);
  let sum = 0;
  Object.keys(byAccount).forEach((acc) => {
    const nk = normalizeLedgerAccountNumber(acc);
    if (!nk.startsWith(p)) return;
    sum += Number(byAccount[acc]?.charges) || 0;
  });
  return Math.round(sum * 100) / 100;
}

/**
 * Charges sur un compte Pennylane (ex. 6110000), y compris si agrégé sous un numéro parent (ex. 611).
 */
function chargesSumByLedgerAccountRef(byAccount, accountRef) {
  if (!byAccount || typeof byAccount !== 'object') return 0;
  const ref = normalizeLedgerAccountNumber(accountRef);
  let sum = 0;
  Object.keys(byAccount).forEach((acc) => {
    const nk = normalizeLedgerAccountNumber(acc);
    const matches = nk === ref || nk.startsWith(ref) || ref.startsWith(nk);
    if (!matches) return;
    sum += Number(byAccount[acc]?.charges) || 0;
  });
  return Math.round(sum * 100) / 100;
}

function chargesSumByAnyAccountPrefix(byAccount, prefixes) {
  if (!byAccount || typeof byAccount !== 'object') return 0;
  const ps = (Array.isArray(prefixes) ? prefixes : []).map((p) => normalizeLedgerAccountNumber(p));
  let sum = 0;
  Object.keys(byAccount).forEach((acc) => {
    const nk = normalizeLedgerAccountNumber(acc);
    if (!ps.some((p) => nk.startsWith(p))) return;
    sum += Number(byAccount[acc]?.charges) || 0;
  });
  return Math.round(sum * 100) / 100;
}

function chargesSumAutresClasse6(byAccount, excludePrefixes) {
  if (!byAccount || typeof byAccount !== 'object') return 0;
  const ex = (Array.isArray(excludePrefixes) ? excludePrefixes : []).map((p) =>
    normalizeLedgerAccountNumber(p)
  );
  let sum = 0;
  Object.keys(byAccount).forEach((acc) => {
    const nk = normalizeLedgerAccountNumber(acc);
    if (!nk.startsWith('6')) return;
    if (ex.some((p) => nk.startsWith(p))) return;
    sum += Number(byAccount[acc]?.charges) || 0;
  });
  return Math.round(sum * 100) / 100;
}

/** Compte Pennylane des achats sous-traitance (charges à déduire du CA 70612). */
const SOUS_TRAITANCE_CHARGE_ACCOUNT = '6110000';

function buildPlCategoryBreakdownFromByAccount(byAccount) {
  return {
    caAnimaNeo: produitsSumByAccountPrefix(byAccount, '706', '70612'),
    caSousTraitance: produitsSumByAccountPrefix(byAccount, '70612'),
    sousTraitanceCharges611: chargesSumByLedgerAccountRef(byAccount, SOUS_TRAITANCE_CHARGE_ACCOUNT),
    salaires: chargesSumByAccountPrefix(byAccount, '641'),
    cotisationsSociales: chargesSumByAnyAccountPrefix(byAccount, ['645', '647', '649']),
    autresCharges: chargesSumAutresClasse6(byAccount, ['641', '645', '647', '649']),
  };
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  if (payload?.invoices && Array.isArray(payload.invoices)) return payload.invoices;
  return [];
}

function pickPennylaneDate(record) {
  return (
    record.date ||
    record.invoice_date ||
    record.emission_date ||
    record.issue_date ||
    record.expense_date ||
    record.salary_date ||
    record.accounting_date ||
    record.paid_at ||
    record.created_at ||
    null
  );
}

function pickPennylaneAmount(record) {
  const candidates = [
    record.amount,
    record.total,
    record.total_amount,
    record.amount_excluding_taxes,
    record.amount_excluding_vat,
    record.total_excluding_taxes,
    record.total_excluding_vat,
    record.amount_including_taxes,
    record.total_including_taxes,
  ];
  for (const c of candidates) {
    if (c == null || c === '') continue;
    const n = parseFloat(c);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/** Factures prises en compte pour le CA (excl. brouillons / annulations usuelles). */
function invoiceCountsForRevenue(inv) {
  const s = String(inv.status || inv.state || '').toLowerCase();
  if (!s) return true;
  const excluded = ['draft', 'cancelled', 'canceled', 'void', 'brouillon', 'annul'];
  return !excluded.some((x) => s.includes(x));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthKeyFromDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${pad2(m)}`;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Coût journalier Boond (averageDailyCost) depuis deliveries. */
function deliveryAverageDailyCost(row) {
  if (!row) return null;
  if (row.average_daily_cost != null && row.average_daily_cost !== '') {
    const n = Number(row.average_daily_cost);
    return Number.isFinite(n) ? n : null;
  }
  const raw = row.raw;
  if (raw && typeof raw === 'object') {
    for (const key of ['averageDailyCost', 'averageDailyContractCost']) {
      if (raw[key] != null && raw[key] !== '') {
        const n = Number(raw[key]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

function deliveryTjm(row) {
  if (!row) return null;
  if (row.tjm != null && row.tjm !== '') {
    const n = Number(row.tjm);
    return Number.isFinite(n) ? n : null;
  }
  const raw = row.raw;
  if (raw && typeof raw === 'object' && raw.tjm != null) {
    const n = Number(raw.tjm);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Coût journalier moyen par ressource (moyenne des prestations Boond). */
function buildAverageDailyCostByResource(deliveries) {
  const acc = new Map();
  (deliveries || []).forEach((d) => {
    const resourceId = String(d.resource_id || '');
    const dailyCost = deliveryAverageDailyCost(d);
    if (!resourceId || dailyCost == null || dailyCost <= 0) return;
    if (!acc.has(resourceId)) acc.set(resourceId, { sum: 0, n: 0 });
    const entry = acc.get(resourceId);
    entry.sum += dailyCost;
    entry.n += 1;
  });
  const out = new Map();
  acc.forEach((entry, resourceId) => {
    out.set(resourceId, entry.sum / entry.n);
  });
  return out;
}

function countWorkdaysInMonth(year, month, holidaySet) {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(year, month - 1, d, 12, 0, 0, 0);
    const day = date.getDay();
    if (day === 0 || day === 6) continue;
    const key = `${year}-${pad2(month)}-${pad2(d)}`;
    if (holidaySet.has(key)) continue;
    count += 1;
  }
  return count;
}

class DashboardService {
  buildEmptyPennylaneIncomeStatement(year) {
    const y = normalizeYear(year, new Date().getFullYear());
    return {
      year: y,
      source: 'pennylane',
      method: 'ledger_entry_lines',
      filterAccounts: '',
      description: DEFAULT_INCOME_STATEMENT_COMMENT,
      comments: DEFAULT_INCOME_STATEMENT_COMMENT,
      monthly: [],
      totals: {
        produits: 0,
        charges: 0,
        resultat: 0,
        caAnimaNeo: 0,
        caSousTraitance: 0,
        salaires: 0,
        cotisationsSociales: 0,
        autresCharges: 0,
        dontSousTraitance: 0,
      },
      counts: { months: 0, ledgerLinesClass6Or7: 0 },
      lastSyncAt: null,
    };
  }

  /**
   * Récupère toutes les métriques du tableau de bord
   */
  async getDashboardMetrics(startDate, endDate) {
    try {
      const start = startDate ? parseISO(startDate) : new Date(new Date().getFullYear(), 0, 1);
      const end = endDate ? parseISO(endDate) : new Date();

      console.log('📥 Récupération des données depuis les API...');
      
      // Récupérer les données
      const [resources, timeEntries, invoices, expenses, salaries] = await Promise.all([
        boondManagerService.getResources(),
        boondManagerService.getTimeEntries(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        pennylaneService.getInvoices(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        pennylaneService.getExpenses(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')),
        pennylaneService.getSalaries(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'))
      ]);

      // Normaliser les données (gérer différents formats de réponse)
      const resourcesData = Array.isArray(resources) ? resources : (resources?.data || []);
      const timeEntriesData = Array.isArray(timeEntries) ? timeEntries : (timeEntries?.data || []);
      const invoicesData = toArray(invoices);
      const expensesData = toArray(expenses);
      const salariesData = toArray(salaries);

      // Vérifier que les données sont des tableaux
      if (!Array.isArray(resourcesData)) {
        throw new Error(`Format de données invalide pour resources: ${typeof resourcesData}`);
      }
      if (!Array.isArray(timeEntriesData)) {
        throw new Error(`Format de données invalide pour timeEntries: ${typeof timeEntriesData}`);
      }
      if (!Array.isArray(invoicesData)) {
        throw new Error(`Format de données invalide pour invoices: ${typeof invoicesData}`);
      }
      if (!Array.isArray(expensesData)) {
        throw new Error(`Format de données invalide pour expenses: ${typeof expensesData}`);
      }
      if (!Array.isArray(salariesData)) {
        throw new Error(`Format de données invalide pour salaries: ${typeof salariesData}`);
      }

      console.log(`✅ Données récupérées: ${resourcesData.length} ressources, ${timeEntriesData.length} temps, ${invoicesData.length} factures, ${expensesData.length} charges, ${salariesData.length} salaires`);

      // Calculer les métriques par mois
      const months = eachMonthOfInterval({ start, end });
      console.log(`📅 Calcul des métriques pour ${months.length} mois...`);
      
      const monthlyMetrics = months.map(month => {
        return this.calculateMonthlyMetrics(
          month,
          resourcesData,
          timeEntriesData,
          invoicesData,
          expensesData,
          salariesData
        );
      });

      // Calculer les totaux
      const totals = this.calculateTotals(monthlyMetrics);

      console.log('✅ Métriques calculées avec succès');
      
      return {
        monthly: monthlyMetrics,
        totals
      };
    } catch (error) {
      console.error('❌ Erreur dans getDashboardMetrics:', error);
      throw error;
    }
  }

  /**
   * Calcule les métriques pour un mois donné
   */
  calculateMonthlyMetrics(month, resources, timeEntries, invoices, expenses, salaries) {
    const monthStr = format(month, 'yyyy-MM');
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    // Chiffre d'affaires (factures du mois)
    const monthInvoices = invoices.filter(inv => {
      try {
        const dateStr = pickPennylaneDate(inv);
        if (!dateStr) return false;
        const invDate = parseISO(dateStr);
        if (isNaN(invDate.getTime())) return false;
        return invDate >= monthStart && invDate <= monthEnd && invoiceCountsForRevenue(inv);
      } catch (e) {
        return false;
      }
    });
    const revenue = monthInvoices.reduce((sum, inv) => sum + pickPennylaneAmount(inv), 0);

    // Coût des ressources facturables
    const billableResources = resources.filter(r => r.billable !== false);
    const billableTimeEntries = timeEntries.filter(te => {
      try {
        const dateStr = te.date || te.created_at;
        if (!dateStr) return false;
        const teDate = parseISO(dateStr);
        if (isNaN(teDate.getTime())) return false;
        const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
        return teDate >= monthStart && teDate <= monthEnd && 
               resource && resource.billable !== false;
      } catch (e) {
        return false;
      }
    });
    const billableCost = billableTimeEntries.reduce((sum, te) => {
      const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
      const hourlyRate = resource?.hourlyRate || resource?.hourly_rate || 0;
      const hours = parseFloat(te.hours) || 0;
      return sum + (hourlyRate * hours);
    }, 0);

    // Coût des ressources non facturables
    const nonBillableResources = resources.filter(r => r.billable === false);
    const nonBillableTimeEntries = timeEntries.filter(te => {
      try {
        const dateStr = te.date || te.created_at;
        if (!dateStr) return false;
        const teDate = parseISO(dateStr);
        if (isNaN(teDate.getTime())) return false;
        const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
        return teDate >= monthStart && teDate <= monthEnd && 
               resource && resource.billable === false;
      } catch (e) {
        return false;
      }
    });
    const nonBillableCost = nonBillableTimeEntries.reduce((sum, te) => {
      const resource = resources.find(r => r.id === te.resourceId || r.id === te.resource_id);
      const hourlyRate = resource?.hourlyRate || resource?.hourly_rate || 0;
      const hours = parseFloat(te.hours) || 0;
      return sum + (hourlyRate * hours);
    }, 0);

    // Charges (frais + salaires)
    const monthExpenses = expenses.filter(exp => {
      try {
        const dateStr = pickPennylaneDate(exp);
        if (!dateStr) return false;
        const expDate = parseISO(dateStr);
        if (isNaN(expDate.getTime())) return false;
        return expDate >= monthStart && expDate <= monthEnd;
      } catch (e) {
        return false;
      }
    });
    const expensesAmount = monthExpenses.reduce((sum, exp) => sum + pickPennylaneAmount(exp), 0);

    const monthSalaries = salaries.filter(sal => {
      try {
        const dateStr = pickPennylaneDate(sal);
        if (!dateStr) return false;
        const salDate = parseISO(dateStr);
        if (isNaN(salDate.getTime())) return false;
        return salDate >= monthStart && salDate <= monthEnd;
      } catch (e) {
        return false;
      }
    });
    const salariesAmount = monthSalaries.reduce((sum, sal) => sum + pickPennylaneAmount(sal), 0);

    const totalCharges = expensesAmount + salariesAmount;

    // TACE (Taux d'Activité Coût d'Emploi) = (CA / Coût total des ressources) * 100
    const totalResourceCost = billableCost + nonBillableCost;
    const tace = totalResourceCost > 0 ? (revenue / totalResourceCost) * 100 : 0;

    // TACI (Taux d'Activité Coût d'Intervention) = (CA / Coût ressources facturables) * 100
    const taci = billableCost > 0 ? (revenue / billableCost) * 100 : 0;

    // EBE (Excédent Brut d'Exploitation) = CA - Coût des ressources facturables - Charges
    const ebe = revenue - billableCost - totalCharges;

    // REX (Résultat d'Exploitation) = CA - Coût total des ressources - Charges
    const rex = revenue - totalResourceCost - totalCharges;

    return {
      month: monthStr,
      revenue,
      billableCost,
      nonBillableCost,
      charges: totalCharges,
      tace: parseFloat(tace.toFixed(2)),
      taci: parseFloat(taci.toFixed(2)),
      ebe: parseFloat(ebe.toFixed(2)),
      rex: parseFloat(rex.toFixed(2))
    };
  }

  /**
   * Calcule les totaux sur toutes les périodes
   */
  calculateTotals(monthlyMetrics) {
    return monthlyMetrics.reduce((acc, month) => ({
      revenue: acc.revenue + month.revenue,
      billableCost: acc.billableCost + month.billableCost,
      nonBillableCost: acc.nonBillableCost + month.nonBillableCost,
      charges: acc.charges + month.charges,
      ebe: acc.ebe + month.ebe,
      rex: acc.rex + month.rex
    }), {
      revenue: 0,
      billableCost: 0,
      nonBillableCost: 0,
      charges: 0,
      ebe: 0,
      rex: 0
    });
  }

  /**
   * Récupère le CA par mois
   */
  async getRevenueByMonth(startDate, endDate) {
    const metrics = await this.getDashboardMetrics(startDate, endDate);
    return metrics.monthly.map(m => ({
      month: m.month,
      revenue: m.revenue
    }));
  }

  /**
   * Construit la réponse "Compte de Résultat" depuis les lignes mensuelles stockées.
   */
  buildPennylaneIncomeStatementFromStoredRows(year, rows) {
    const monthly = [];
    let method = 'ledger_entry_lines';
    let filterAccounts = '';
    let lastSyncAt = null;
    let ledgerLinesClass6Or7 = 0;

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const byAccount =
        row && row.by_account && typeof row.by_account === 'object' && !Array.isArray(row.by_account)
          ? row.by_account
          : {};
      method = String(row?.method || method || 'ledger_entry_lines');
      filterAccounts = String(row?.filter_accounts || filterAccounts || '');
      lastSyncAt = maxIsoDate(lastSyncAt, toIsoOrNull(row?.synced_at));

      Object.keys(byAccount).forEach((acc) => {
        ledgerLinesClass6Or7 += Number(byAccount[acc]?.lineCount) || 0;
      });

      monthly.push({
        month: String(row.month || ''),
        entriesCount: Number(row.entries_count) || 0,
        linesCount: Number(row.lines_count) || 0,
        produits: Number(row.produits) || 0,
        charges: Number(row.charges) || 0,
        resultat: Number(row.resultat) || 0,
        caAnimaNeo: Number(row.ca_anima_neo) || 0,
        caSousTraitance: Number(row.ca_sous_traitance) || 0,
        salaires: Number(row.salaires) || 0,
        cotisationsSociales: Number(row.cotisations_sociales) || 0,
        autresCharges: Number(row.autres_charges) || 0,
        dontSousTraitance:
          Object.keys(byAccount).length > 0
            ? chargesSumByLedgerAccountRef(byAccount, SOUS_TRAITANCE_CHARGE_ACCOUNT)
            : Number(row.sous_traitance_charges) || 0,
      });
    });

    monthly.sort((a, b) => a.month.localeCompare(b.month));

    const totals = monthly.reduce(
      (acc, row) => ({
        produits: acc.produits + (Number(row.produits) || 0),
        charges: acc.charges + (Number(row.charges) || 0),
        resultat: acc.resultat + (Number(row.resultat) || 0),
        caAnimaNeo: acc.caAnimaNeo + (Number(row.caAnimaNeo) || 0),
        caSousTraitance: acc.caSousTraitance + (Number(row.caSousTraitance) || 0),
        salaires: acc.salaires + (Number(row.salaires) || 0),
        cotisationsSociales: acc.cotisationsSociales + (Number(row.cotisationsSociales) || 0),
        autresCharges: acc.autresCharges + (Number(row.autresCharges) || 0),
        dontSousTraitance: acc.dontSousTraitance + (Number(row.dontSousTraitance) || 0),
      }),
      {
        produits: 0,
        charges: 0,
        resultat: 0,
        caAnimaNeo: 0,
        caSousTraitance: 0,
        salaires: 0,
        cotisationsSociales: 0,
        autresCharges: 0,
        dontSousTraitance: 0,
      }
    );

    Object.keys(totals).forEach((k) => {
      totals[k] = Math.round(totals[k] * 100) / 100;
    });

    return {
      year,
      source: 'pennylane',
      method,
      filterAccounts,
      description: DEFAULT_INCOME_STATEMENT_COMMENT,
      comments: DEFAULT_INCOME_STATEMENT_COMMENT,
      monthly,
      totals,
      counts: { months: monthly.length, ledgerLinesClass6Or7 },
      lastSyncAt,
    };
  }

  async syncPennylaneIncomeStatement(year) {
    // Contrainte fonctionnelle : la synchronisation standard se fait toujours sur l'année courante.
    const currentYear = new Date().getFullYear();
    const y = currentYear;

    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }

    const data = await pennylaneService.getCompteDeResultat(y);
    const nowIso = new Date().toISOString();
    const rows = (data.monthly || []).map((row) => {
      const breakdown = buildPlCategoryBreakdownFromByAccount(row.byAccount || {});
      return {
        year: y,
        month: String(row.month || ''),
        produits: Number(row.produits) || 0,
        charges: Number(row.charges) || 0,
        resultat: Number(row.resultat) || 0,
        entries_count: Number(row.entriesCount) || 0,
        lines_count: Number(row.linesCount) || 0,
        by_account: row.byAccount || {},
        ca_anima_neo: breakdown.caAnimaNeo,
        ca_sous_traitance: breakdown.caSousTraitance,
        salaires: breakdown.salaires,
        cotisations_sociales: breakdown.cotisationsSociales,
        autres_charges: breakdown.autresCharges,
        sous_traitance_charges: breakdown.sousTraitanceCharges611,
        method: data.method || 'ledger_entry_lines',
        filter_accounts: data.filterAccounts || '',
        synced_at: nowIso,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from('pennylane_income_statement_monthly')
        .upsert(rows, { onConflict: 'year,month' });
      if (error) {
        if (error.code === '42P01') {
          throw new Error(
            'Table public.pennylane_income_statement_monthly absente. Appliquez la migration Supabase.'
          );
        }
        if (error.code === '42703') {
          throw new Error(
            'Colonnes détail compte de résultat absentes. Appliquez la migration 20260602101500_income_statement_detail_columns.sql.'
          );
        }
        throw error;
      }
    }

    return this.buildPennylaneIncomeStatementFromStoredRows(y, rows);
  }

  /**
   * Initialisation / réinitialisation multi-années (ex: 2025, 2026).
   */
  async syncPennylaneIncomeStatementYears(years) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }
    const uniqYears = Array.from(
      new Set((Array.isArray(years) ? years : []).map((y) => normalizeYear(y)).filter((y) => y != null))
    );
    if (uniqYears.length === 0) throw new Error('Aucune année valide fournie');

    const out = [];
    for (const y of uniqYears) {
      const data = await pennylaneService.getCompteDeResultat(y);
      const nowIso = new Date().toISOString();
      const rows = (data.monthly || []).map((row) => {
        const breakdown = buildPlCategoryBreakdownFromByAccount(row.byAccount || {});
        return {
          year: y,
          month: String(row.month || ''),
          produits: Number(row.produits) || 0,
          charges: Number(row.charges) || 0,
          resultat: Number(row.resultat) || 0,
          entries_count: Number(row.entriesCount) || 0,
          lines_count: Number(row.linesCount) || 0,
          by_account: row.byAccount || {},
          ca_anima_neo: breakdown.caAnimaNeo,
          ca_sous_traitance: breakdown.caSousTraitance,
          salaires: breakdown.salaires,
          cotisations_sociales: breakdown.cotisationsSociales,
          autres_charges: breakdown.autresCharges,
          sous_traitance_charges: breakdown.sousTraitanceCharges611,
          method: data.method || 'ledger_entry_lines',
          filter_accounts: data.filterAccounts || '',
          synced_at: nowIso,
        };
      });
      if (rows.length > 0) {
        const { error } = await supabase
          .from('pennylane_income_statement_monthly')
          .upsert(rows, { onConflict: 'year,month' });
        if (error) {
          if (error.code === '42703') {
            throw new Error(
              'Colonnes détail compte de résultat absentes. Appliquez la migration 20260602101500_income_statement_detail_columns.sql.'
            );
          }
          throw error;
        }
      }
      out.push({ year: y, months: rows.length, syncedAt: nowIso });
    }
    return out;
  }

  /**
   * Lit le compte de résultat depuis la table mensuelle; synchronise automatiquement si absent.
   */
  async getPennylaneIncomeStatement(year) {
    const y = year != null ? parseInt(String(year), 10) : new Date().getFullYear();
    if (Number.isNaN(y) || y < 2000 || y > 2100) throw new Error('Année invalide');

    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }

    const { data: rows, error } = await supabase
      .from('pennylane_income_statement_monthly')
      .select(
        'year, month, produits, charges, resultat, entries_count, lines_count, by_account, ca_anima_neo, ca_sous_traitance, salaires, cotisations_sociales, autres_charges, sous_traitance_charges, method, filter_accounts, synced_at'
      )
      .eq('year', y)
      .order('month', { ascending: true });

    if (error) throw error;
    if (!rows || rows.length === 0) return this.buildEmptyPennylaneIncomeStatement(y);

    return this.buildPennylaneIncomeStatementFromStoredRows(y, rows);
  }

  async getHomeMonthlyRecap(year, scenarioFilter = 'all') {
    const y = normalizeYear(year, new Date().getFullYear());
    const plannedScenarioFilter = parseScenarioFilter(scenarioFilter);
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }

    const months = Array.from({ length: 12 }, (_, i) => {
      const month = `${y}-${pad2(i + 1)}`;
      return {
        month,
        caAnimaNeo: 0,
        caSousTraitance: 0,
        margeBruteAnimaNeo: 0,
        margeBruteSousTraitance: 0,
        sousTraitanceCharges611: 0,
        resultat: 0,
        taceBaseDays: 0,
        taceSource: 'actual',
        taceIsClosedMonth: true,
        workdaysInMonth: 0,
        absencesInMonth: 0,
        taceDenominatorDays: 0,
        tacePct: 0,
        besoinsCrees: 0,
        besoinsStock: 0,
        besoinsGagnes: 0,
        besoinsPerdus: 0,
        besoinsAbandonnes: 0,
        besoinsStandBy: 0,
        delaiMoyenReponseDays: 0,
        delaiMoyenReponseCount: 0,
      };
    });
    const monthMap = new Map(months.map((m) => [m.month, m]));

    // 1) Base financière depuis la table compte de résultat mensuelle
    const { data: incomeRows, error: incomeError } = await supabase
      .from('pennylane_income_statement_monthly')
      .select(
        'month, ca_anima_neo, ca_sous_traitance, salaires, cotisations_sociales, autres_charges, resultat, by_account'
      )
      .eq('year', y)
      .order('month', { ascending: true });
    if (incomeError) throw incomeError;

    (incomeRows || []).forEach((row) => {
      const bucket = monthMap.get(String(row.month || ''));
      if (!bucket) return;
      bucket.caAnimaNeo = Number(row.ca_anima_neo) || 0;
      bucket.caSousTraitance = Number(row.ca_sous_traitance) || 0;
      bucket.resultat = Number(row.resultat) || 0;
      // margeBruteAnimaNeo : voir section timesheets ci-dessous
      const byAccount =
        row.by_account && typeof row.by_account === 'object' && !Array.isArray(row.by_account)
          ? row.by_account
          : {};
      const charges611 = chargesSumByLedgerAccountRef(byAccount, SOUS_TRAITANCE_CHARGE_ACCOUNT);
      bucket.sousTraitanceCharges611 = round2(charges611);
      // margeBruteSousTraitance : voir section timesheets ci-dessous
    });

    // 2) TACE constaté mensuel:
    // TACE(%) = somme(total_days_prod timesheets_detail du mois) / (jours_ouvres_du_mois * nb_ressources_type_0_3_10) * 100
    const eligibleTypeCodes = new Set(['0', '3', '10']);
    const [resourcesRes, timesheetsRes, forecastRes, deliveriesRes, holidaysRes, absencesRes] =
      await Promise.all([
        supabase.from('resources').select('id,type_of'),
        supabase
          .from('timesheets_detail')
          .select('resource_id,month,delivery_id,total_days_prod')
          .gte('month', `${y}-01`)
          .lte('month', `${y}-12`),
        supabase
          .from('forecast_times')
          .select('delivery_id,month,value')
          .gte('month', `${y}-01`)
          .lte('month', `${y}-12`),
        supabase.from('deliveries').select('id, resource_id, tjm, average_daily_cost, raw'),
        supabase
          .from('french_public_holiday')
          .select('holiday_date')
          .eq('year', y),
        supabase
          .from('absence')
          .select('resource_id,month,days')
          .gte('month', `${y}-01`)
          .lte('month', `${y}-12`),
      ]);
    if (resourcesRes.error) throw resourcesRes.error;
    if (timesheetsRes.error) throw timesheetsRes.error;
    if (forecastRes.error) throw forecastRes.error;
    if (deliveriesRes.error) throw deliveriesRes.error;
    if (holidaysRes.error) throw holidaysRes.error;
    if (absencesRes.error) throw absencesRes.error;

    const dictMaps = await loadDictionaryMaps('resources');
    const typeLabels = dictMaps?.type_of || {};
    const externalTypeCodes = new Set(
      Object.entries(typeLabels)
        .filter(([, label]) => String(label) === 'Consultant.e Externe')
        .map(([code]) => String(code))
    );

    const eligibleResourceIds = new Set(
      (resourcesRes.data || [])
        .filter((r) => {
          const t = r?.type_of == null ? null : String(r.type_of);
          return t != null && eligibleTypeCodes.has(t);
        })
        .map((r) => String(r.id))
    );

    const resourceIsExternal = new Map();
    (resourcesRes.data || []).forEach((r) => {
      const typeCode = r?.type_of == null ? null : String(r.type_of);
      const isExternal = typeCode != null && externalTypeCodes.has(typeCode);
      resourceIsExternal.set(String(r.id), isExternal);
    });

    const holidaySet = new Set();
    (holidaysRes.data || []).forEach((r) => {
      const ymd = toHolidayYmdString(r.holiday_date);
      if (ymd) holidaySet.add(ymd);
    });
    if (holidaySet.size === 0) {
      getHolidayRowsForYear(y).forEach((r) => holidaySet.add(r.holiday_date));
    }

    const actualByMonthResource = new Map();
    const actualByMonthDelivery = new Map();
    const resourcesWithTimesheetsByMonth = new Map();
    (timesheetsRes.data || []).forEach((r) => {
      const month = String(r.month || '');
      const resourceId = String(r.resource_id || '');
      if (!monthMap.has(month) || !eligibleResourceIds.has(resourceId)) return;
      const key = `${month}|${resourceId}`;
      const deliveryId = String(r.delivery_id || '');
      const prodDays = Number(r.total_days_prod) || 0;
      if (deliveryId && deliveryId !== '0') {
        actualByMonthResource.set(key, (actualByMonthResource.get(key) || 0) + prodDays);
        const deliveryKey = `${month}|${deliveryId}`;
        actualByMonthDelivery.set(
          deliveryKey,
          (actualByMonthDelivery.get(deliveryKey) || 0) + prodDays
        );
      }
      if (!resourcesWithTimesheetsByMonth.has(month)) {
        resourcesWithTimesheetsByMonth.set(month, new Set());
      }
      resourcesWithTimesheetsByMonth.get(month).add(resourceId);
    });

    const deliveryToResourceId = new Map();
    const deliveryById = new Map();
    (deliveriesRes.data || []).forEach((d) => {
      const deliveryId = String(d.id || '');
      const resourceId = String(d.resource_id || '');
      if (deliveryId) deliveryById.set(deliveryId, d);
      if (!deliveryId || !resourceId) return;
      deliveryToResourceId.set(deliveryId, resourceId);
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const closedMonthIndexForCurrentYear = now.getMonth(); // 0-based; ex: juillet => 6 (juin clôturé)

    const isClosedMonth = (month) => {
      const monthNum = parseInt(String(month).slice(5, 7), 10);
      return y < currentYear || (y === currentYear && monthNum <= closedMonthIndexForCurrentYear);
    };

    // Marge brute Anima Néo = CA Anima Néo − Σ (total_days_prod × averageDailyCost) par prestation
    const prodCostByMonth = new Map();
    const prodCostExternalByMonth = new Map();
    (timesheetsRes.data || []).forEach((r) => {
      const month = String(r.month || '');
      const resourceId = String(r.resource_id || '');
      const deliveryId = String(r.delivery_id || '');
      if (!monthMap.has(month) || !deliveryId || deliveryId === '0') return;

      const days = Number(r.total_days_prod) || 0;
      if (days <= 0) return;

      const delivery = deliveryById.get(deliveryId);
      const dailyCost = deliveryAverageDailyCost(delivery);
      if (dailyCost == null) return;

      const isExternal = resourceIsExternal.get(resourceId) === true;
      if (isExternal) {
        prodCostExternalByMonth.set(
          month,
          (prodCostExternalByMonth.get(month) || 0) + days * dailyCost
        );
        return;
      }
      if (!eligibleResourceIds.has(resourceId)) return;

      prodCostByMonth.set(month, (prodCostByMonth.get(month) || 0) + days * dailyCost);
    });
    months.forEach((m) => {
      const costInternal = prodCostByMonth.get(m.month) || 0;
      m.margeBruteAnimaNeo = round2(m.caAnimaNeo - costInternal);
      if (isClosedMonth(m.month)) {
        const costExternal = prodCostExternalByMonth.get(m.month) || 0;
        m.sousTraitanceCharges611 = round2(costExternal);
        m.margeBruteSousTraitance = round2(m.caSousTraitance - costExternal);
      }
    });

    const forecastByMonthDelivery = new Map();
    (forecastRes.data || []).forEach((r) => {
      const month = String(r.month || '');
      if (!monthMap.has(month)) return;
      const deliveryId = String(r.delivery_id || '');
      if (!deliveryId) return;

      const value = Number(r.value) || 0;
      if (value <= 0) return;

      const deliveryKey = `${month}|${deliveryId}`;
      forecastByMonthDelivery.set(
        deliveryKey,
        (forecastByMonthDelivery.get(deliveryKey) || 0) + value
      );
    });

    // Mois ouverts : temps saisis + prévisionnels (aligné synthèse Forecast / Report)
    const forecastByMonthResource = new Map();
    const resourcesWithForecastByMonth = new Map();
    const forecastCaInternalByMonth = new Map();
    const forecastCaExternalByMonth = new Map();
    const forecastProdCostInternalByMonth = new Map();
    const forecastProdCostExternalByMonth = new Map();
    const avgDailyCostByResource = buildAverageDailyCostByResource(deliveriesRes.data || []);
    const openMonthDeliveryKeys = new Set();
    forecastByMonthDelivery.forEach((_, key) => {
      const month = key.split('|')[0];
      if (!isClosedMonth(month)) openMonthDeliveryKeys.add(key);
    });
    actualByMonthDelivery.forEach((_, key) => {
      const month = key.split('|')[0];
      if (!isClosedMonth(month)) openMonthDeliveryKeys.add(key);
    });

    openMonthDeliveryKeys.forEach((deliveryKey) => {
      const [month, deliveryId] = deliveryKey.split('|');
      const actualDays = actualByMonthDelivery.get(deliveryKey) || 0;
      const forecastDays = forecastByMonthDelivery.get(deliveryKey) || 0;
      const effectiveDays = actualDays + forecastDays;
      if (effectiveDays <= 0) return;

      const resourceId = deliveryToResourceId.get(deliveryId) || '';
      if (!resourceId) return;

      if (eligibleResourceIds.has(resourceId)) {
        const resourceKey = `${month}|${resourceId}`;
        forecastByMonthResource.set(
          resourceKey,
          (forecastByMonthResource.get(resourceKey) || 0) + effectiveDays
        );
        if (!resourcesWithForecastByMonth.has(month)) {
          resourcesWithForecastByMonth.set(month, new Set());
        }
        resourcesWithForecastByMonth.get(month).add(resourceId);
      }

      const delivery = deliveryById.get(deliveryId);
      const tjm = deliveryTjm(delivery);
      if (tjm == null) return;
      const ca = effectiveDays * tjm;
      const isExternal = resourceIsExternal.get(resourceId) === true;
      const targetMap = isExternal ? forecastCaExternalByMonth : forecastCaInternalByMonth;
      targetMap.set(month, (targetMap.get(month) || 0) + ca);

      const dailyCost = deliveryAverageDailyCost(delivery);
      if (dailyCost != null && dailyCost > 0) {
        const cost = effectiveDays * dailyCost;
        const costMap = isExternal
          ? forecastProdCostExternalByMonth
          : forecastProdCostInternalByMonth;
        costMap.set(month, (costMap.get(month) || 0) + cost);
      }
    });

    const plannedCa = await getPlannedCaContribution({
      year: y,
      scenarioFilter: plannedScenarioFilter,
      eligibleResourceIds,
      resourceIsExternal,
      isOpenMonth: (month) => !isClosedMonth(month),
      averageDailyCostByResource: avgDailyCostByResource,
    });

    let forecastScenarioCatalog = [];
    try {
      forecastScenarioCatalog = await listForecastScenarios();
    } catch (e) {
      console.warn('⚠️ forecast_scenarios:', e.message || e);
    }

    plannedCa.internalByMonth.forEach((ca, month) => {
      forecastCaInternalByMonth.set(month, (forecastCaInternalByMonth.get(month) || 0) + ca);
    });
    plannedCa.externalByMonth.forEach((ca, month) => {
      forecastCaExternalByMonth.set(month, (forecastCaExternalByMonth.get(month) || 0) + ca);
    });

    // Jours prévisionnels manuels (planned_forecast) : aligné synthèse Report / CA prévisionnel
    (plannedCa.daysByMonthResource || new Map()).forEach((days, resourceKey) => {
      const [month, resourceId] = resourceKey.split('|');
      if (!month || !resourceId || isClosedMonth(month) || days <= 0) return;
      forecastByMonthResource.set(
        resourceKey,
        (forecastByMonthResource.get(resourceKey) || 0) + days
      );
      if (!resourcesWithForecastByMonth.has(month)) {
        resourcesWithForecastByMonth.set(month, new Set());
      }
      resourcesWithForecastByMonth.get(month).add(resourceId);
    });

    const absencesByMonthResource = new Map();
    (absencesRes.data || []).forEach((r) => {
      const month = String(r.month || '');
      const resourceId = String(r.resource_id || '');
      if (!monthMap.has(month) || !eligibleResourceIds.has(resourceId)) return;
      const key = `${month}|${resourceId}`;
      absencesByMonthResource.set(
        key,
        (absencesByMonthResource.get(key) || 0) + (Number(r.days) || 0)
      );
    });

    months.forEach((m) => {
      let actualDays = 0;
      let absencesDays = 0;
      const monthClosed = isClosedMonth(m.month);
      const monthlyEligibleResourceIds = monthClosed
        ? (resourcesWithTimesheetsByMonth.get(m.month) || new Set())
        : (resourcesWithForecastByMonth.get(m.month) || new Set());
      const monthlyEligibleCount = monthlyEligibleResourceIds.size;
      monthlyEligibleResourceIds.forEach((resourceId) => {
        const key = `${m.month}|${resourceId}`;
        const baseActualDays = monthClosed
          ? Number(actualByMonthResource.get(key) || 0)
          : Number(forecastByMonthResource.get(key) || 0);
        actualDays += baseActualDays;
        absencesDays += Number(absencesByMonthResource.get(key) || 0);
      });
      const monthNum = parseInt(m.month.slice(5, 7), 10);
      const workdays = countWorkdaysInMonth(y, monthNum, holidaySet);
      const denominatorRaw = workdays * monthlyEligibleCount - absencesDays;
      const denominator = Math.max(0, denominatorRaw);
      m.taceBaseDays = round2(actualDays);
      m.taceSource = monthClosed ? 'actual' : 'forecast';
      m.taceIsClosedMonth = monthClosed;
      m.workdaysInMonth = workdays;
      m.absencesInMonth = round2(absencesDays);
      m.taceDenominatorDays = denominator;
      m.tacePct = denominator > 0 ? round2((actualDays / denominator) * 100) : 0;

      if (!monthClosed) {
        const baseCaTotal = round2(m.caAnimaNeo + m.caSousTraitance);
        const baseResultat = m.resultat;
        const caAnimaNeoForecast = forecastCaInternalByMonth.get(m.month) || 0;
        const caSousTraitanceForecast = forecastCaExternalByMonth.get(m.month) || 0;
        m.caAnimaNeo = round2(caAnimaNeoForecast);
        m.caSousTraitance = round2(caSousTraitanceForecast);
        const forecastCaTotal = round2(m.caAnimaNeo + m.caSousTraitance);
        m.resultat = round2(baseResultat + (forecastCaTotal - baseCaTotal));

        const forecastProdCostInternal =
          (forecastProdCostInternalByMonth.get(m.month) || 0) +
          (plannedCa.internalCostByMonth.get(m.month) || 0);
        m.margeBruteAnimaNeo = round2(m.caAnimaNeo - forecastProdCostInternal);

        const forecastProdCostExternal =
          (forecastProdCostExternalByMonth.get(m.month) || 0) +
          (plannedCa.externalCostByMonth.get(m.month) || 0);
        m.sousTraitanceCharges611 = round2(forecastProdCostExternal);
        m.margeBruteSousTraitance = round2(m.caSousTraitance - forecastProdCostExternal);
      }
    });

    // 3) Besoins: calcul mensuel basé sur les règles métier explicites
    const { data: besoinsRows, error: besoinsError } = await supabase
      .from('besoins')
      .select('id,state,date_creation,date_mise_a_jour');
    if (besoinsError) throw besoinsError;

    const besoins = Array.isArray(besoinsRows) ? besoinsRows : [];
    const stockStates = new Set(['5', '10']);

    besoins.forEach((row) => {
      const state = String(row.state ?? '');
      const creationMonth = monthKeyFromDate(row.date_creation);
      const updateMonth = monthKeyFromDate(row.date_mise_a_jour);

      if (creationMonth && monthMap.has(creationMonth) && state !== '0') {
        const creationBucket = monthMap.get(creationMonth);
        creationBucket.besoinsCrees += 1;
      }

      if (updateMonth && monthMap.has(updateMonth)) {
        const updateBucket = monthMap.get(updateMonth);
        if (stockStates.has(state)) updateBucket.besoinsStock += 1;
        if (state === '1') updateBucket.besoinsGagnes += 1;
        if (state === '2') updateBucket.besoinsPerdus += 1;
        if (state === '3') updateBucket.besoinsAbandonnes += 1;
        if (state === '9') updateBucket.besoinsStandBy += 1;

        const createdAt = new Date(row.date_creation || '');
        const finalUpdatedAt = new Date(row.date_mise_a_jour || '');
        if (
          !Number.isNaN(createdAt.getTime()) &&
          !Number.isNaN(finalUpdatedAt.getTime()) &&
          finalUpdatedAt >= createdAt
        ) {
          const durationDays = (finalUpdatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
          updateBucket.delaiMoyenReponseDays += durationDays;
          updateBucket.delaiMoyenReponseCount += 1;
        }
      }
    });

    months.forEach((bucket) => {
      if (bucket.delaiMoyenReponseCount > 0) {
        bucket.delaiMoyenReponseDays = round2(
          bucket.delaiMoyenReponseDays / bucket.delaiMoyenReponseCount
        );
      } else {
        bucket.delaiMoyenReponseDays = 0;
      }
    });

    return {
      year: y,
      monthly: months,
      meta: {
        taceEligibleResourceTypes: ['0', '3', '10'],
        taceEligibleResourcesRule:
          'Mois clôturés: ressources 0/3/10 avec timesheet; mois non clôturés: ressources 0/3/10 avec temps saisi et/ou prévisionnel',
        taceFormula:
          'Mois clôturés: somme(total_days_prod) depuis timesheets_detail. Mois non clôturés: somme(temps saisis + prévisionnels Boond) par prestation + jours prévisionnels manuels (planned_forecast, cumul P1…Pn selon filtre). TACE(%) = base / ((jours_ouvres * nb_ressources_eligibles_du_mois) - conges_du_mois) * 100',
        caForecastFormula:
          'Mois non clôturés: Σ (jours saisis + jours prévisionnels Boond) × TJM par prestation (timesheets_detail + forecast_times) + Σ (jours prévisionnels manuels, cumul P1…Pn selon filtre) × TJM (planned_forecast)',
        resultatForecastFormula:
          'Mois non clôturés: résultat Pennylane + (CA prévisionnel total − CA Pennylane) ; charges Pennylane inchangées',
        plannedScenarios: plannedCa.availableScenarios,
        forecastScenarios: forecastScenarioCatalog,
        plannedScenarioFilter:
          plannedScenarioFilter === 'none' ? 'none' : plannedScenarioFilter,
        plannedScenarioFilterLabel: formatPlannedScenarioFilterLabel(
          plannedScenarioFilter,
          forecastScenarioCatalog
        ),
        plannedScenarioFilterCumulative: plannedScenarioFilter !== 'none',
        margeBruteAnimaNeoFormula:
          'Mois clôturés: CA Anima Néo (Pennylane) − Σ total_days_prod × averageDailyCost (timesheets_detail). Mois non clôturés: CA prévisionnel − Σ (jours saisis + prévisionnels Boond + scénarios manuels) × coût journalier prestation/ressource',
        margeBruteSousTraitanceFormula:
          'Mois clôturés: CA sous-traitance (Pennylane) − Σ total_days_prod × averageDailyCost (timesheets_detail, ressources externes). Mois non clôturés: CA prévisionnel − Σ (jours saisis + prévisionnels Boond + scénarios manuels) × coût journalier prestation/ressource',
      },
    };
  }
}

module.exports = new DashboardService();
