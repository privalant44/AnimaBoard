import React from 'react';
import {
  BarChart,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './HomeMonthlyRecapChart.css';

export interface HomeMonthlyChartRow {
  month: string;
  caAnimaNeo: number;
  caSousTraitance: number;
  resultat: number;
  tacePct: number;
  besoinsCrees: number;
  besoinsStock: number;
  besoinsGagnes: number;
  besoinsPerdus: number;
  besoinsAbandonnes: number;
  besoinsStandBy: number;
  delaiMoyenReponseDays: number;
}

interface HomeMonthlyRecapChartProps {
  monthly: HomeMonthlyChartRow[];
  canFinancial: boolean;
  canBesoins: boolean;
  section?: 'financial' | 'besoins';
}

const formatMonthLabel = (month: string) => {
  const [y, m] = String(month || '').split('-');
  if (!y || !m) return month;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'short',
    year: '2-digit',
  });
};

const HomeMonthlyRecapChart: React.FC<HomeMonthlyRecapChartProps> = ({
  monthly,
  canFinancial,
  canBesoins,
  section,
}) => {
  const showFinancial = canFinancial && (!section || section === 'financial');
  const showBesoins = canBesoins && (!section || section === 'besoins');
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const chartData = monthly.map((row) => ({
    ...row,
    label: formatMonthLabel(row.month),
  }));

  if (chartData.length === 0) {
    return (
      <div className="home-recap-chart" data-testid="home-recap-chart-view">
        <p className="home-recap-chart-state">Aucune donnée à afficher.</p>
      </div>
    );
  }

  return (
    <div className="home-recap-chart" data-testid="home-recap-chart-view">
      {showFinancial && (
        <section className="home-recap-chart-section" data-testid="home-recap-chart-financial">
          {!section && <h2 className="home-recap-chart-title">Indicateurs financiers</h2>}
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dde8e7" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="currency"
                tickFormatter={(value) => `${(value / 1000).toFixed(0)} k€`}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tickFormatter={(value) => `${value} %`}
                tick={{ fontSize: 12 }}
                domain={[0, 'auto']}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'TACE') return [`${(value || 0).toFixed(1)} %`, name];
                  return [formatCurrency(value), name];
                }}
              />
              <Legend />
              <Bar
                yAxisId="currency"
                dataKey="caAnimaNeo"
                fill="#5b8fd9"
                name="CA Anima Néo"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="currency"
                dataKey="caSousTraitance"
                fill="#a6c9c8"
                name="CA Sous-traitance"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="currency"
                type="monotone"
                dataKey="resultat"
                stroke="#2c5f5d"
                strokeWidth={2.5}
                name="Résultat"
                dot={{ r: 4, fill: '#2c5f5d' }}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="tacePct"
                stroke="#f59e0b"
                strokeWidth={2}
                name="TACE"
                dot={{ r: 3, fill: '#f59e0b' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      )}

      {showBesoins && (
        <section className="home-recap-chart-section" data-testid="home-recap-chart-besoins">
          {!section && <h2 className="home-recap-chart-title">Indicateurs besoins</h2>}
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dde8e7" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'Délai moyen (j)') return [`${(value || 0).toFixed(1)} j`, name];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar dataKey="besoinsCrees" fill="#667eea" name="Créés" radius={[3, 3, 0, 0]} />
              <Bar dataKey="besoinsStock" fill="#06b6d4" name="Stock" radius={[3, 3, 0, 0]} />
              <Bar dataKey="besoinsGagnes" fill="#10b981" name="Gagnés" radius={[3, 3, 0, 0]} />
              <Bar dataKey="besoinsPerdus" fill="#ef4444" name="Perdus" radius={[3, 3, 0, 0]} />
              <Bar dataKey="besoinsAbandonnes" fill="#94a3b8" name="Abandonnés" radius={[3, 3, 0, 0]} />
              <Bar dataKey="besoinsStandBy" fill="#f59e0b" name="Stand by" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dde8e7" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(value) => `${value} j`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => [`${(value || 0).toFixed(1)} j`, 'Délai moyen']} />
              <Legend />
              <Line
                type="monotone"
                dataKey="delaiMoyenReponseDays"
                stroke="#8b5cf6"
                strokeWidth={2}
                name="Délai moyen (j)"
                dot={{ r: 4, fill: '#8b5cf6' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
};

export default HomeMonthlyRecapChart;
