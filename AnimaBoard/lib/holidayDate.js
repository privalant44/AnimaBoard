/**
 * Normalise une valeur holiday_date (string ISO, date Postgres, Date JS) en YYYY-MM-DD.
 * Évite les clés invalides du type "Fri Dec 25 2026..." si on faisait String(date).split('T')[0].
 */
function toHolidayYmdString(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }
  if (Object.prototype.toString.call(raw) === '[object Date]') {
    const d = raw;
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : '';
}

module.exports = { toHolidayYmdString };
