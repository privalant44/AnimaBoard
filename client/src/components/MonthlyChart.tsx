import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './MonthlyChart.css';
import { MonthlyMetric } from '../types';

interface MonthlyChartProps {
  data: MonthlyMetric[];
}

const MonthlyChart: React.FC<MonthlyChartProps> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const chartData = data.map(item => ({
    ...item,
    month: item.month.substring(5) // Afficher seulement MM-YYYY
  }));

  return (
    <div className="monthly-charts">
      <div className="chart-container">
        <h3>Chiffre d'affaires et Charges par mois</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="revenue" fill="#667eea" name="Chiffre d'affaires" />
            <Bar dataKey="charges" fill="#ef4444" name="Charges" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-container">
        <h3>EBE et REX par mois</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            <Line
              type="monotone"
              dataKey="ebe"
              stroke="#10b981"
              strokeWidth={2}
              name="EBE"
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="rex"
              stroke="#f59e0b"
              strokeWidth={2}
              name="REX"
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-container">
        <h3>TACE et TACI par mois</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
            <Legend />
            <Line
              type="monotone"
              dataKey="tace"
              stroke="#8b5cf6"
              strokeWidth={2}
              name="TACE"
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="taci"
              stroke="#06b6d4"
              strokeWidth={2}
              name="TACI"
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MonthlyChart;
