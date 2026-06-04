/**
 * GET /api/data/resources-local - Ressources depuis la base de données (pas l'API)
 * Inclut les labels du dictionnaire pour type et state
 */
const path = require('path');
try {
  require(path.join(__dirname, '..', '..', 'lib', 'secretEnv'));
} catch (e) {}

const kvStorage = require(path.join(__dirname, '..', '..', 'lib', 'kvStorage'));
const { KV_KEYS } = require(path.join(__dirname, '..', '..', 'lib', 'constants'));
const { getSupabase } = require(path.join(__dirname, '..', '..', 'lib', 'supabaseClient'));
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    // Lire les ressources depuis KV/DB
    const stored = await kvStorage.get(KV_KEYS.RESOURCES, []);
    const baseList = Array.isArray(stored) ? stored : (stored?.data || []);

    // Lire le dictionnaire pour type_of et state
    const supabase = getSupabase();
    let dictType = {};
    let dictState = {};

    if (supabase) {
      const { data: dictRows, error } = await supabase
        .from('dictionnaire')
        .select('table_name, column_name, code, label')
        .eq('table_name', 'resources');

      if (!error && dictRows) {
        dictRows.forEach((row) => {
          if (row.column_name === 'type_of') {
            dictType[String(row.code)] = row.label;
          } else if (row.column_name === 'state') {
            dictState[String(row.code)] = row.label;
          }
        });
      }
    }

    // Mapper les ressources avec les labels
    const list = baseList.map((r) => {
      const typeCode = r.typeOf ?? r.type_of ?? null;
      const stateCode = r.state ?? null;
      const typeLabel = typeCode !== null && typeCode !== undefined
        ? (dictType[String(typeCode)] || String(typeCode))
        : 'N/A';
      const stateLabel = stateCode !== null && stateCode !== undefined
        ? (dictState[String(stateCode)] || String(stateCode))
        : undefined;

      return {
        ...r,
        typeLabel,
        stateLabel,
      };
    });

    return sendJson(res, 200, { success: true, data: list, file: 'resources', count: list.length });
  } catch (error) {
    console.error('❌ Erreur /api/data/resources-local:', error);
    return sendJson(res, 500, { success: false, error: error.message });
  }
});
