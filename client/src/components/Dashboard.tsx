import React from 'react';
import './Dashboard.css';
import MetricCard from './MetricCard';
import MonthlyChart from './MonthlyChart';
import { DashboardMetrics } from '../types';

interface DashboardProps {
  metrics: DashboardMetrics;
}

const Dashboard: React.FC<DashboardProps> = ({ metrics }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const { monthly, totals } = metrics;

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <section className="metrics-summary">
          <h2>Vue d'ensemble</h2>
          <div className="metrics-grid">
            <MetricCard
              title="Chiffre d'affaires total"
              value={formatCurrency(totals.revenue)}
              icon="💰"
            />
            <MetricCard
              title="Coût ressources facturables"
              value={formatCurrency(totals.billableCost)}
              icon="👥"
            />
            <MetricCard
              title="Coût ressources non facturables"
              value={formatCurrency(totals.nonBillableCost)}
              icon="🔧"
            />
            <MetricCard
              title="Charges totales"
              value={formatCurrency(totals.charges)}
              icon="📊"
            />
            <MetricCard
              title="EBE total"
              value={formatCurrency(totals.ebe)}
              icon="📈"
              positive={totals.ebe >= 0}
            />
            <MetricCard
              title="REX total"
              value={formatCurrency(totals.rex)}
              icon="🎯"
              positive={totals.rex >= 0}
            />
          </div>
        </section>

        <section className="monthly-analysis">
          <h2>Analyse mensuelle</h2>
          <MonthlyChart data={monthly} />
        </section>

        <section className="monthly-details">
          <h2>Détails par mois</h2>
          <div className="table-container">
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Mois</th>
                  <th>CA</th>
                  <th>Coût facturable</th>
                  <th>Coût non facturable</th>
                  <th>Charges</th>
                  <th>TACE</th>
                  <th>TACI</th>
                  <th>EBE</th>
                  <th>REX</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((month, index) => (
                  <tr key={index}>
                    <td className="month-cell">{month.month}</td>
                    <td>{formatCurrency(month.revenue)}</td>
                    <td>{formatCurrency(month.billableCost)}</td>
                    <td>{formatCurrency(month.nonBillableCost)}</td>
                    <td>{formatCurrency(month.charges)}</td>
                    <td>{formatPercentage(month.tace)}</td>
                    <td>{formatPercentage(month.taci)}</td>
                    <td className={month.ebe >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(month.ebe)}
                    </td>
                    <td className={month.rex >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(month.rex)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
