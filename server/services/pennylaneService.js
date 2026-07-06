const axios = require('axios');

const DEFAULT_BASE = 'https://app.pennylane.com/api/external/v2';

const LEGACY_PATH_SUFFIXES = [
  '/trial_balance',
  '/ledger_entries',
  '/ledger_entry_lines',
  '/me',
  '/v1/invoices',
  '/invoices',
];

function normalizePennylaneBaseUrl(url) {
  let u = (url || DEFAULT_BASE).trim().replace(/\/+$/, '');
  const lower = u.toLowerCase();
  for (const suffix of LEGACY_PATH_SUFFIXES) {
    if (lower.endsWith(suffix.toLowerCase())) {
      const next = u.slice(0, u.length - suffix.length).replace(/\/+$/, '');
      console.warn(
        `[Pennylane] PENNYLANE_API_URL ne doit pas se terminer par "${suffix}". Utilisez la racine v2 : ${next || DEFAULT_BASE}`
      );
      u = next;
      break;
    }
  }
  if (u && !u.toLowerCase().includes('external/v2')) {
    console.warn(
      '[Pennylane] PENNYLANE_API_URL devrait être du type https://app.pennylane.com/api/external/v2'
    );
  }
  return u || DEFAULT_BASE;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Scopes Pennylane v2 requis pour le compte de résultat (voir pennylane.readme.io/docs/v2-scopes). */
const REQUIRED_PL_SCOPES = ['ledger_entries:readonly', 'ledger_accounts:readonly'];

function pennylaneErrorDetail(body) {
  if (!body) return '';
  if (typeof body === 'string') return body.slice(0, 500);
  const msg = body.message || body.error || body.detail;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return '';
  }
}

function formatPennylane403(body) {
  const detail = pennylaneErrorDetail(body);
  const scopeHint = REQUIRED_PL_SCOPES.join(', ');
  const legacyNote =
    ' Si le token n’a que l’ancien scope « ledger », régénérez-le : Pennylane a migré vers des scopes granulaires (ledger_entries:readonly, etc.).';
  if (detail && /missing scope/i.test(detail)) {
    return `${detail} — Régénérez le token API V2 dans Pennylane (Paramètres → Connectivité → Développeurs) avec au minimum : ${scopeHint}.${legacyNote}`;
  }
  return (
    `Accès Pennylane refusé (403). ${detail ? `${detail} — ` : ''}` +
    `Vérifiez PENNYLANE_API_KEY sur Vercel et les scopes du token : ${scopeHint}.${legacyNote}`
  );
}

function extractTrialBalanceLines(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const raw =
    payload.trial_balance_lines ||
    payload.trial_balance ||
    payload.lines ||
    payload.items ||
    payload.data;
  return Array.isArray(raw) ? raw : [];
}

function accountNumberFromLine(line) {
  const acc = line && line.ledger_account;
  if (acc && typeof acc === 'object') {
    return String(acc.number || acc.account_number || acc.code || '').trim();
  }
  return String(line.account_number || line.number || line.ledger_account_number || '').trim();
}

function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function debitCreditFromLine(line) {
  const d = parseAmount(
    line.debit ?? line.debit_amount ?? line.total_debit ?? line.debits ?? line.amount_debit
  );
  const c = parseAmount(
    line.credit ?? line.credit_amount ?? line.total_credit ?? line.credits ?? line.amount_credit
  );
  return { debit: d, credit: c };
}

function extractLedgerEntriesArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const keys = ['ledger_entries', 'data', 'items', 'results'];
  for (const k of keys) {
    if (Array.isArray(payload[k])) return payload[k];
  }
  return [];
}

function extractLedgerLinesArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const keys = ['ledger_entry_lines', 'data', 'items'];
  for (const k of keys) {
    if (Array.isArray(payload[k])) return payload[k];
  }
  return [];
}

function ledgerEntryId(entry) {
  if (!entry) return null;
  const id = entry.id ?? entry.ledger_entry_id;
  return id == null || id === '' ? null : id;
}

/** Filtre PENNYLANE_LEDGER_STATUS côté app : le filtre API ne documente que date, id, journal_id (voir getledgerentries). */
function ledgerEntryMatchesStatus(entry, wanted) {
  if (!wanted || String(wanted).trim() === '') return true;
  if (!entry) return false;
  const w = String(wanted).trim().toLowerCase();
  const s = String(entry.status ?? entry.state ?? '').trim().toLowerCase();
  return s === w;
}

const LEDGER_LIST_MAX_LIMIT = 100;

function linesFromEntry(entry) {
  return entry.ledger_entry_lines || entry.lines || [];
}

function lineLedgerEntryId(line) {
  if (!line) return null;
  const le = line.ledger_entry;
  if (le && typeof le === 'object' && le.id != null && le.id !== '') return le.id;
  if (line.ledger_entry_id != null && line.ledger_entry_id !== '') return line.ledger_entry_id;
  return null;
}

