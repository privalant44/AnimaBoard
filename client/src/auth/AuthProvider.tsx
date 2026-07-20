import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import {

  AccountInfo,

  EventType,

  PublicClientApplication,

} from '@azure/msal-browser';

import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';

import { apiFetch, setAuthTokenGetter } from '../api';

import Login from '../components/Login';

import {

  buildLoginRequest,

  buildMsalConfig,

  buildTokenRequest,

  isAuthEnabled,

  pickMicrosoftApiToken,

} from './msalConfig';

import {

  clearLocalSession,

  getLocalSession,

  setLocalSession,

  LocalSession,

} from './localSession';

import type { AppRole, AppTab, Permission } from './roles';

import { useUserAccess } from './useUserAccess';



export type AuthContextValue = {

  account: AccountInfo | null;

  displayName: string;

  email: string;

  authMethod: 'microsoft' | 'local';

  logout: () => void;

  role: AppRole | null;

  roleLabel: string;

  permissions: string[];

  accessLoading: boolean;

  accessError: string | null;

  can: (permission: Permission) => boolean;

  canView: (view: import('./roles').ViewPermission) => boolean;

  canTab: (tab: AppTab) => boolean;

  restrictForecastToPersonal: boolean;

  refreshAccess: () => Promise<void>;

};



const AuthContext = React.createContext<AuthContextValue | null>(null);



export function useAuth(): AuthContextValue | null {

  return React.useContext(AuthContext);

}



function AuthenticatedShell({

  base,

  children,

}: {

  base: Omit<

    AuthContextValue,

    'role' | 'roleLabel' | 'permissions' | 'accessLoading' | 'accessError' | 'can' | 'canView' | 'canTab' | 'restrictForecastToPersonal' | 'refreshAccess'

  >;

  children: React.ReactNode;

}) {

  const access = useUserAccess(true);



  const contextValue = useMemo<AuthContextValue>(

    () => ({

      ...base,

      role: access.role,

      roleLabel: access.roleLabel,

      permissions: access.permissions,

      accessLoading: access.loading,

      accessError: access.error,

      can: access.can,

      canView: access.canView,

      canTab: access.canTab,

      restrictForecastToPersonal: access.restrictForecastToPersonal,

      refreshAccess: access.refresh,

    }),

    [base, access]

  );



  if (access.loading) {

    return (

      <div className="auth-loading">

        <p>Chargement de votre profil…</p>

      </div>

    );

  }



  if (access.error) {
    return (
      <div className="auth-loading">
        <p>{access.error}</p>
        <div className="auth-loading-actions">
          <button type="button" onClick={() => access.refresh()}>
            Réessayer
          </button>
          <button type="button" onClick={() => base.logout()}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }



  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;

}



function LocalAuthGate({

  session,

  onSessionChange,

  children,

}: {

  session: LocalSession;

  onSessionChange: (s: LocalSession | null) => void;

  children: React.ReactNode;

}) {

  useLayoutEffect(() => {

    setAuthTokenGetter(async () => session.token);

    return () => setAuthTokenGetter(async () => null);

  }, [session.token]);



  const logout = useCallback(() => {

    clearLocalSession();

    onSessionChange(null);

  }, [onSessionChange]);



  const base = useMemo(

    () => ({

      account: null as AccountInfo | null,

      displayName: session.displayName,

      email: session.email,

      authMethod: 'local' as const,

      logout,

    }),

    [session.displayName, session.email, logout]

  );



  return <AuthenticatedShell base={base}>{children}</AuthenticatedShell>;

}



async function loginWithLocalCredentials(

  username: string,

  password: string

): Promise<{ session: LocalSession } | { error: string }> {

  try {

    const res = await apiFetch('/api/auth/local/login', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ username, password }),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {

      return {

        error: (data as { error?: string }).error || 'Connexion impossible',

      };

    }

    const token = (data as { token?: string }).token;

    const user = (data as { user?: { displayName?: string; email?: string } }).user;

    if (!token || !user?.displayName) {

      return { error: 'Réponse serveur invalide' };

    }

    const session: LocalSession = {

      token,

      displayName: user.displayName,

      email: user.email || '',

    };

    setLocalSession(session);

    return { session };

  } catch {

    return { error: 'Impossible de joindre le serveur API' };

  }

}



