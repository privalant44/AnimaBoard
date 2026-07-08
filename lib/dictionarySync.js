/**
 * Dictionnaire Boond (type / statut) → table Supabase `dictionnaire`.
 * Utilisé par Ressources, Forecast, Rapports pour afficher des libellés au lieu de codes.
 */
const { getSupabase } = require('./supabaseClient');
const boondManagerService = require('../server/services/boondManagerService');
const kvStorage = require('./kvStorage');
const { KV_KEYS } = require('./constants');

let lastAutoSyncMs = 0;
let lastBoondDictionaryCheckMs = 0;
const AUTO_SYNC_COOLDOWN_MS = 60_000;
const BOOND_DICTIONARY_CHECK_COOLDOWN_MS = 5 * 60_000;

function extractBoondDictionaryPayload(dictionary) {
  return dictionary?.data?.data || dictionary?.data || dictionary || {};
}

function getDictionaryLabelListsFromMaps(maps) {
  const toSortedLabels = (record) =>
    Object.values(record || {})
      .map((label) => String(label))
      .filter((label) => label && label !== 'N/A')
      .sort((a, b) => a.localeCompare(b, 'fr'));

  return {
    types: toSortedLabels(maps?.type_of),
    states: toSortedLabels(maps?.state),
  };
}

async function boondDictionaryHasNewResourceEntries(maps) {
  const now = Date.now();
  if (now - lastBoondDictionaryCheckMs < BOOND_DICTIONARY_CHECK_COOLDOWN_MS) {
    return false;
  }
  lastBoondDictionaryCheckMs = now;

  try {
    const dictionary = await boondManagerService.getDictionary();
    if (!dictionary) return false;

    const dict = extractBoondDictionaryPayload(dictionary);
    const rows = buildDictionaryRows(dict).filter((row) => row.table_name === 'resources');
    const boondStateCodes = new Set(
      rows.filter((row) => row.column_name === 'state').map((row) => row.code)
    );
    const boondTypeCodes = new Set(
      rows.filter((row) => row.column_name === 'type_of').map((row) => row.code)
    );
    const localStateCodes = new Set(Object.keys(maps?.state || {}));
    const localTypeCodes = new Set(Object.keys(maps?.type_of || {}));

    for (const code of boondStateCodes) {
      if (!localStateCodes.has(code)) return true;
    }
    for (const code of boondTypeCodes) {
      if (!localTypeCodes.has(code)) return true;
    }
  } catch (error) {
    console.error('[dictionarySync] Vérification dictionnaire Boond:', error.message || error);
  }

  return false;
}

