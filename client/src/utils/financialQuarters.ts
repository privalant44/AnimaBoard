export interface FinancialMonthRow {
  month: string;
  caAnimaNeo: number;
  caSousTraitance: number;
  margeBruteAnimaNeo: number;
  margeBruteSousTraitance: number;
  resultat: number;
  taceBaseDays?: number;
  taceDenominatorDays?: number;
  tacePct: number;
  taceIsClosedMonth?: boolean;
}

export interface FinancialQuarterGroup<T extends FinancialMonthRow = FinancialMonthRow> {
  key: string;
  label: string;
  months: T[];
}

export interface FinancialQuarterAggregate {
  caAnimaNeo: number;
  caSousTraitance: number;
  margeBruteAnimaNeo: number;
  margeBruteSousTraitance: number;
  resultat: number;
  tacePct: number;
  taceIsClosedMonth: boolean;
}

const toNumberOrZero = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function getQuarterFromMonth(month: string): { year: number; quarter: number } {
  const [y, m] = String(month || '').split('-');
  const year = Number(y);
  const monthNum = Number(m);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum)) {
    return { year: 0, quarter: 1 };
  }
  return { year, quarter: Math.ceil(monthNum / 3) };
}

export function groupMonthlyByQuarter<T extends FinancialMonthRow>(
  monthly: T[]
): FinancialQuarterGroup<T>[] {
  const groups: FinancialQuarterGroup<T>[] = [];
  let current: FinancialQuarterGroup<T> | null = null;

  for (const row of monthly) {
    const { year, quarter } = getQuarterFromMonth(row.month);
    const key = `${year}-Q${quarter}`;
    if (!current || current.key !== key) {
      current = {
        key,
        label: `T${quarter} ${year}`,
        months: [],
      };
      groups.push(current);
    }
    current.months.push(row);
  }

  return groups;
}

export function aggregateQuarterMonths(months: FinancialMonthRow[]): FinancialQuarterAggregate {
  const reduced = months.reduce(
    (acc, row) => ({
      caAnimaNeo: acc.caAnimaNeo + toNumberOrZero(row.caAnimaNeo),
      caSousTraitance: acc.caSousTraitance + toNumberOrZero(row.caSousTraitance),
      margeBruteAnimaNeo: acc.margeBruteAnimaNeo + toNumberOrZero(row.margeBruteAnimaNeo),
      margeBruteSousTraitance: acc.margeBruteSousTraitance + toNumberOrZero(row.margeBruteSousTraitance),
      resultat: acc.resultat + toNumberOrZero(row.resultat),
      taceBaseDays: acc.taceBaseDays + toNumberOrZero(row.taceBaseDays),
      tacePct: 0,
    }),
    {
      caAnimaNeo: 0,
      caSousTraitance: 0,
      margeBruteAnimaNeo: 0,
      margeBruteSousTraitance: 0,
      resultat: 0,
      taceBaseDays: 0,
      tacePct: 0,
    }
  );

  const denominator = months.reduce((sum, row) => sum + toNumberOrZero(row.taceDenominatorDays), 0);
  reduced.tacePct = denominator > 0 ? (reduced.taceBaseDays / denominator) * 100 : 0;

  return {
    caAnimaNeo: reduced.caAnimaNeo,
    caSousTraitance: reduced.caSousTraitance,
    margeBruteAnimaNeo: reduced.margeBruteAnimaNeo,
    margeBruteSousTraitance: reduced.margeBruteSousTraitance,
    resultat: reduced.resultat,
    tacePct: reduced.tacePct,
    taceIsClosedMonth: months.length > 0 && months.every((row) => row.taceIsClosedMonth),
  };
}

export function countFinancialTableColumns(
  groups: FinancialQuarterGroup<FinancialMonthRow>[],
  expandedQuarters: Record<string, boolean>
): number {
  return groups.reduce((sum, group) => {
    const expanded = expandedQuarters[group.key] ?? true;
    return sum + (expanded ? group.months.length : 1);
  }, 0);
}