function LocalOnlyAuthGate({ children }: { children: React.ReactNode }) {

  const [localSession, setLocalSessionState] = useState<LocalSession | null>(() =>

    getLocalSession()

  );

  const [localError, setLocalError] = useState<string | null>(null);

  const [localLoading, setLocalLoading] = useState(false);



  const handleLocalLogin = useCallback(async (username: string, password: string) => {

    setLocalError(null);

    setLocalLoading(true);

    const result = await loginWithLocalCredentials(username, password);

    setLocalLoading(false);

    if ('error' in result) {

      setLocalError(result.error);

      return;

    }

    setLocalSessionState(result.session);

  }, []);



  if (localSession) {

    return (

      <LocalAuthGate session={localSession} onSessionChange={setLocalSessionState}>

        {children}

      </LocalAuthGate>

    );

  }



  return (

    <Login

      onMicrosoftLogin={() => {}}

      onLocalLogin={handleLocalLogin}

      localError={localError}

      localLoading={localLoading}

      microsoftAvailable={false}

    />

  );

}



function MsalAuthGate({ children }: { children: React.ReactNode }) {

  const { instance, accounts } = useMsal();

  const isAuthenticated = useIsAuthenticated();

  const [ready, setReady] = useState(false);

  const [localSession, setLocalSessionState] = useState<LocalSession | null>(() =>

    getLocalSession()

  );

  const [localError, setLocalError] = useState<string | null>(null);

  const [localLoading, setLocalLoading] = useState(false);
  const [msTokenState, setMsTokenState] = useState<'idle' | 'pending' | 'ready' | 'failed'>('idle');

  useEffect(() => {
    const id = instance.addEventCallback((event) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS ||
        event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS ||
        event.eventType === EventType.HANDLE_REDIRECT_END
      ) {
        setReady(true);
      }
    });
    instance.handleRedirectPromise().finally(() => setReady(true));
    return () => {
      if (id) instance.removeEventCallback(id);
    };
  }, [instance]);



  const acquireAccessToken = useCallback(async (): Promise<string | null> => {
    const account =
      accounts[0] ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
    if (!account) return null;

    const request = { ...buildTokenRequest(), account };

    const tryAcquire = async (interactive: boolean): Promise<string | null> => {
      try {
        const result = interactive
          ? await instance.acquireTokenPopup(request)
          : await instance.acquireTokenSilent(request);
        return pickMicrosoftApiToken(result);
      } catch {
        return null;
      }
    };

    let token = await tryAcquire(false);
    if (!token) token = await tryAcquire(true);
    if (!token) {
      console.error('Impossible d’obtenir un jeton Microsoft pour l’API');
    }
    return token;
  }, [instance, accounts]);



  useLayoutEffect(() => {
    if (localSession) return;
    setAuthTokenGetter(acquireAccessToken);
    return () => setAuthTokenGetter(async () => null);
  }, [acquireAccessToken, localSession]);

  useEffect(() => {
    if (!isAuthenticated || localSession) {
      setMsTokenState('idle');
      return;
    }
    let cancelled = false;
    setMsTokenState('pending');
    acquireAccessToken().then((token) => {
      if (cancelled) return;
      setMsTokenState(token ? 'ready' : 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, localSession, acquireAccessToken, accounts]);



  const handleLocalLogin = useCallback(async (username: string, password: string) => {

    setLocalError(null);

    setLocalLoading(true);

    const result = await loginWithLocalCredentials(username, password);

    setLocalLoading(false);

    if ('error' in result) {

      setLocalError(result.error);

      return;

    }

    setLocalSessionState(result.session);

  }, []);



  const logoutMicrosoft = useCallback(() => {
    clearLocalSession();
    setAuthTokenGetter(async () => null);
    instance.setActiveAccount(null);
    instance
      .clearCache()
      .catch(() => undefined)
      .finally(() => {
        // Déconnexion locale uniquement : pas de popup Microsoft « Choisir un compte »
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith('msal.'))
          .forEach((key) => sessionStorage.removeItem(key));
        window.location.replace(window.location.origin);
      });
  }, [instance]);

  const retryMsToken = useCallback(async () => {
    setMsTokenState('pending');
    const token = await acquireAccessToken();
    setMsTokenState(token ? 'ready' : 'failed');
  }, [acquireAccessToken]);



  const account = accounts[0] ?? null;

  const displayName = account?.name || account?.username || 'Utilisateur';

  const email = account?.username || '';



  const msBase = useMemo(

    () => ({

      account,

      displayName,

      email,

      authMethod: 'microsoft' as const,

      logout: logoutMicrosoft,

    }),

    [account, displayName, email, logoutMicrosoft]

  );



  if (localSession) {

    return (

      <LocalAuthGate session={localSession} onSessionChange={setLocalSessionState}>

        {children}

      </LocalAuthGate>

    );

  }



  if (!ready) {

    return (

      <div className="auth-loading">

        <p>Chargement de la session…</p>

      </div>

    );

  }



  if (!isAuthenticated) {

    return (

      <Login

        onMicrosoftLogin={() => instance.loginPopup(buildLoginRequest())}

        onLocalLogin={handleLocalLogin}

        localError={localError}

        localLoading={localLoading}

        microsoftAvailable

      />

    );

  }

  if (msTokenState === 'pending' || msTokenState === 'idle') {
    return (
      <div className="auth-loading">
        <p>Préparation de la session…</p>
      </div>
    );
  }

  if (msTokenState === 'failed') {
    return (
      <div className="auth-loading">
        <p>Impossible d&apos;obtenir un jeton Microsoft pour l&apos;API.</p>
        <div className="auth-loading-actions">
          <button type="button" onClick={() => retryMsToken()}>
            Réessayer
          </button>
          <button type="button" onClick={() => logoutMicrosoft()}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }



  return <AuthenticatedShell base={msBase}>{children}</AuthenticatedShell>;

}



function AuthDisabled({ children }: { children: React.ReactNode }) {

  useEffect(() => {

    setAuthTokenGetter(async () => null);

  }, []);



  const contextValue = useMemo<AuthContextValue>(

    () => ({

      account: null,

      displayName: 'Invité',

      email: '',

      authMethod: 'microsoft',

      logout: () => {},

      role: null,

      roleLabel: '',

      permissions: [],

      accessLoading: false,

      accessError: null,

      can: () => true,

      canView: () => true,

      canTab: () => true,

      restrictForecastToPersonal: false,

      refreshAccess: async () => {},

    }),

    []

  );



  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;

}



export default function AuthProvider({ children }: { children: React.ReactNode }) {

  const [pca, setPca] = useState<PublicClientApplication | null>(null);

  const [msalReady, setMsalReady] = useState(false);

  const [localSession] = useState<LocalSession | null>(() => getLocalSession());



  useEffect(() => {

    if (!isAuthEnabled()) return;

    const config = buildMsalConfig();

    if (!config) return;

    const app = new PublicClientApplication(config);

    app.initialize().then(() => {

      setPca(app);

      setMsalReady(true);

    });

  }, []);



  if (!isAuthEnabled()) {

    return <AuthDisabled>{children}</AuthDisabled>;

  }



  if (localSession) {

    return (

      <LocalAuthGate

        session={localSession}

        onSessionChange={() => {

          window.location.reload();

        }}

      >

        {children}

      </LocalAuthGate>

    );

  }



  if (!msalReady || !pca) {

    if (!buildMsalConfig()) {

      return <LocalOnlyAuthGate>{children}</LocalOnlyAuthGate>;

    }

    return (

      <div className="auth-loading">

        <p>Initialisation Microsoft…</p>

      </div>

    );

  }



  return (

    <MsalProvider instance={pca}>

      <MsalAuthGate>{children}</MsalAuthGate>

    </MsalProvider>

  );

}

