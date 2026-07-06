/**
 * Parse une date/heure Boond (ex. 2026-06-02T12:39:10+0200) en ISO UTC pour Postgres.
 */
function parseBoondDateTime(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = { parseBoondDateTime };
