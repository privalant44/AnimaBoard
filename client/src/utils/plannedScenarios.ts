/** Filtre cumulatif : Aucun = hors scénarios ; Pn = P1…Pn inclus. */
export function parseScenarioFilter(raw: string): 'none' | number {
  if (raw === 'none' || !raw) return 'none';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 'none';
}

export function scenarioIncluded(scenario: number, filter: 'none' | number): boolean {
  if (filter === 'none') return false;
  return scenario <= filter;
}

export function formatPlannedScenarioFilterLabel(filter: 'none' | number): string {
  if (filter === 'none') return 'Aucun';
  if (filter === 1) return 'P1';
  return `P1 à P${filter}`;
}

export function buildScenarioFilterOptions(maxScenario: number): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: 'none', label: 'Aucun' }];
  for (let n = 1; n <= maxScenario; n++) {
    options.push({
      value: String(n),
      label: n === 1 ? 'P1' : `P1 à P${n}`,
    });
  }
  return options;
}

export type PlannedForecastItem = {
  scenario: number;
  forecast: Record<string, number>;
};

export function getPlannedDaysForMonth(
  items: PlannedForecastItem[] | undefined,
  month: string,
  scenarioFilter: 'none' | number
): number {
  if (scenarioFilter === 'none' || !items?.length) return 0;
  let total = 0;
  for (const item of items) {
    if (!scenarioIncluded(item.scenario, scenarioFilter)) continue;
    total += item.forecast?.[month] ?? 0;
  }
  return total;
}
