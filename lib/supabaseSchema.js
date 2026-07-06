/**
 * Détection des colonnes Supabase (cache en mémoire pour la durée du process).
 */
const { getSupabase } = require('./supabaseClient');

const columnCache = new Map();

function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  const msg = String(error.message || error.details || '');
  return (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the')
  );
}

/**
 * @param {string} table
 * @param {string} column
 * @returns {Promise<boolean>}
 */
async function hasTableColumn(table, column) {
  const key = `${table}.${column}`;
  if (columnCache.has(key)) return columnCache.get(key);

  const supabase = getSupabase();
  if (!supabase) {
    columnCache.set(key, false);
    return false;
  }

  const { error } = await supabase.from(table).select(column).limit(1);
  const ok = !error;
  columnCache.set(key, ok);
  return ok;
}

function clearSchemaCache() {
  columnCache.clear();
}

module.exports = {
  hasTableColumn,
  isMissingColumnError,
  clearSchemaCache,
};
