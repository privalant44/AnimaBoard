import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './HomeTreasuryPlanChart.css';

export interface TreasuryPlanMonthRow {
  month: string;
  sourceMonth: string;
  shiftedCa: number;
  charges: number;
  treasuryBalance: number;
}

interface HomeTreasuryPlanChartProps {
  monthly: TreasuryPlanMonthRow[];
  averagePaymentDelayDays: number;
  initialBalance: number;
  loading?: boolean;
  error?: string | null;
}

const HomeTreasuryPlanChart: React.FC<HomeTreasuryPlanChartProps> = ({
  monthly,
  averagePaymentDelayDays,
  initialBalance,
  loading = false,
  error = null,
}) => {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const formatMonth = (month: string) => {
    const [y, m] = String(month || '').split('-');
    if (!y || !m) return month;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
      month: 'short',
      year: '2-digit',
    });
  };

  const chartData = monthly.map((row) => ({
    ...row,
    label: formatMonth(row.month),
  }));

  if (loading) {
    return (
      <div className="home-treasury-chart">
        <p className="home-treasury-chart-state">Chargement du plan de trésorerie…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-treasury-chart">
        <p className="home-treasury-chart-state home-treasury-chart-state--error">{error}</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="home-treasury-chart">
      <h2 className="home-treasury-chart-title">Plan de trésorerie</h2>
      <p className="home-treasury-chart-subtitle">
        Délai moyen de paiement : {averagePaymentDelayDays} j — Solde initial :{' '}
        {formatCurrency(initialBalance)}
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde8e7" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)} k€`} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'CA encaissé (forecast décalé)') return [formatCurrency(value), name];
              if (name === 'Solde de trésorerie') return [formatCurrency(value), name];
              if (name === 'Charges Pennylane') return [formatCurrency(value), name];
              return [value, name];
            }}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as TreasuryPlanMonthRow & { label: string };
              if (!row?.sourceMonth) return label;
              return `${label} — CA issu du forecast ${formatMonth(row.sourceMonth)}`;
            }}
          />
          <Legend />
          <Bar
            dataKey="shiftedCa"
            fill="#5b8fd9"
            name="CA encaissé (forecast décalé)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="treasuryBalance"
            stroke="#2c5f5d"
            strokeWidth={2.5}
            name="Solde de trésorerie"
            dot={{ r: 4, fill: '#2c5f5d' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HomeTreasuryPlanChart;
