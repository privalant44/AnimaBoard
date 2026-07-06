import React from 'react';
import './MetricCard.css';

interface MetricCardProps {
  title: string;
  value: string;
  icon: string;
  positive?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, positive }) => {
  return (
    <div className={`metric-card ${positive !== undefined ? (positive ? 'positive' : 'negative') : ''}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <h3 className="metric-title">{title}</h3>
        <p className="metric-value">{value}</p>
      </div>
    </div>
  );
};

export default MetricCard;
