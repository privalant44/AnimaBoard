import React from 'react';
import './PageShell.css';

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const PageShell: React.FC<PageShellProps> = ({
  title,
  subtitle,
  actions,
  children,
  className = '',
  'data-testid': testId,
}) => (
  <div className={`page-shell ${className}`.trim()} data-testid={testId}>
    <header className="page-shell-header">
      <div className="page-shell-heading">
        <h1 className="page-shell-title">{title}</h1>
        {subtitle ? <p className="page-shell-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-shell-actions">{actions}</div> : null}
    </header>
    <div className="page-shell-body">{children}</div>
  </div>
);

export default PageShell;
