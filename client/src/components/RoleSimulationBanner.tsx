import React, { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { buildRoleSimulationTitle } from '../auth/roleSimulation';
import './RoleSimulationBanner.css';

const RoleSimulationBanner: React.FC = () => {
  const auth = useAuth();

  const title =
    auth?.isSimulating && auth.roleLabel ? buildRoleSimulationTitle(auth.roleLabel) : null;

  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  if (!auth?.isSimulating || !auth.simulatedRole || !title) return null;

  return (
    <div className="role-simulation-banner" role="status" data-testid="role-simulation-banner">
      <span className="role-simulation-banner-title" data-testid="role-simulation-title">
        {title}
      </span>
      <button
        type="button"
        className="role-simulation-banner-button"
        onClick={() => auth.stopRoleSimulation()}
        data-testid="role-simulation-banner-stop"
      >
        Quitter la simulation
      </button>
    </div>
  );
};

export default RoleSimulationBanner;