function buildDictionaryRows(dict) {
  const typeOfList = dict?.setting?.typeOf?.resource || [];
  const opportunityTypeOfList = dict?.setting?.typeOf?.project || dict?.setting?.typeOf?.opportunity || [];
  const resourceStateList = dict?.setting?.state?.resource || [];
  const opportunityStateList = dict?.setting?.state?.opportunity || [];

  const rows = [];
  (Array.isArray(typeOfList) ? typeOfList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({
        table_name: 'resources',
        column_name: 'type_of',
        code: String(item.id),
        label: String(item.value),
      });
    }
  });
  (Array.isArray(resourceStateList) ? resourceStateList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({
        table_name: 'resources',
        column_name: 'state',
        code: String(item.id),
        label: String(item.value),
      });
    }
  });
  (Array.isArray(opportunityTypeOfList) ? opportunityTypeOfList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({
        table_name: 'opportunities',
        column_name: 'type_of',
        code: String(item.id),
        label: String(item.value),
      });
    }
  });
  (Array.isArray(opportunityStateList) ? opportunityStateList : []).forEach((item) => {
    if (item?.id != null && item?.value != null) {
      rows.push({
        table_name: 'opportunities',
        column_name: 'state',
        code: String(item.id),
        label: String(item.value),
      });
    }
  });

  const seen = new Set();
  return rows.filter((r) => {
    const key = `${r.table_name}|${r.column_name}|${r.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function syncDictionaryFromBoond() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }

  const dictionary = await boondManagerService.getDictionary();
  const dict = extractBoondDictionaryPayload(dictionary);
  const uniqueRows = buildDictionaryRows(dict);

  for (let i = 0; i < uniqueRows.length; i += 100) {
    const chunk = uniqueRows.slice(i, i + 100);
    const { error } = await supabase
      .from('dictionnaire')
      .upsert(chunk, { onConflict: 'table_name,column_name,code' });
    if (error) throw error;
  }

  const countBy = (table, column) =>
    uniqueRows.filter((r) => r.table_name === table && r.column_name === column).length;

  lastBoondDictionaryCheckMs = 0;

  return {
    count: uniqueRows.length,
    resourcesTypeOf: countBy('resources', 'type_of'),
    resourcesState: countBy('resources', 'state'),
    opportunitiesTypeOf: countBy('opportunities', 'type_of'),
    opportunitiesState: countBy('opportunities', 'state'),
  };
}

async function loadDictionaryMaps(tableName = 'resources') {
  const maps = { type_of: {}, state: {} };
  const supabase = getSupabase();
  if (!supabase) return maps;

  const { data: dictRows, error } = await supabase
    .from('dictionnaire')
    .select('table_name, column_name, code, label')
    .eq('table_name', tableName);

  if (error) {
    console.error(`[dictionarySync] Lecture dictionnaire (${tableName}):`, error.message || error);
    return maps;
  }

  (dictRows || []).forEach((row) => {
    if (row.column_name === 'type_of') {
      maps.type_of[String(row.code)] = row.label;
    } else if (row.column_name === 'state') {
      maps.state[String(row.code)] = row.label;
    }
  });

  return maps;
}

function resourceNeedsDictionarySync(resources, maps) {
  if (Object.keys(maps.type_of).length === 0 || Object.keys(maps.state).length === 0) {
    return true;
  }

  for (const r of resources) {
    const typeCode = r.typeOf ?? r.type_of;
    const stateCode = r.state;
    if (typeCode != null && typeCode !== '' && !maps.type_of[String(typeCode)]) return true;
    if (stateCode != null && stateCode !== '' && !maps.state[String(stateCode)]) return true;
  }

  return false;
}

function looksLikeUnresolvedCode(label, code) {
  if (label == null || label === '') return true;
  return String(label) === String(code);
}

function enrichResourcesWithLabels(baseList, maps) {
  const dictType = maps?.type_of || {};
  const dictState = maps?.state || {};

  return baseList.map((r) => {
    const typeCode = r.typeOf ?? r.type_of ?? null;
    const stateCode = r.state ?? null;
    const typeLabel =
      typeCode !== null && typeCode !== undefined
        ? dictType[String(typeCode)] || String(typeCode)
        : 'N/A';
    const stateLabel =
      stateCode !== null && stateCode !== undefined
        ? dictState[String(stateCode)] || String(stateCode)
        : undefined;

    return {
      ...r,
      typeLabel,
      stateLabel,
    };
  });
}

async function ensureResourceDictionary(resources) {
  let maps = await loadDictionaryMaps('resources');
  const list = Array.isArray(resources) ? resources : [];

  const needsSync = resourceNeedsDictionarySync(list, maps);
  const hasUnresolvedLabels = list.some((r) => {
    const typeCode = r.typeOf ?? r.type_of;
    const stateCode = r.state;
    const typeLabel = typeCode != null ? maps.type_of[String(typeCode)] : null;
    const stateLabel = stateCode != null ? maps.state[String(stateCode)] : null;
    return (
      (typeCode != null && looksLikeUnresolvedCode(typeLabel, typeCode)) ||
      (stateCode != null && looksLikeUnresolvedCode(stateLabel, stateCode))
    );
  });

  const hasNewBoondEntries = await boondDictionaryHasNewResourceEntries(maps);

  if (
    (needsSync || hasUnresolvedLabels || hasNewBoondEntries) &&
    Date.now() - lastAutoSyncMs >= AUTO_SYNC_COOLDOWN_MS
  ) {
    lastAutoSyncMs = Date.now();
    try {
      const reason = hasNewBoondEntries
        ? 'nouveaux codes Boond détectés'
        : 'dictionnaire incomplet';
      console.log(`[dictionarySync] ${reason} — synchronisation Boond…`);
      await syncDictionaryFromBoond();
      maps = await loadDictionaryMaps('resources');
    } catch (error) {
      console.error('[dictionarySync] Échec auto-sync:', error.message || error);
    }
  }

  return maps;
}

async function getResourcesLocalPayload() {
  const stored = await kvStorage.get(KV_KEYS.RESOURCES, []);
  const baseList = Array.isArray(stored) ? stored : (stored?.data || []);
  const maps = await ensureResourceDictionary(baseList);
  return {
    resources: enrichResourcesWithLabels(baseList, maps),
    dictionaryOptions: getDictionaryLabelListsFromMaps(maps),
  };
}

async function getResourcesLocalEnriched() {
  const payload = await getResourcesLocalPayload();
  return payload.resources;
}

module.exports = {
  syncDictionaryFromBoond,
  loadDictionaryMaps,
  ensureResourceDictionary,
  enrichResourcesWithLabels,
  getResourcesLocalEnriched,
  getResourcesLocalPayload,
  getDictionaryLabelListsFromMaps,
  buildDictionaryRows,
};
