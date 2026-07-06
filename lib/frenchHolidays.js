/**
 * Jours fériés France métropole (même règles que l’ancien util client).
 * Utilisé pour le seed SQL et le repli API si la table est vide.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateToYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Lignes pour upsert Supabase : { holiday_date, label, year } */
function getHolidayRowsForYear(year) {
  const rows = [];
  const push = (month, day, label) => {
    const holiday_date = `${year}-${pad2(month)}-${pad2(day)}`;
    rows.push({ holiday_date, label, year });
  };

  push(1, 1, "Jour de l'an");
  push(5, 1, 'Fête du Travail');
  push(5, 8, 'Victoire 1945');
  push(7, 14, 'Fête nationale');
  push(8, 15, 'Assomption');
  push(11, 1, 'Toussaint');
  push(11, 11, 'Armistice 1918');
  push(12, 25, 'Noël');

  const e = easterSunday(year);
  const addE = (delta, label) => {
    const x = new Date(e.getTime());
    x.setDate(x.getDate() + delta);
    const y = x.getFullYear();
    rows.push({ holiday_date: dateToYmd(x), label, year: y });
  };
  addE(1, 'Lundi de Pâques');
  addE(39, 'Ascension');
  addE(50, 'Lundi de Pentecôte');

  const byDate = new Map();
  for (const r of rows) {
    byDate.set(r.holiday_date, r);
  }
  return Array.from(byDate.values());
}

function getHolidayRowsForYearRange(startYear, endYearInclusive) {
  const out = [];
  for (let y = startYear; y <= endYearInclusive; y++) {
    out.push(...getHolidayRowsForYear(y));
  }
  return out;
}

/** À partir de la date courante : `count` années (ex. 10). */
function getHolidayRowsNextYears(count, fromYear = new Date().getFullYear()) {
  return getHolidayRowsForYearRange(fromYear, fromYear + count - 1);
}

module.exports = {
  getHolidayRowsForYear,
  getHolidayRowsForYearRange,
  getHolidayRowsNextYears,
  dateToYmd,
  easterSunday
};