/** Mois 1–12 pour une ligne sur une année donnée (champ date ou pièce), sinon null. */
function ledgerLineMonthInYear(line, year) {
  if (!line) return null;
  let d = line.date || line.entry_date;
  if ((!d || String(d).length < 7) && line.ledger_entry && typeof line.ledger_entry === 'object') {
    d = line.ledger_entry.date;
  }
  const s = String(d || '').trim();
  if (s.length < 7) return null;
  const ym = s.slice(0, 7);
  const prefix = `${year}-`;
  if (!ym.startsWith(prefix)) return null;
  const month = parseInt(ym.slice(5, 7), 10);
  if (Number.isNaN(month) || month < 1 || month > 12) return null;
  return month;
}

/** Même logique que le script PowerShell : une entrée par id de ligne. */
function dedupeLedgerLinesById(lines) {
  const byId = new Map();
  let anon = 0;
  for (const line of lines) {
    if (!line) continue;
    const id = line.id;
    if (id != null && id !== '') byId.set(String(id), line);
    else {
      anon += 1;
      byId.set(`__anon_${anon}`, line);
    }
  }
  return Array.from(byId.values());
}

function entryMetaFromLine(line) {
  const le = line && line.ledger_entry && typeof line.ledger_entry === 'object' ? line.ledger_entry : null;
  const eid = lineLedgerEntryId(line);
  const journalFromLine = line.journal && typeof line.journal === 'object' ? line.journal : null;
  const journalFromEntry = le && le.journal && typeof le.journal === 'object' ? le.journal : null;
  return {
    ledgerEntryId: eid == null || eid === '' ? null : eid,
    entryDate: (le && le.date) || line.date || line.entry_date || '',
    entryStatus: (le && (le.status ?? le.state)) || line.status || line.state || '',
    entryLabel: String((le && (le.label ?? le.description ?? le.wording)) || line.entry_label || '').slice(0, 160),
    journal: String(
      (journalFromEntry && (journalFromEntry.code ?? journalFromEntry.label)) ||
        (journalFromLine && (journalFromLine.code ?? journalFromLine.label)) ||
        (le && le.journal_id) ||
        line.journal_id ||
        ''
    ).slice(0, 40),
  };
}

function parseLedgerAccountId(ledgerAccountRef) {
  if (!ledgerAccountRef || typeof ledgerAccountRef !== 'object') return null;
  if (ledgerAccountRef.id != null && ledgerAccountRef.id !== '') {
    return String(ledgerAccountRef.id);
  }
  const url = ledgerAccountRef.url;
  if (url && typeof url === 'string') {
    const m = url.match(/ledger_accounts\/(\d+)/i);
    if (m) return m[1];
  }
  return null;
}

function resolveAccountNumberSync(line) {
  let n = accountNumberFromLine(line);
  if (n) return n;
  const label =
    (line.ledger_account && line.ledger_account.label) || line.label || line.description || '';
  const m = String(label).match(/(\d{3,9})/);
  if (m) return m[1];
  return '';
}

function ledgerAccountIdFromLine(line) {
  const fromRef = parseLedgerAccountId(line.ledger_account);
  if (fromRef) return fromRef;
  if (line.ledger_account_id != null && line.ledger_account_id !== '') {
    return String(line.ledger_account_id);
  }
  return null;
}

function getPlChargePrefixes() {
  const raw = process.env.PENNYLANE_PL_CHARGES_PREFIXES;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).split(',').map((s) => s.trim().replace(/\s/g, '')).filter(Boolean);
}

function getPlProduitPrefixes() {
  const raw = process.env.PENNYLANE_PL_PRODUITS_PREFIXES;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).split(',').map((s) => s.trim().replace(/\s/g, '')).filter(Boolean);
}

function accountMatchesCharges(num) {
  if (!num) return false;
  const prefs = getPlChargePrefixes();
  if (!prefs || prefs.length === 0) return num.startsWith('6');
  return prefs.some((p) => num.startsWith(p));
}

function accountMatchesProduits(num) {
  if (!num) return false;
  const prefs = getPlProduitPrefixes();
  if (!prefs || prefs.length === 0) return num.startsWith('7');
  return prefs.some((p) => num.startsWith(p));
}

function describePlAccountFilter() {
  const ch = getPlChargePrefixes();
  const pr = getPlProduitPrefixes();
  if (!ch && !pr) {
    return 'Tous les comptes classe 6 (charges) et 7 (produits), regroupés par numéro de compte.';
  }
  const parts = [];
  if (ch && ch.length) parts.push(`charges : préfixes ${ch.join(', ')}`);
  if (pr && pr.length) parts.push(`produits : préfixes ${pr.join(', ')}`);
  return parts.join(' ; ');
}

