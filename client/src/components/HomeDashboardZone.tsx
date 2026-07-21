import React from 'react';
import './HomeDashboardZone.css';

export type DashboardZoneViewMode = 'chart' | 'table';

interface HomeDashboardZoneProps {
  title: string;
  testId: string;
  viewMode: DashboardZoneViewMode;
  onViewModeChange: (mode: DashboardZoneViewMode) => void;
  chart: React.ReactNode;
  table: React.ReactNode;
  spanFull?: boolean;
  chartToggleTestId?: string;
  tableToggleTestId?: string;
}

const HomeDashboardZone: React.FC<HomeDashboardZoneProps> = ({
  title,
  testId,
  viewMode,
  onViewModeChange,
  chart,
  table,
  spanFull = false,
  chartToggleTestId,
  tableToggleTestId,
}) => (
  <section
    className={`home-dashboard-zone${spanFull ? ' home-dashboard-zone--full' : ''}`}
    data-testid={testId}
    aria-labelledby={`${testId}-title`}
  >
    <header className="home-dashboard-zone-header">
      <h2 className="home-dashboard-zone-title" id={`${testId}-title`}>
        {title}
      </h2>
      <div className="home-recap-view-toggle" role="group" aria-label={`Mode d'affichage — ${title}`}>
        <button
          type="button"
          className={`home-recap-view-toggle-btn${viewMode === 'chart' ? ' is-active' : ''}`}
          data-testid={chartToggleTestId || `${testId}-view-chart`}
          aria-pressed={viewMode === 'chart'}
          onClick={() => onViewModeChange('chart')}
        >
          Graphique
        </button>
        <button
          type="button"
          className={`home-recap-view-toggle-btn${viewMode === 'table' ? ' is-active' : ''}`}
          data-testid={tableToggleTestId || `${testId}-view-table`}
          aria-pressed={viewMode === 'table'}
          onClick={() => onViewModeChange('table')}
        >
          Tableau détaillé
        </button>
      </div>
    </header>
    <div className="home-dashboard-zone-body">
      {viewMode === 'chart' ? chart : table}
    </div>
  </section>
);

export default HomeDashboardZone;
