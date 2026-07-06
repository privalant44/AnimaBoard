/** Jours ouvrés (lun–ven) hors ensemble de dates fériées YYYY-MM-DD. */

function normYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekday(d: Date): boolean {
  const wd = d.getDay();
  return wd >= 1 && wd <= 5;
}

export function countWorkdaysInMonth(ym: string, holidayYmd: Set<string>): number {
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m0 = parseInt(parts[1], 10) - 1;
  if (Number.isNaN(y) || Number.isNaN(m0) || m0 < 0 || m0 > 11) return 0;

  let n = 0;
  const d = new Date(y, m0, 1, 12, 0, 0, 0);
  while (d.getMonth() === m0) {
    const key = normYmd(d);
    if (isWeekday(d) && !holidayYmd.has(key)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export function countWorkdaysInYear(year: number, holidayYmd: Set<string>): number {
  let t = 0;
  for (let month = 1; month <= 12; month++) {
    t += countWorkdaysInMonth(`${year}-${String(month).padStart(2, '0')}`, holidayYmd);
  }
  return t;
}

/** Normalise une date fériée API (ISO, camelCase, Date) en YYYY-MM-DD. */
export function normalizeHolidayYmd(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const mo = raw.getMonth() + 1;
    const day = raw.getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Construit un Set depuis la réponse API /french-holidays.json */
export function holidaySetFromApiRows(rows: Array<Record<string, unknown>>): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    const raw = r.holiday_date ?? r.holidayDate;
    const ymd = normalizeHolidayYmd(raw);
    if (ymd) s.add(ymd);
  }
  return s;
}