/** Une ligne classée 6/7 pour agrégation P&L (même règles que l’ancien aggregatePlLines). */
function classifyPlLineForAgg(line, accountCache) {
  let num = resolveAccountNumberSync(line);
  if (!num) {
    const pid = ledgerAccountIdFromLine(line);
    if (pid && accountCache instanceof Map) num = accountCache.get(pid) || '';
  }
  const mCh = accountMatchesCharges(num);
  const mPr = accountMatchesProduits(num);
  let kind = null;
  if (mCh && mPr) kind = num.startsWith('6') ? 'charge' : 'produit';
  else if (mCh) kind = 'charge';
  else if (mPr) kind = 'produit';
  if (!num || !kind) return null;
  const { debit, credit } = debitCreditFromLine(line);
  if (kind === 'charge') {
    return { num, chargesAdd: debit - credit, produitsAdd: 0 };
  }
  return { num, chargesAdd: 0, produitsAdd: credit - debit };
}

/**
 * Résout les numeros manquants par GET /ledger_accounts/:id en parallèle par lots
 * (débit rate limit : délai entre lots via throttle).
 */
async function buildLedgerAccountCache(pennylane, allLineObjects) {
  const accountCache = new Map();
  const idsToFetch = new Set();
  for (const line of allLineObjects) {
    if (resolveAccountNumberSync(line)) continue;
    const pid = ledgerAccountIdFromLine(line);
    if (pid) idsToFetch.add(pid);
  }
  const ids = [...idsToFetch];
  const concurrency = Math.min(
    32,
    Math.max(1, parseInt(process.env.PENNYLANE_ACCOUNT_FETCH_CONCURRENCY || '8', 10))
  );

  for (let i = 0; i < ids.length; i += concurrency) {
    if (i > 0) await pennylane.throttle();
    const chunk = ids.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (pid) => {
        try {
          const acc = await pennylane.makeRequest(`/ledger_accounts/${pid}`, {});
          const num = String(acc.number || acc.account_number || acc.code || '').trim();
          accountCache.set(pid, num);
        } catch (e) {
          console.warn(`[Pennylane] Impossible de résoudre ledger_accounts/${pid}:`, e.message || e);
          accountCache.set(pid, '');
        }
      })
    );
  }
  return accountCache;
}

/** Un seul parcours des lignes annuelles → 12 mois (évite 12× aggregatePlLines). */
function aggregatePlYearByMonthFromLines(year, allLines, accountCache) {
  const y = parseInt(String(year), 10);
  const monthly = Array.from({ length: 12 }, () => ({
    produits: 0,
    charges: 0,
    linesConsidered: 0,
    byAccount: Object.create(null),
    entryIds: new Set(),
    linesCount: 0,
  }));

  for (const line of allLines) {
    const monthNum = ledgerLineMonthInYear(line, y);
    if (monthNum == null) continue;
    const bucket = monthly[monthNum - 1];
    bucket.linesCount += 1;
    const eid = lineLedgerEntryId(line);
    if (eid != null && eid !== '') bucket.entryIds.add(String(eid));

    const cl = classifyPlLineForAgg(line, accountCache);
    if (!cl) continue;
    bucket.linesConsidered += 1;
    bucket.charges += cl.chargesAdd;
    bucket.produits += cl.produitsAdd;
    const ba = bucket.byAccount;
    if (!ba[cl.num]) ba[cl.num] = { charges: 0, produits: 0, lineCount: 0 };
    ba[cl.num].lineCount += 1;
    ba[cl.num].charges += cl.chargesAdd;
    ba[cl.num].produits += cl.produitsAdd;
  }

  let totalLines6Or7 = 0;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const b = monthly[m - 1];
    totalLines6Or7 += b.linesConsidered;
    Object.keys(b.byAccount).forEach((k) => {
      b.byAccount[k].charges = Math.round(b.byAccount[k].charges * 100) / 100;
      b.byAccount[k].produits = Math.round(b.byAccount[k].produits * 100) / 100;
    });
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    months.push({
      month: monthKey,
      entriesCount: b.entryIds.size,
      linesCount: b.linesCount,
      produits: Math.round(b.produits * 100) / 100,
      charges: Math.round(b.charges * 100) / 100,
      resultat: Math.round((b.produits - b.charges) * 100) / 100,
      byAccount: b.byAccount,
    });
  }
  return { months, totalLines6Or7 };
}

