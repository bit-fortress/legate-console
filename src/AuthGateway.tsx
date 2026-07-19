import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getCurrentAdmin, getPublicAuthConfig, logoutAdmin, setUnauthorizedHandler } from './api';
import {
  clearDevAdminToken,
  decideAnonymousAdminEntry,
  initializeAdminAuth,
  normalizeAdminAuthError,
  normalizePublicAdminAuthConfig,
  sanitizeAdminReturnPath,
  setDevAdminToken,
  type AdminAuthError,
  type AdminPrincipal,
  type PublicAdminAuthConfig
} from './auth';
import LoginPage, { loginStartURL } from './LoginPage';
import legateLogo from './assets/legate-transparent.png';

export interface AuthenticatedAdminSession {
  admin: AdminPrincipal;
  authConfig: PublicAdminAuthConfig;
  onLogout: () => Promise<void>;
}

export interface AdminNavigationAdapter {
  current: () => { pathname: string; search: string };
  replaceHistory: (url: string) => void;
  replaceLocation: (url: string) => void;
}

interface AuthGatewayProps {
  children: (session: AuthenticatedAdminSession) => ReactNode;
  navigation?: AdminNavigationAdapter;
}

type GatewayState =
  | { phase: 'checking' }
  | { phase: 'anonymous'; config: PublicAdminAuthConfig; returnTo: string; manual: boolean; authError?: AdminAuthError }
  | { phase: 'authenticated'; config: PublicAdminAuthConfig; admin: AdminPrincipal }
  | { phase: 'failed'; returnTo: string };

const browserNavigation: AdminNavigationAdapter = {
  current: () => ({ pathname: window.location.pathname, search: window.location.search }),
  replaceHistory: (url) => window.history.replaceState({}, '', url),
  replaceLocation: (url) => window.location.replace(url)
};

