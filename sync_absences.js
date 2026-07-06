/**
 * Synchronise les absences Boond (GET /absences) vers la table public.absence
 * (agrégat jours calendaires par resource_id et par mois YYYY-MM).
 */
require('dotenv').config();
require('./lib/secretEnv');

const boondManagerService = require('./server/services/boondManagerService');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS, BOOND_REQUEST_DELAY } = require('./lib/constants');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function extractList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload.data !== undefined && payload.data !== null) {
    if (Array.isArray(payload.data)) return payload.data;
    if (typeof payload.data === 'object') return [payload.data];
  }
  if (payload._embedded && typeof payload._embedded === 'object') {
    for (const k of Object.keys(payload._embedded)) {
      const v = payload._embedded[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** Extrait un ID numérique depuis une URL Boond (…/resources/123, …/employees/5). */
function idFromHref(href) {
  if (!href || typeof href !== 'string') return NaN;
  const m = href.match(/\/(resources|resource|employees|employee|persons|person|collaborators)\/(\d+)/i);
  if (m) return Number(m[2]);
  const tail = href.match(/\/(\d+)\/?$/);
  return tail ? Number(tail[1]) : NaN;
}

function idFromRelationshipObject(r) {
  if (!r || typeof r !== 'object') return NaN;
  const d = r.data;
  if (d != null) {
    if (Array.isArray(d)) {
      const first = d[0];
      if (first?.id != null) return Number(first.id);
    } else if (d.id != null) {
      return Number(d.id);
    }
  }
  const href = r.links?.related || r.related;
  if (typeof href === 'string') return idFromHref(href);
  if (href && typeof href === 'object' && href.href) return idFromHref(href.href);
  return NaN;
}

/** Liens HAL (_links) souvent utilisés quand `relationships.data` est vide. */
function resourceIdFromHalLinks(item) {
  const links = item._links || item.links;
  if (!links || typeof links !== 'object') return NaN;
  const preferred = [
    'resource',
    'boond:resource',
    'employee',
    'boond:employee',
    'person',
    'collaborator',
    'dependsOn',
    'mainEntity'
  ];
  for (const key of preferred) {
    const slot = links[key];
    const href = slot && typeof slot === 'object' ? slot.href : typeof slot === 'string' ? slot : null;
    if (href) {
      const id = idFromHref(href);
      if (!Number.isNaN(id)) return id;
    }
  }
  for (const slot of Object.values(links)) {
    const href = slot && typeof slot === 'object' ? slot.href : typeof slot === 'string' ? slot : null;
    if (!href || href.includes('/absences')) continue;
    const id = idFromHref(href);
    if (!Number.isNaN(id)) return id;
  }
  return NaN;
}

function resourceIdFromItem(item) {
  if (!item || typeof item !== 'object') return NaN;

  const rel = item.relationships || {};
  const preferredRelKeys = [
    'resource',
    'employee',
    'person',
    'collaborator',
    'dependsOn',
    'mainEntity',
    'account'
  ];
  for (const key of preferredRelKeys) {
    const id = idFromRelationshipObject(rel[key]);
    if (!Number.isNaN(id)) return id;
  }
  for (const key of Object.keys(rel)) {
    if (preferredRelKeys.includes(key)) continue;
    const typeHint = rel[key]?.data?.type || (Array.isArray(rel[key]?.data) ? rel[key].data[0]?.type : null);
    if (typeHint && /resource|employee|person|collaborator|account/i.test(String(typeHint))) {
      const id = idFromRelationshipObject(rel[key]);
      if (!Number.isNaN(id)) return id;
    }
  }
  for (const key of Object.keys(rel)) {
    if (preferredRelKeys.includes(key)) continue;
    const r = rel[key];
    const href = r?.links?.related;
    const h = typeof href === 'string' ? href : href?.href;
    if (h && /\/(resources|resource|employees|employee|persons|person)\//i.test(h)) {
      const id = idFromHref(h);
      if (!Number.isNaN(id)) return id;
    }
  }

  let rid = resourceIdFromHalLinks(item);
  if (!Number.isNaN(rid)) return rid;

  const emb = item._embedded || item.attributes?._embedded;
  if (emb?.resource?.id != null) return Number(emb.resource.id);
  if (Array.isArray(emb?.resources) && emb.resources[0]?.id != null) return Number(emb.resources[0].id);
  if (emb?.employee?.id != null) return Number(emb.employee.id);

  const a = { ...item, ...(item.attributes || {}) };
  // Boond : collaborateur souvent sous attributes.absencesReport.resource (pas de relationships)
  const report = a.absencesReport;
  if (report && typeof report === 'object' && report.resource?.id != null) {
    return Number(report.resource.id);
  }
  const res = a.resource;
  if (res && typeof res === 'object' && res.id != null) return Number(res.id);
  for (const k of ['resourceId', 'resource_id', 'employeeId', 'employee_id', 'employeeID']) {
    if (a[k] != null) return Number(a[k]);
  }
  return NaN;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

function normalizeDay(val) {
  if (val == null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    const d = new Date(val > 1e12 ? val : val * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (ISO_DAY.test(s)) return s.split('T')[0];
  return null;
}

/** Collecte récursive de dates YYYY-MM-DD (profondeur limitée). */
function collectIsoDatesDeep(obj, depth, out) {
  if (!obj || depth > 5 || out.length > 20) return;
  if (typeof obj === 'string' && ISO_DAY.test(obj)) {
    out.push(obj.split('T')[0]);
    return;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    if (Array.isArray(obj)) obj.forEach((x) => collectIsoDatesDeep(x, depth + 1, out));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (/^meta$/i.test(k)) continue;
    if (/creation|updated|changed|modified|synced|timestamp/i.test(k)) continue;
    if (typeof v === 'string' && ISO_DAY.test(v)) out.push(v.split('T')[0]);
    else if (v && typeof v === 'object') collectIsoDatesDeep(v, depth + 1, out);
  }
}

function pickStartEndFromAttrs(a) {
  const start = normalizeDay(
    a.startDate ??
      a.beginDate ??
      a.start_date ??
      a.begin_date ??
      a.dateFrom ??
      a.date_from ??
      a.dateDebut ??
      a.date_debut ??
      a.from ??
      a.start ??
      a.date_start ??
      a.day ??
      a.date
  );
  let end = normalizeDay(
    a.endDate ??
      a.dateTo ??
      a.date_to ??
      a.dateFin ??
      a.date_fin ??
      a.to ??
      a.end ??
      a.date_end ??
      a.end_date
  );
  if (!start && a.period && typeof a.period === 'object') {
    const p = a.period;
    const ps = normalizeDay(p.start ?? p.startDate ?? p.beginDate ?? p.from);
    const pe = normalizeDay(p.end ?? p.endDate ?? p.to);
    return { start: ps || start, end: pe || end || ps };
  }
  if (!start && a.interval && typeof a.interval === 'object') {
    const iv = a.interval;
    const ps = normalizeDay(iv.start ?? iv.from);
    const pe = normalizeDay(iv.end ?? iv.to);
    return { start: ps, end: pe || ps };
  }
  return { start, end: end || start };
}

/** Si l’API ne donne qu’un « amount » en jours et une date de début. */
function expandAmountToEnd(start, end, a) {
  if (!start) return { start: null, end: null };
  const startDay = normalizeDay(start);
  const explicitEndRaw =
    a.endDate ??
    a.dateTo ??
    a.date_to ??
    a.dateFin ??
    a.date_fin ??
    a.to ??
    a.end ??
    a.date_end ??
    a.end_date;
  const explicitEnd = normalizeDay(explicitEndRaw);
  if (explicitEnd) return { start: startDay, end: explicitEnd };

  const amt =
    a.amount != null
      ? Number(a.amount)
      : a.duration != null
        ? Number(a.duration)
        : NaN;
  const unit = String(a.unit ?? a.unitOfMeasure ?? a.absenceUnit ?? '').toLowerCase();
  const dayLike =
    !unit ||
    unit === 'day' ||
    unit === 'days' ||
    unit === 'd' ||
    unit === 'jour' ||
    unit === 'jours' ||
    unit === '1' ||
    /\bday\b/i.test(unit);

  if (!Number.isNaN(amt) && amt > 0 && dayLike) {
    const span = Math.max(1, Math.ceil(amt));
    const s = new Date(`${startDay}T12:00:00Z`);
    if (!Number.isNaN(s.getTime())) {
      s.setUTCDate(s.getUTCDate() + span - 1);
      const y = s.getUTCFullYear();
      const m = String(s.getUTCMonth() + 1).padStart(2, '0');
      const d = String(s.getUTCDate()).padStart(2, '0');
      return { start: startDay, end: `${y}-${m}-${d}` };
    }
  }

  const e = normalizeDay(end);
  return { start: startDay, end: e || startDay };
}

function datesFromItem(item) {
  if (!item || typeof item !== 'object') return { start: null, end: null };
  const a = { ...item, ...(item.attributes || {}) };
  let { start, end } = pickStartEndFromAttrs(a);
  if (!start || !end) {
    const found = [];
    collectIsoDatesDeep(item.attributes || item, 0, found);
    found.sort();
    const uniq = [...new Set(found)];
    if (!start && uniq.length) start = uniq[0];
    if (!end && uniq.length) end = uniq[uniq.length - 1];
  }
  ({ start, end } = expandAmountToEnd(start, end, a));
  return { start, end };
}

function monthKey(y, monthIndex0) {
  return `${y}-${String(monthIndex0 + 1).padStart(2, '0')}`;
}

/** Jours calendaires inclusifs par mois pour l’intervalle [start, end]. */
function addCalendarDaysPerMonth(map, resourceId, startStr, endStr) {
  const rid = Number(resourceId);
  if (!startStr || Number.isNaN(rid)) return;
  const sDay = String(startStr).split('T')[0];
  const eDay = String(endStr || startStr).split('T')[0];
  const s = new Date(`${sDay}T12:00:00`);
  const e = new Date(`${eDay}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return;

  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0);
    const segStart = s > monthStart ? s : monthStart;
    const segEnd = e < monthEnd ? e : monthEnd;
    const days = Math.floor((segEnd.getTime() - segStart.getTime()) / 86400000) + 1;
    if (days > 0) {
      const mk = `${rid}|${monthKey(y, m)}`;
      map.set(mk, (map.get(mk) || 0) + days);
    }
    cur = new Date(y, m + 1, 1);
  }
}

/**
 * @param {{ beginDate?: string, endDate?: string }} options — filtre Boond optionnel (YYYY-MM-DD)
 */
async function syncAbsences(options = {}) {
  /** Beaucoup d’instances Boond renvoient ≤ 100 lignes par requête ; 200 faisait croire à une « fin » prématurée. */
  const pageSize = 100;
  const aggregated = new Map();
  const seenAbsenceIds = new Set();
  let rawUnique = 0;
  let sampleItem = null;

  const paramsBase = {
    ...(options.beginDate ? { beginDate: options.beginDate } : {}),
    ...(options.endDate ? { endDate: options.endDate } : {})
  };

  /** Évite de compter deux fois la même absence si page ET offset renvoient les mêmes lignes. */
  const processList = (list) => {
    let added = 0;
    for (const item of list) {
      const idKey = item.id != null && item.id !== '' ? `id:${item.id}` : null;
      if (idKey && seenAbsenceIds.has(idKey)) continue;
      if (idKey) seenAbsenceIds.add(idKey);
      added += 1;
      const rid = resourceIdFromItem(item);
      const { start, end } = datesFromItem(item);
      addCalendarDaysPerMonth(aggregated, rid, start, end);
    }
    return added;
  };

  let metaTotalHint = null;

  // 1) Pagination par page (prioritaire — même principe que /timesreports)
  let prevFirstKey = null;
  const maxPages = 2000;
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await boondManagerService.getAbsences({
      maxResults: pageSize,
      page,
      ...paramsBase
    });
    const list = extractList(payload);
    const metaTotal =
      payload &&
      (payload.total ?? payload.meta?.total ?? payload.meta?.totalItems ?? payload.meta?.count);
    if (metaTotal != null && page === 1) {
      metaTotalHint = metaTotal;
      console.log(`📋 Absences Boond : total annoncé ≈ ${metaTotal}`);
    }

    if (list.length === 0) break;

    const firstKey = list[0].id != null ? String(list[0].id) : JSON.stringify(list[0]).slice(0, 80);
    if (page > 1 && firstKey === prevFirstKey) {
      console.warn(
        '⚠️ Absences : pagination « page » renvoie toujours la même 1re ligne — on tentera « offset ».'
      );
      break;
    }
    prevFirstKey = firstKey;

    if (!sampleItem) sampleItem = list[0];
    const added = processList(list);
    rawUnique += added;

    if (added === 0 && page > 1) break;
    if (list.length < pageSize) break;
    await delay(BOOND_REQUEST_DELAY || 100);
  }

  // 2) Pagination par offset — ramène souvent les enregistrements manquants si « page » est ignorée
  prevFirstKey = null;
  for (let offset = 0; offset <= 250000; offset += pageSize) {
    const payload = await boondManagerService.getAbsences({
      maxResults: pageSize,
      offset,
      ...paramsBase
    });
    const list = extractList(payload);
    if (list.length === 0) break;
    const firstKey = list[0].id != null ? String(list[0].id) : JSON.stringify(list[0]).slice(0, 80);
    if (offset > 0 && firstKey === prevFirstKey) {
      console.warn('⚠️ Absences : « offset » ignoré par l’API (même 1re ligne) — fin du mode offset.');
      break;
    }
    prevFirstKey = firstKey;
    if (!sampleItem) sampleItem = list[0];
    const added = processList(list);
    rawUnique += added;
    if (added === 0) break;
    if (list.length < pageSize) break;
    await delay(BOOND_REQUEST_DELAY || 100);
  }

  // 3) Si toujours vide : une requête large sans pagination
  if (rawUnique === 0) {
    const payload = await boondManagerService.getAbsences({
      maxResults: 5000,
      ...paramsBase
    });
    const list = extractList(payload);
    if (!sampleItem && list.length > 0) sampleItem = list[0];
    rawUnique += processList(list);
  }

  if (metaTotalHint != null && rawUnique < Number(metaTotalHint) * 0.98) {
    console.warn(
      `⚠️ Absences : ${rawUnique} lignes uniques reçues pour un total API annoncé ~${metaTotalHint}. Vérifiez filtres de dates ou la doc Boond.`
    );
  }

  const rawCount = rawUnique;

  const data = [];
  for (const [key, days] of aggregated.entries()) {
    const [resourceIdStr, month] = key.split('|');
    const resourceId = Number(resourceIdStr);
    if (!month || Number.isNaN(resourceId)) continue;
    data.push({ resourceId, month, days: Math.round(days * 10) / 10 });
  }
  data.sort((a, b) => a.resourceId - b.resourceId || a.month.localeCompare(b.month));

  if (rawCount > 0 && data.length === 0 && sampleItem) {
    console.warn(
      '⚠️ Absences Boond :',
      rawCount,
      'ligne(s) reçue(s) mais aucun agrégat (collaborateur ou dates non reconnus). Exemple :',
      JSON.stringify(sampleItem).slice(0, 1500)
    );
  }

  const payload = {
    metadata: {
      syncedAt: new Date().toISOString(),
      source: 'boond-absences',
      rawRecordCount: rawCount,
      aggregateRows: data.length
    },
    data
  };

  await kvStorage.set(KV_KEYS.ABSENCE_MONTHLY, payload);
  console.log(`✅ Absences : ${rawCount} enreg. Boond → ${data.length} lignes (collaborateur × mois)`);
  return payload;
}

if (require.main === module) {
  syncAbsences()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌ sync_absences:', e.message || e);
      process.exit(1);
    });
}

module.exports = {
  syncAbsences,
  extractList,
  addCalendarDaysPerMonth,
  resourceIdFromItem,
  datesFromItem
};