class PennylaneService {
  constructor() {
    this.baseURL = normalizePennylaneBaseUrl(process.env.PENNYLANE_API_URL || DEFAULT_BASE);
    this.apiKey = process.env.PENNYLANE_API_KEY;
    this.ledgerStatus = (process.env.PENNYLANE_LEDGER_STATUS || '').trim();
    this.pageLimit = Math.min(Math.max(parseInt(process.env.PENNYLANE_PAGE_LIMIT || '100', 10), 1), 500);
    this.rateDelayMs = Math.max(parseInt(process.env.PENNYLANE_RATE_DELAY_MS || '260', 10), 0);
    /** Doc v2 : limit 1–100 sur ledger_entries / ledger_entry_lines. */
    this.ledgerListLimit = Math.min(this.pageLimit, LEDGER_LIST_MAX_LIMIT);
    /** https://pennylane.readme.io/reference/getledgerentries.md — use_2026_api_changes */
    this.use2026ApiChanges =
      process.env.PENNYLANE_USE_2026_API_CHANGES !== '0' &&
      process.env.PENNYLANE_USE_2026_API_CHANGES !== 'false';
    this.ledgerSort = (process.env.PENNYLANE_LEDGER_SORT || '').trim();

    if (!this.apiKey) {
      console.warn('⚠️  Pennylane API key not configured');
    }
  }

  async throttle() {
    if (this.rateDelayMs > 0) await sleep(this.rateDelayMs);
  }

