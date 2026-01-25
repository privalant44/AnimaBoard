export interface MonthlyMetric {
  month: string;
  revenue: number;
  billableCost: number;
  nonBillableCost: number;
  charges: number;
  tace: number;
  taci: number;
  ebe: number;
  rex: number;
}

export interface Totals {
  revenue: number;
  billableCost: number;
  nonBillableCost: number;
  charges: number;
  ebe: number;
  rex: number;
}

export interface DashboardMetrics {
  monthly: MonthlyMetric[];
  totals: Totals;
}
