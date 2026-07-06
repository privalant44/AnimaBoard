import React, { useEffect, useState } from 'react';
import './Login.css';

const LOGO_STORAGE_KEY = 'animaLogo';

type LoginProps = {
  onMicrosoftLogin: () => void;
  onLocalLogin: (username: string, password: string) => Promise<void>;
  localError?: string | null;
  localLoading?: boolean;
  microsoftAvailable?: boolean;
};

const Login: React.FC<LoginProps> = ({
  onMicrosoftLogin,
  onLocalLogin,
  localError,
  localLoading = false,
  microsoftAvailable = true,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const savedLogo = localStorage.getItem(LOGO_STORAGE_KEY);
    if (savedLogo) setLogoUrl(savedLogo);
  }, []);

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLocalLogin(username.trim(), password);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo Anima Néo" className="login-logo-image" />
          ) : (
            <div className="login-logo" aria-hidden>
              AN
            </div>
          )}
          {!logoUrl && <div className="login-brand-text">Anima Néo</div>}
        </div>
        <p className="login-welcome">Bienvenue sur</p>
        <h1 className="login-title">AnimaBoard</h1>

        {microsoftAvailable && (
          <>
            <button
              type="button"
              className="login-ms-button"
              onClick={() => onMicrosoftLogin()}
            >
              <span className="login-ms-icon" aria-hidden>
                <svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
              </span>
              Se connecter avec Microsoft
            </button>

            <div className="login-separator" aria-hidden>
              <span className="login-separator-line" />
              <span className="login-separator-label">OU</span>
              <span className="login-separator-line" />
            </div>
          </>
        )}

        <form className="login-form" onSubmit={handleLocalSubmit}>
          <label className="login-field">
            <span className="login-field-label">Identifiant</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={localLoading}
              required
            />
          </label>
          <label className="login-field">
            <span className="login-field-label">Mot de passe</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={localLoading}
              required
            />
          </label>
          {localError && (
            <p className="login-error" role="alert">
              {localError}
            </p>
          )}
          <button type="submit" className="login-submit-button" disabled={localLoading}>
            {localLoading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <button type="button" className="login-forgot-link" disabled title="Bientôt disponible">
          J&apos;ai oublié mon mot de passe ?
        </button>
      </div>
    </div>
  );
};

export default Login;