  async makeRequest(endpoint, params = {}) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullUrl = `${this.baseURL}${path}`;
    try {
      const response = await axios.get(fullUrl, {
        params,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;
      console.error(`Error Pennylane ${fullUrl}`, status || '', body || error.message);
      if (status === 404) {
        const hint =
          'Vérifiez PENNYLANE_API_URL : racine https://app.pennylane.com/api/external/v2. Scope : ledger_entries:readonly (écritures et lignes).';
        const wrapped = new Error(`${error.message} — ${hint}`);
        wrapped.cause = error;
        wrapped.status = 404;
        throw wrapped;
      }
      if (status === 403) {
        const wrapped = new Error(formatPennylane403(body));
        wrapped.cause = error;
        wrapped.status = 403;
        wrapped.pennylaneDetail = pennylaneErrorDetail(body);
        throw wrapped;
      }
      if (process.env.NODE_ENV === 'development') return this.getMockData(path);
      throw error;
    }
  }

  async getTrialBalancePage(startDate, endDate, cursor = null) {
    const params = { start_date: startDate, end_date: endDate, limit: this.pageLimit };
    if (cursor) params.cursor = cursor;
    return this.makeRequest('/trial_balance', params);
  }

  async fetchAllTrialBalanceLines(startDate, endDate) {
    const lines = [];
    let cursor = null;
    let hasMore = true;
    let first = true;
    while (hasMore) {
      if (!first) await this.throttle();
      first = false;
      const result = await this.getTrialBalancePage(startDate, endDate, cursor);
      const batch = extractTrialBalanceLines(result);
      lines.push(...batch);
      hasMore = result && result.has_more === true;
      cursor = result && result.next_cursor ? result.next_cursor : null;
      if (!hasMore || !cursor || batch.length === 0) break;
    }
    return lines;
  }

  async getLedgerEntries(startDate, endDate, cursor = null) {
    const opGte = process.env.PENNYLANE_LEDGER_DATE_GTE || 'gteq';
    const opLte = process.env.PENNYLANE_LEDGER_DATE_LTE || 'lteq';
    const filter = [
      { field: 'date', operator: opGte, value: startDate },
      { field: 'date', operator: opLte, value: endDate },
    ];
    const params = {
      filter: JSON.stringify(filter),
      limit: this.ledgerListLimit,
      use_2026_api_changes: this.use2026ApiChanges,
    };
    if (this.ledgerSort) params.sort = this.ledgerSort;
    if (cursor) params.cursor = cursor;
    return this.makeRequest('/ledger_entries', params);
  }

  async fetchAllLedgerEntries(startDate, endDate) {
    const all = [];
    let cursor = null;
    let hasMore = true;
    let first = true;
    while (hasMore) {
      if (!first) await this.throttle();
      first = false;
      const result = await this.getLedgerEntries(startDate, endDate, cursor);
      const batch = extractLedgerEntriesArray(result);
      const entries = this.ledgerStatus
        ? batch.filter((e) => ledgerEntryMatchesStatus(e, this.ledgerStatus))
        : batch;
      all.push(...entries);
      hasMore = result.has_more === true;
      cursor = result.next_cursor || null;
      if (!hasMore) break;
      if (!cursor) break;
    }
    return all;
  }

  /**
   * GET /ledger_entry_lines (liste globale filtrée par date), pagination cursor.
   * Aligné sur un export type script PowerShell invoque cet index plutôt que des pièces + sous-ressource.
   */
  async getLedgerEntryLinesIndex(startDate, endDate, cursor = null) {
    const opGte = process.env.PENNYLANE_LEDGER_DATE_GTE || 'gteq';
    const opLte = process.env.PENNYLANE_LEDGER_DATE_LTE || 'lteq';
    const filter = [
      { field: 'date', operator: opGte, value: startDate },
      { field: 'date', operator: opLte, value: endDate },
    ];
    const params = {
      filter: JSON.stringify(filter),
      limit: this.ledgerListLimit,
      use_2026_api_changes: this.use2026ApiChanges,
    };
    if (this.ledgerSort) params.sort = this.ledgerSort;
    if (cursor) params.cursor = cursor;
    return this.makeRequest('/ledger_entry_lines', params);
  }

  async fetchAllLedgerEntryLinesInRange(startDate, endDate) {
    const chunks = [];
    let cursor = null;
    let hasMore = true;
    let first = true;
    while (hasMore) {
      if (!first) await this.throttle();
      first = false;
      const result = await this.getLedgerEntryLinesIndex(startDate, endDate, cursor);
      const batch = extractLedgerLinesArray(result);
      chunks.push(...batch);
      hasMore = result.has_more === true;
      cursor = result.next_cursor || null;
      if (!hasMore) break;
      if (!cursor) break;
    }
    return dedupeLedgerLinesById(chunks);
  }

  useLedgerEntryLinesForPl() {
    const s = (process.env.PENNYLANE_PL_SOURCE || 'ledger_entry_lines').trim().toLowerCase();
    return s !== 'ledger_entries';
  }

  async fetchLedgerEntryLinesPage(entryId, cursor = null) {
    const params = {
      limit: this.ledgerListLimit,
      use_2026_api_changes: this.use2026ApiChanges,
    };
    if (cursor) params.cursor = cursor;
    return this.makeRequest(`/ledger_entries/${entryId}/ledger_entry_lines`, params);
  }

  async fetchAllLedgerEntryLinesForEntry(entryId) {
    const lines = [];
    let cursor = null;
    let hasMore = true;
    let first = true;
    while (hasMore) {
      if (!first) await this.throttle();
      first = false;
      const res = await this.fetchLedgerEntryLinesPage(entryId, cursor);
      const batch = extractLedgerLinesArray(res);
      lines.push(...batch);
      hasMore = res.has_more === true;
      cursor = res.next_cursor || null;
      if (!hasMore) break;
      if (!cursor) break;
    }
    return lines;
  }

  async ensureLedgerEntriesHaveLines(entries) {
    const out = [];
    for (const entry of entries) {
      const existing = linesFromEntry(entry);
      if (Array.isArray(existing) && existing.length > 0) {
        out.push(entry);
        continue;
      }
      const id = ledgerEntryId(entry);
      if (id == null || id === '') { out.push(entry); continue; }
      await this.throttle();
      const lines = await this.fetchAllLedgerEntryLinesForEntry(id);
      out.push({ ...entry, ledger_entry_lines: lines });
    }
    return out;
  }

  /**
   * Agrégation charges (6) / produits (7) à partir de lignes brutes (même formules que le script PS : débit−crédit / crédit−débit).
   */
  async aggregatePlLines(flatLines, prebuiltAccountCache = null) {
    const accountCache =
      prebuiltAccountCache instanceof Map
        ? prebuiltAccountCache
        : await buildLedgerAccountCache(this, flatLines);

    let produits = 0;
    let charges = 0;
    let linesConsidered = 0;

    if (process.env.PENNYLANE_DEBUG === '1' && flatLines.length > 0) {
      console.warn('[Pennylane] DEBUG première ligne:', JSON.stringify(flatLines[0]).slice(0, 1200));
    }

    const byAccount = Object.create(null);
    for (const line of flatLines) {
      const cl = classifyPlLineForAgg(line, accountCache);
      if (!cl) continue;
      linesConsidered += 1;
      charges += cl.chargesAdd;
      produits += cl.produitsAdd;
      if (!byAccount[cl.num]) byAccount[cl.num] = { charges: 0, produits: 0, lineCount: 0 };
      byAccount[cl.num].lineCount += 1;
      byAccount[cl.num].charges += cl.chargesAdd;
      byAccount[cl.num].produits += cl.produitsAdd;
    }

    Object.keys(byAccount).forEach((k) => {
      byAccount[k].charges = Math.round(byAccount[k].charges * 100) / 100;
      byAccount[k].produits = Math.round(byAccount[k].produits * 100) / 100;
    });

    return { produits, charges, linesConsidered, byAccount };
  }

  async aggregateLedgerEntriesClasses6And7(entries, prebuiltAccountCache = null) {
    const allLines = [];
    for (const entry of entries) {
      for (const line of linesFromEntry(entry)) allLines.push(line);
    }
    return this.aggregatePlLines(allLines, prebuiltAccountCache);
  }

  async getCompteDeResultat(year) {
    const y = parseInt(String(year), 10);
    if (Number.isNaN(y) || y < 2000 || y > 2100) throw new Error('Année invalide');

    const months = [];
    let totalLines6Or7 = 0;

    const plMethod = this.useLedgerEntryLinesForPl() ? 'ledger_entry_lines' : 'ledger_entries';

    if (this.useLedgerEntryLinesForPl()) {
      const yearStart = `${y}-01-01`;
      const yearEnd = `${y}-12-31`;
      await this.throttle();
      const allLines = await this.fetchAllLedgerEntryLinesInRange(yearStart, yearEnd);
      const accountCache = await buildLedgerAccountCache(this, allLines);
      const { months: yearMonths, totalLines6Or7: yTotal } = aggregatePlYearByMonthFromLines(
        y,
        allLines,
        accountCache
      );
      totalLines6Or7 = yTotal;
      months.push(...yearMonths);
    } else {
      for (let m = 1; m <= 12; m++) {
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;

        await this.throttle();

        let entries = await this.fetchAllLedgerEntries(startDate, endDate);
        const needsLines = entries.some((e) => {
          const ls = linesFromEntry(e);
          return !Array.isArray(ls) || ls.length === 0;
        });
        if (needsLines && entries.length > 0) entries = await this.ensureLedgerEntriesHaveLines(entries);

        const agg = await this.aggregateLedgerEntriesClasses6And7(entries);
        totalLines6Or7 += agg.linesConsidered;
        const entriesCount = entries.length;

        months.push({
          month: monthKey,
          entriesCount,
          produits: Math.round(agg.produits * 100) / 100,
          charges: Math.round(agg.charges * 100) / 100,
          resultat: Math.round((agg.produits - agg.charges) * 100) / 100,
          byAccount: agg.byAccount,
        });
      }
    }

    const totalsByAccount = Object.create(null);
    for (const mo of months) {
      for (const acc of Object.keys(mo.byAccount || {})) {
        if (!totalsByAccount[acc]) totalsByAccount[acc] = { charges: 0, produits: 0, lineCount: 0 };
        totalsByAccount[acc].charges += mo.byAccount[acc].charges;
        totalsByAccount[acc].produits += mo.byAccount[acc].produits;
        totalsByAccount[acc].lineCount += mo.byAccount[acc].lineCount;
      }
    }
    Object.keys(totalsByAccount).forEach((k) => {
      totalsByAccount[k].charges = Math.round(totalsByAccount[k].charges * 100) / 100;
      totalsByAccount[k].produits = Math.round(totalsByAccount[k].produits * 100) / 100;
    });

    const totals = months.reduce(
      (acc, row) => ({
        produits: acc.produits + row.produits,
        charges: acc.charges + row.charges,
        resultat: acc.resultat + row.resultat,
      }),
      { produits: 0, charges: 0, resultat: 0 }
    );
    Object.keys(totals).forEach((k) => { totals[k] = Math.round(totals[k] * 100) / 100; });

    const totalEntriesY = months.reduce((s, row) => s + (row.entriesCount || 0), 0);
    const totalLinesY = months.reduce((s, row) => s + (row.linesCount || 0), 0);
    if (totalLines6Or7 === 0 && (totalEntriesY > 0 || totalLinesY > 0)) {
      console.warn(
        "[Pennylane] Données chargées mais aucune ligne 6/7 agrégée. " +
        "Ajoutez ledger_accounts:readonly au token ou définissez PENNYLANE_DEBUG=1."
      );
    }

    return {
      year: y,
      source: 'pennylane',
      method: plMethod,
      filterAccounts: describePlAccountFilter(),
      monthly: months,
      totals,
      totalsByAccount,
      counts: { months: 12, ledgerLinesClass6Or7: totalLines6Or7 },
    };
  }

  async debugExportLedgerMonth(year, month, options = {}) {
    const includeAllAccounts = options.includeAllAccounts !== false;
    const includeAggregation = options.includeAggregation === true;
    const y = parseInt(String(year), 10);
    const m = parseInt(String(month), 10);
    if (Number.isNaN(y) || y < 2000 || y > 2100 || Number.isNaN(m) || m < 1 || m > 12) {
      throw new Error('Année ou mois invalide (mois 1-12)');
    }
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const flatLines = await this.fetchAllLedgerEntryLinesInRange(startDate, endDate);

    const byEntry = new Map();
    for (const line of flatLines) {
      const eid = lineLedgerEntryId(line);
      const key = eid != null && eid !== '' ? String(eid) : '_no_ledger_entry';
      if (!byEntry.has(key)) {
        const meta = entryMetaFromLine(line);
        const le = line.ledger_entry && typeof line.ledger_entry === 'object' ? line.ledger_entry : null;
        byEntry.set(key, {
          id: meta.ledgerEntryId,
          date: meta.entryDate,
          status: meta.entryStatus,
          pieceNumber:
            le?.piece_number != null
              ? String(le.piece_number)
              : line.piece_number != null
                ? String(line.piece_number)
                : '',
          invoiceNumber:
            le?.invoice_number != null
              ? String(le.invoice_number)
              : line.invoice_number != null
                ? String(line.invoice_number)
                : '',
          journal: meta.journal,
          label: meta.entryLabel,
          lines: [],
        });
      }
      byEntry.get(key).lines.push(line);
    }

    const entriesSummary = Array.from(byEntry.values())
      .map((b) => ({
        id: b.id,
        date: b.date,
        status: b.status,
        pieceNumber: b.pieceNumber,
        invoiceNumber: b.invoiceNumber,
        journal: b.journal,
        label: b.label,
        lineCount: b.lines.length,
      }))
      .filter((e) => e.id != null && e.id !== '')
      .sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
      );

    const compareLineIds = (a, b) => {
      const na = parseInt(String(a.id), 10);
      const nb = parseInt(String(b.id), 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a.id).localeCompare(String(b.id));
    };

    const pairs = [];
    const sortedKeys = Array.from(byEntry.keys()).sort((ka, kb) => {
      const a = byEntry.get(ka);
      const b = byEntry.get(kb);
      const da = String(a.date);
      const db = String(b.date);
      if (da !== db) return da.localeCompare(db);
      return String(a.id || ka).localeCompare(String(b.id || kb), undefined, { numeric: true });
    });
    for (const key of sortedKeys) {
      const block = byEntry.get(key);
      const sortedLines = block.lines.slice().sort(compareLineIds);
      sortedLines.forEach((line, idx) => {
        pairs.push({
          line,
          lineIndex: idx + 1,
          entryLineCount: sortedLines.length,
          ledgerEntryId: block.id,
          entryDate: block.date,
          entryStatus: block.status,
          entryLabel: block.label,
          journalForRow: block.journal,
        });
      });
    }

    const accountCache = await buildLedgerAccountCache(this, flatLines);
    let agg = null;
    if (includeAggregation) {
      agg = await this.aggregatePlLines(flatLines, accountCache);
    }

    const rows = [];
    let sumCharges = 0;
    let sumProduits = 0;
    for (const {
      line,
      lineIndex,
      entryLineCount,
      ledgerEntryId: eid,
      entryDate: edate,
      entryStatus,
      entryLabel,
      journalForRow,
    } of pairs) {
      let num = resolveAccountNumberSync(line);
      if (!num) {
        const pid = ledgerAccountIdFromLine(line);
        if (pid) num = accountCache.get(pid) || '';
      }
      const { debit, credit } = debitCreditFromLine(line);
      const lineLabel =
        (line.ledger_account && line.ledger_account.label) || line.label || line.description || '';
      const journal =
        journalForRow ||
        String(
          line.journal?.code || line.journal?.label || line.journal_id || ''
        ).slice(0, 40);

      const accClass = !num ? '' : num[0] || '';

      let impactCharges6 = null;
      let impactProduits7 = null;
      let kind = null;
      if (includeAggregation || !includeAllAccounts) {
        const mCh = accountMatchesCharges(num);
        const mPr = accountMatchesProduits(num);
        if (mCh && mPr) kind = num.startsWith('6') ? 'charge' : 'produit';
        else if (mCh) kind = 'charge';
        else if (mPr) kind = 'produit';

        if (kind === 'charge') {
          impactCharges6 = debit - credit;
          sumCharges += impactCharges6;
        } else if (kind === 'produit') {
          impactProduits7 = credit - debit;
          sumProduits += impactProduits7;
        }
      }

      if (includeAllAccounts || kind) {
        const row = {
          ledgerLineId: line.id != null ? line.id : '',
          ledgerEntryId: eid,
          entryDate: edate,
          entryStatus: entryStatus || '',
          entryLabel: String(entryLabel || '').slice(0, 160),
          lineIndex,
          entryLineCount,
          journal: String(journal).slice(0, 40),
          accountNumber: num || '',
          accountClass: accClass,
          label: String(lineLabel).slice(0, 120),
          debit,
          credit,
        };
        if (includeAggregation || !includeAllAccounts) {
          row.impactCharges6 = impactCharges6;
          row.impactProduits7 = impactProduits7;
        }
        rows.push(row);
      }
    }

    const out = {
      period: { startDate, endDate },
      source: 'ledger_entry_lines',
      entriesCount: entriesSummary.length,
      entriesSummary,
      linesTotalAllAccounts: flatLines.length,
      linesReported: rows.length,
      rows,
    };

    if (includeAggregation) {
      out.totalsFromSumRows = {
        chargesExploitationClasse6: Math.round(sumCharges * 100) / 100,
        produitsClasse7: Math.round(sumProduits * 100) / 100,
        resultat: Math.round((sumProduits - sumCharges) * 100) / 100,
      };
      out.totalsFromAggregator = {
        charges: agg.charges,
        produits: agg.produits,
        resultat: Math.round((agg.produits - agg.charges) * 100) / 100,
        linesClass6Or7: agg.linesConsidered,
      };
      out.env = {
        PENNYLANE_LEDGER_STATUS: process.env.PENNYLANE_LEDGER_STATUS || '(non défini)',
        PENNYLANE_LEDGER_DATE_GTE: process.env.PENNYLANE_LEDGER_DATE_GTE || 'gteq',
        PENNYLANE_LEDGER_DATE_LTE: process.env.PENNYLANE_LEDGER_DATE_LTE || 'lteq',
        PENNYLANE_PL_CHARGES_PREFIXES: process.env.PENNYLANE_PL_CHARGES_PREFIXES || '(défaut: tous les 6*)',
        PENNYLANE_PL_PRODUITS_PREFIXES: process.env.PENNYLANE_PL_PRODUITS_PREFIXES || '(défaut: tous les 7*)',
      };
      out.accountFilter = describePlAccountFilter();
      out.byAccount = agg.byAccount;
    }

    return out;
  }

