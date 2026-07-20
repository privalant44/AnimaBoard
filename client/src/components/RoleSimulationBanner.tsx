import React from 'react';
import { useAuth } from '../auth/AuthProvider';
import './RoleSimulationBanner.css';

const RoleSimulationBanner: React.FC = () => {
  const auth = useAuth();

  if (!auth?.isSimulating || !auth.simulatedRole) return null;

  return (
    <div className="role-simulation-banner" role="status" data-testid="role-simulation-banner">
      <span>
        Mode simulation : vous visualisez l&apos;application en tant que{' '}
        <strong>{auth.roleLabel}</strong>
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