export default function AuthGateway({ children, navigation = browserNavigation }: AuthGatewayProps) {
  const [state, setState] = useState<GatewayState>({ phase: 'checking' });
  const [bootstrapVersion, setBootstrapVersion] = useState(0);
  const redirectStarted = useRef(false);
  const unauthorizedStarted = useRef(false);
  const popstateBootstrapStarted = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const location = navigation.current();
    const loginRequest = readLoginRequest(location.pathname, location.search);
    const returnTo = loginRequest.returnTo;
    let config: PublicAdminAuthConfig | null = null;

    redirectStarted.current = false;
    unauthorizedStarted.current = false;
    popstateBootstrapStarted.current = true;
    setUnauthorizedHandler(null);
    setState({ phase: 'checking' });

    void (async () => {
      try {
        config = normalizePublicAdminAuthConfig(await getPublicAuthConfig());
        if (!config) throw new Error('Invalid public admin auth config');
        initializeAdminAuth(config.mode);
        const admin = await getCurrentAdmin();
        if (cancelled) return;
        if (location.pathname === '/login') navigation.replaceHistory(returnTo);
        popstateBootstrapStarted.current = false;
        setState({ phase: 'authenticated', config, admin });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorized(error) && config && config.mode !== 'disabled') {
          if (location.pathname !== '/login') navigation.replaceHistory(loginPath(returnTo));
          popstateBootstrapStarted.current = false;
          setState({
            phase: 'anonymous',
            config,
            returnTo,
            manual: loginRequest.manual || Boolean(loginRequest.authError),
            authError: loginRequest.authError
          });
          return;
        }
        popstateBootstrapStarted.current = false;
        setState({ phase: 'failed', returnTo });
      }
    })();

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [bootstrapVersion, navigation]);

  useEffect(() => {
    const handlePopState = () => {
      if (state.phase === 'checking' || popstateBootstrapStarted.current) return;
      if (state.phase === 'authenticated' && navigation.current().pathname !== '/login') return;
      popstateBootstrapStarted.current = true;
      setBootstrapVersion((version) => version + 1);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigation, state.phase]);

  useEffect(() => {
    if (state.phase !== 'anonymous') return;
    const decision = decideAnonymousAdminEntry(state.config, state.manual);
    if (decision.kind !== 'redirect' || redirectStarted.current) return;
    redirectStarted.current = true;
    navigation.replaceLocation(loginStartURL(decision.startURL, state.returnTo));
  }, [navigation, state]);

  useEffect(() => {
    if (state.phase !== 'authenticated') return;
    unauthorizedStarted.current = false;
    setUnauthorizedHandler(() => {
      if (unauthorizedStarted.current) return;
      const location = navigation.current();
      if (location.pathname === '/login') return;
      unauthorizedStarted.current = true;
      const returnTo = sanitizeAdminReturnPath(`${location.pathname}${location.search}`);
      navigation.replaceHistory(loginPath(returnTo));
      setState({ phase: 'anonymous', config: state.config, returnTo, manual: false });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigation, state]);

  const retry = useCallback(() => setBootstrapVersion((version) => version + 1), []);

  async function submitDevToken(token: string) {
    if (state.phase !== 'anonymous' || state.config.mode !== 'dev-bootstrap') return;
    setDevAdminToken(token);
    initializeAdminAuth('dev-bootstrap');
    try {
      const admin = await getCurrentAdmin();
      navigation.replaceHistory(state.returnTo);
      popstateBootstrapStarted.current = false;
      setState({ phase: 'authenticated', config: state.config, admin });
    } catch (error) {
      clearDevAdminToken();
      initializeAdminAuth('dev-bootstrap');
      throw error;
    }
  }

  async function logout() {
    if (state.phase !== 'authenticated') return;
    const config = state.config;
    const location = navigation.current();
    const returnTo = sanitizeAdminReturnPath(`${location.pathname}${location.search}`);
    popstateBootstrapStarted.current = true;
    setUnauthorizedHandler(null);
    setState({ phase: 'checking' });
    try {
      await logoutAdmin();
      if (config.mode === 'dev-bootstrap') clearDevAdminToken();
      initializeAdminAuth(config.mode);
      navigation.replaceHistory(loginPath(returnTo));
      popstateBootstrapStarted.current = false;
      setState({ phase: 'anonymous', config, returnTo, manual: true });
    } catch {
      if (config.mode === 'dev-bootstrap') clearDevAdminToken();
      initializeAdminAuth(config.mode);
      navigation.replaceHistory(loginPath(returnTo));
      popstateBootstrapStarted.current = false;
      setState({ phase: 'failed', returnTo });
    }
  }

  if (state.phase === 'checking') {
    return (
      <main className="auth-checking" aria-label="Legate">
        <img src={legateLogo} alt="" draggable={false} />
        <strong>Legate</strong>
      </main>
    );
  }

  if (state.phase === 'failed') {
    return <LoginPage status="failed" returnTo={state.returnTo} onDevToken={submitDevToken} onRetry={retry} />;
  }

  if (state.phase === 'anonymous') {
    return <LoginPage config={state.config} returnTo={state.returnTo} authError={state.authError} onDevToken={submitDevToken} onRetry={retry} />;
  }

  return <>{children({ admin: state.admin, authConfig: state.config, onLogout: logout })}</>;
}

function readLoginRequest(pathname: string, search: string) {
  const params = pathname === '/login' ? new URLSearchParams(search) : new URLSearchParams();
  return {
    manual: params.get('manual') === '1',
    authError: normalizeAdminAuthError(params.get('auth_error')),
    returnTo: pathname === '/login'
      ? sanitizeAdminReturnPath(params.get('return_to'))
      : sanitizeAdminReturnPath(`${pathname}${search}`)
  };
}

function loginPath(returnTo: string): string {
  const params = new URLSearchParams({ return_to: returnTo });
  return `/login?${params.toString()}`;
}

function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}