  async probeApi() {
    if (!this.apiKey) throw new Error('PENNYLANE_API_KEY manquant');
    return this.makeRequest('/me', {});
  }

  /**
   * Diagnostic token : scopes actifs + test lecture écritures (sans données sensibles).
   */
  async probeApiDiagnostics() {
    if (!this.apiKey) {
      return {
        configured: false,
        error: 'PENNYLANE_API_KEY manquant',
        requiredScopes: REQUIRED_PL_SCOPES,
      };
    }

    const out = {
      configured: true,
      baseURL: this.baseURL,
      requiredScopes: REQUIRED_PL_SCOPES,
      me: null,
      ledgerEntryLines: null,
      missingScopes: [],
    };

    try {
      const me = await this.makeRequest('/me', {});
      const scopes = Array.isArray(me.scopes)
        ? me.scopes
        : Array.isArray(me.scope)
          ? me.scope
          : typeof me.scope === 'string'
            ? me.scope.split(/\s+/).filter(Boolean)
            : [];
      out.me = {
        ok: true,
        companyId: me.company_id ?? me.company?.id ?? null,
        scopes,
      };
      const hasEntries =
        scopes.includes('ledger_entries:readonly') || scopes.includes('ledger_entries:all');
      const hasAccounts =
        scopes.includes('ledger_accounts:readonly') || scopes.includes('ledger_accounts:all');
      if (!hasEntries) out.missingScopes.push('ledger_entries:readonly');
      if (!hasAccounts) out.missingScopes.push('ledger_accounts:readonly');
      if (scopes.includes('ledger') && out.missingScopes.length > 0) {
        out.legacyLedgerScopeOnly =
          'Le scope « ledger » seul ne suffit plus sur l’API v2 ; régénérez le token avec ledger_entries:readonly et ledger_accounts:readonly.';
      }
    } catch (e) {
      out.me = { ok: false, status: e.status || e.response?.status, error: e.message };
    }

    try {
      const y = new Date().getFullYear();
      await this.throttle();
      await this.getLedgerEntryLinesIndex(`${y}-01-01`, `${y}-01-31`, null);
      out.ledgerEntryLines = { ok: true };
    } catch (e) {
      out.ledgerEntryLines = {
        ok: false,
        status: e.status || e.response?.status,
        error: e.message,
        pennylaneDetail: e.pennylaneDetail || null,
      };
    }

    return out;
  }

  getMockData(path) {
    if (String(path).includes('/me')) return { id: 'mock', email: 'dev@mock', role: 'customer' };
    if (String(path).includes('trial_balance')) {
      return {
        trial_balance_lines: [
          { ledger_account: { number: '701000' }, debit: '0', credit: '10000' },
          { ledger_account: { number: '606100' }, debit: '3500', credit: '0' },
        ],
        has_more: false, next_cursor: null,
      };
    }
    if (String(path).includes('ledger_entry_lines')) {
      const mockLines = [
        {
          id: 901,
          date: '2024-01-15',
          ledger_account: { number: '701000' },
          debit: 0,
          credit: 2500,
          ledger_entry: { id: 5001, date: '2024-01-15', label: 'Vente mock' },
        },
        {
          id: 902,
          date: '2024-01-15',
          ledger_account: { number: '411000' },
          debit: 2500,
          credit: 0,
          ledger_entry: { id: 5001, date: '2024-01-15', label: 'Vente mock' },
        },
      ];
      if (/\/ledger_entries\/[^/]+\/ledger_entry_lines/.test(String(path))) {
        return { ledger_entry_lines: mockLines, has_more: false, next_cursor: null };
      }
      return { items: mockLines, has_more: false, next_cursor: null };
    }
    if (String(path).includes('ledger_entries')) {
      return {
        ledger_entries: [
          {
            id: 'mock-dev-1',
            ledger_entry_lines: [
              { ledger_account: { number: '701000' }, debit: 0, credit: 5000 },
              { ledger_account: { number: '606100' }, debit: 1500, credit: 0 },
            ],
          },
        ],
        has_more: false, next_cursor: null,
      };
    }
    return { data: [] };
  }
}

module.exports = new PennylaneService();
