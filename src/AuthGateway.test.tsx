// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthGateway, { type AdminNavigationAdapter } from './AuthGateway';
import { pageKeyForPath, pathForPageKey } from './App';
import {
  getCurrentAdmin,
  getPublicAuthConfig,
  logoutAdmin,
  setAdminTokenProvider,
  setUnauthorizedHandler
} from './api';
import {
  clearDevAdminToken,
  getDevAdminToken,
  setDevAdminToken,
  type PublicAdminAuthConfig
} from './auth';

vi.mock('./api', () => ({
  getCurrentAdmin: vi.fn(),
  getPublicAuthConfig: vi.fn(),
  logoutAdmin: vi.fn(),
  setAdminTokenProvider: vi.fn(),
  setUnauthorizedHandler: vi.fn()
}));

const mockedConfig = vi.mocked(getPublicAuthConfig);
const mockedMe = vi.mocked(getCurrentAdmin);
const mockedLogout = vi.mocked(logoutAdmin);
const mockedUnauthorized = vi.mocked(setUnauthorizedHandler);
const admin = { userId: 1, email: 'admin@example.com', displayName: 'Admin One', platformAdmin: true };
let unauthorizedHandler: (() => void | Promise<void>) | null = null;

describe('AuthGateway', () => {
  beforeEach(() => {
    clearDevAdminToken();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
    unauthorizedHandler = null;
    mockedUnauthorized.mockImplementation((handler) => {
      unauthorizedHandler = handler;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not mount protected content while checking the auth service', () => {
    mockedConfig.mockReturnValue(new Promise(() => undefined));

    renderGateway();

    expect(screen.getByText('Legate')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
  });

  it('treats a session probe 401 as anonymous and preserves the requested path', async () => {
    window.history.replaceState({}, '', '/endpoints');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockRejectedValue({ status: 401 });

    renderGateway();

    expect(await screen.findByRole('heading', { name: '登录 Legate' })).toBeInTheDocument();
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('return_to')).toBe('/endpoints');
  });

  it('fails closed when auth config loading, validation, or probing fails', async () => {
    mockedConfig.mockRejectedValueOnce(new Error('offline'));
    const first = renderGateway();
    expect(await screen.findByRole('heading', { name: '登录服务暂时不可用' })).toBeInTheDocument();
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    first.unmount();

    mockedConfig.mockResolvedValueOnce({ mode: 'oidc', entry: 'redirect' } as PublicAdminAuthConfig);
    const second = renderGateway();
    expect(await screen.findByRole('heading', { name: '登录服务暂时不可用' })).toBeInTheDocument();
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    second.unmount();

    mockedConfig.mockResolvedValueOnce(oidcConfig({ entry: 'page' }));
    mockedMe.mockRejectedValueOnce({ status: 503 });
    renderGateway();
    expect(await screen.findByRole('heading', { name: '登录服务暂时不可用' })).toBeInTheDocument();
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
  });

  it('keeps an OIDC page with no methods out of the protected console', async () => {
    mockedConfig.mockResolvedValue({ mode: 'oidc', entry: 'page', defaultMethod: '', methods: [] });

    renderGateway();

    expect(await screen.findByRole('heading', { name: '登录服务暂时不可用' })).toBeInTheDocument();
    expect(mockedMe).not.toHaveBeenCalled();
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
  });

  it('enters the app only after a disabled-mode probe succeeds', async () => {
    mockedConfig.mockResolvedValue(disabledConfig());
    mockedMe.mockResolvedValue(admin);

    renderGateway();

    expect(await screen.findByTestId('protected-app')).toHaveTextContent('Admin One');
    expect(screen.getByTestId('protected-app')).toHaveAttribute('data-auth-mode', 'disabled');
    expect(screen.queryByRole('button', { name: 'logout-test' })).not.toBeInTheDocument();
    expect(setAdminTokenProvider).toHaveBeenCalledWith(null);
  });

  it('passes the complete validated multi-provider config to protected content', async () => {
    mockedConfig.mockResolvedValue(oidcConfig({ methods: [
      { id: 'company_sso', label: 'Company SSO', startUrl: '/api/auth/login?method=company_sso' },
      { id: 'partner_sso', label: 'Partner SSO', startUrl: '/api/auth/login?method=partner_sso' }
    ] }));
    mockedMe.mockResolvedValue(admin);

    renderGateway();

    expect(await screen.findByTestId('protected-app')).toHaveAttribute('data-auth-methods', 'company_sso,partner_sso');
  });

  it('redirects once in redirect mode even under StrictMode', async () => {
    window.history.replaceState({}, '', '/analytics?range=24h');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'redirect' }));
    mockedMe.mockRejectedValue({ status: 401 });
    const navigation = navigationAdapter();

    renderGateway(navigation, true);

    await waitFor(() => expect(navigation.replaceLocation).toHaveBeenCalledTimes(1));
    expect(navigation.replaceLocation).toHaveBeenCalledWith(
      '/api/auth/login?method=company_sso&return_to=%2Fanalytics%3Frange%3D24h'
    );
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
  });

  it('shows the page instead of redirecting when manual=1 is present', async () => {
    window.history.replaceState({}, '', '/login?manual=1&return_to=%2Fgroups');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'redirect' }));
    mockedMe.mockRejectedValue({ status: 401 });
    const navigation = navigationAdapter();

    renderGateway(navigation);

    expect(await screen.findByRole('heading', { name: '登录 Legate' })).toBeInTheDocument();
    expect(navigation.replaceLocation).not.toHaveBeenCalled();
  });

  it('shows only a generic callback error selected from the public allowlist', async () => {
    window.history.replaceState({}, '', '/login?manual=1&auth_error=access_denied&return_to=%2Fgroups');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockRejectedValue({ status: 401 });

    renderGateway();

    expect(await screen.findByRole('alert')).toHaveTextContent('无法使用此身份访问 Legate。请联系管理员。');
  });

  it('does not restart redirect login when a callback returns an allowlisted auth error', async () => {
    window.history.replaceState({}, '', '/login?auth_error=sign_in_failed&return_to=%2Fgroups');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'redirect' }));
    mockedMe.mockRejectedValue({ status: 401 });
    const navigation = navigationAdapter();

    renderGateway(navigation);

    expect(await screen.findByRole('alert')).toHaveTextContent('无法完成登录，请重试。');
    await act(async () => Promise.resolve());
    expect(navigation.replaceLocation).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe('/login?auth_error=sign_in_failed&return_to=%2Fgroups');
  });

  it('retries bootstrap after a failed auth service request', async () => {
    const user = userEvent.setup();
    mockedConfig.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(disabledConfig());
    mockedMe.mockResolvedValue(admin);
    renderGateway();

    await user.click(await screen.findByRole('button', { name: '重试' }));

    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();
    expect(mockedConfig).toHaveBeenCalledTimes(2);
  });

  it('keeps a trimmed dev token out of browser persistence and probes the session again', async () => {
    const user = userEvent.setup();
    const sessionStorageSet = vi.spyOn(Storage.prototype, 'setItem');
    mockedConfig.mockResolvedValue(devConfig());
    mockedMe.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce(admin);
    renderGateway();

    await user.type(await screen.findByLabelText('开发管理员令牌'), '  dev-secret  ');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();
    expect(sessionStorageSet).not.toHaveBeenCalledWith(expect.any(String), 'dev-secret');
    expect(setAdminTokenProvider).toHaveBeenLastCalledWith(expect.any(Function));
    expect(mockedMe).toHaveBeenCalledTimes(2);
  });

  it('leaves /login for a safe return path after authentication', async () => {
    window.history.replaceState({}, '', '/login?return_to=%2Fsidecars%3Fstatus%3Denabled');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);

    renderGateway();

    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/sidecars?status=enabled');
  });

  it('falls back to root when an authenticated /login request points back to /login', async () => {
    window.history.replaceState({}, '', '/login?return_to=%2Flogin%3Fmanual%3D1');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);

    renderGateway();

    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/');
  });

  it('does not put /login back into an anonymous login action', async () => {
    window.history.replaceState({}, '', '/login?return_to=%2Ffoo%2F..%2Flogin');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockRejectedValue({ status: 401 });

    renderGateway();

    expect(await screen.findByRole('link', { name: 'Company SSO' })).toHaveAttribute(
      'href',
      '/api/auth/login?method=company_sso&return_to=%2F'
    );
  });

  it('rebootstraps an anonymous session when browser back leaves /login for a protected path', async () => {
    window.history.replaceState({}, '', '/endpoints');
    window.history.pushState({}, '', '/login?return_to=%2Fendpoints');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockRejectedValue({ status: 401 });
    renderGateway();
    expect(await screen.findByRole('heading', { name: '登录 Legate' })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => expect(mockedMe).toHaveBeenCalledTimes(2));
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('return_to')).toBe('/endpoints');
    expect(mockedConfig).toHaveBeenCalledTimes(2);
    expect(mockedMe).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
  });

  it('rebootstraps an authenticated session that navigates to /login', async () => {
    window.history.replaceState({}, '', '/endpoints');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);
    renderGateway();
    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();

    act(() => {
      window.history.pushState({}, '', '/login?return_to=%2Fsidecars');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(window.location.pathname).toBe('/sidecars'));
    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();
    expect(mockedConfig).toHaveBeenCalledTimes(2);
    expect(mockedMe).toHaveBeenCalledTimes(2);
  });

  it('does not reboot auth while an authenticated admin moves between protected routes', async () => {
    window.history.replaceState({}, '', '/endpoints');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);
    renderGateway();
    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();

    act(() => {
      window.history.pushState({}, '', '/groups');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(window.location.pathname).toBe('/groups');
    expect(screen.getByTestId('protected-app')).toBeInTheDocument();
    expect(screen.queryByLabelText('Legate')).not.toBeInTheDocument();
    expect(mockedConfig).toHaveBeenCalledTimes(1);
    expect(mockedMe).toHaveBeenCalledTimes(1);
  });

  it('unmounts protected content and navigates once when authenticated requests become unauthorized', async () => {
    window.history.replaceState({}, '', '/keys?status=enabled');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);
    renderGateway();
    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();

    await act(async () => {
      await unauthorizedHandler?.();
      await unauthorizedHandler?.();
    });

    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('return_to')).toBe('/keys?status=enabled');
  });

  it('starts the configured redirect once when an authenticated request becomes unauthorized', async () => {
    window.history.replaceState({}, '', '/analytics?range=24h');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'redirect' }));
    mockedMe.mockResolvedValue(admin);
    const navigation = navigationAdapter();
    renderGateway(navigation);
    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();

    await act(async () => {
      await unauthorizedHandler?.();
      await unauthorizedHandler?.();
    });

    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe(
      '/login?return_to=%2Fanalytics%3Frange%3D24h'
    );
    await waitFor(() => expect(navigation.replaceLocation).toHaveBeenCalledTimes(1));
    expect(navigation.replaceLocation).toHaveBeenCalledWith(
      '/api/auth/login?method=company_sso&return_to=%2Fanalytics%3Frange%3D24h'
    );
  });

  it('shows the login page when a page-mode authenticated request becomes unauthorized', async () => {
    window.history.replaceState({}, '', '/endpoints');
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);
    const navigation = navigationAdapter();
    renderGateway(navigation);
    expect(await screen.findByTestId('protected-app')).toBeInTheDocument();

    await act(async () => {
      await unauthorizedHandler?.();
    });

    expect(await screen.findByRole('heading', { name: '登录 Legate' })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/login?return_to=%2Fendpoints');
    expect(navigation.replaceLocation).not.toHaveBeenCalled();
  });

  it('logs out an authenticated OIDC admin and never keeps the protected app visible on failure', async () => {
    let rejectLogout: (error: Error) => void = () => {};
    mockedConfig.mockResolvedValue(oidcConfig({ entry: 'page' }));
    mockedMe.mockResolvedValue(admin);
    mockedLogout.mockImplementation(() => new Promise((_, reject) => {
      rejectLogout = reject;
    }));
    renderGateway();

    fireEvent.click(await screen.findByRole('button', { name: 'logout-test' }));

    expect(mockedLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    await act(async () => rejectLogout(new Error('offline')));
    expect(await screen.findByRole('heading', { name: '登录服务暂时不可用' })).toBeInTheDocument();
  });

  it('clears the dev token during logout', async () => {
    const user = userEvent.setup();
    setDevAdminToken('dev-secret');
    mockedConfig.mockResolvedValue(devConfig());
    mockedMe.mockResolvedValue(admin);
    mockedLogout.mockResolvedValue();
    renderGateway();

    await user.click(await screen.findByRole('button', { name: 'logout-test' }));

    expect(getDevAdminToken()).toBe('');
    const tokenProviderCalls = vi.mocked(setAdminTokenProvider).mock.calls;
    const tokenProvider = tokenProviderCalls[tokenProviderCalls.length - 1]?.[0];
    expect(tokenProvider?.()).toBe('');
    expect(screen.queryByTestId('protected-app')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '登录 Legate' })).toBeInTheDocument();
  });
});

describe('App page paths', () => {
  it.each([
    ['/', 'overview'],
    ['/endpoints', 'endpoints'],
    ['/drivers', 'drivers'],
    ['/groups', 'groups'],
    ['/keys', 'keys'],
    ['/sidecars', 'sidecars'],
    ['/analytics', 'analytics'],
    ['/workspaces', 'workspaces'],
    ['/unknown', 'overview']
  ] as const)('maps %s to %s', (path, page) => {
    expect(pageKeyForPath(path)).toBe(page);
    if (path !== '/unknown') expect(pathForPageKey(page)).toBe(path);
  });
});

function renderGateway(navigation?: AdminNavigationAdapter, strict = false) {
  const tree = (
    <AuthGateway navigation={navigation}>
      {({ admin: currentAdmin, authConfig, onLogout }) => (
        <div data-testid="protected-app" data-auth-mode={authConfig.mode} data-auth-methods={authConfig.methods.map((method) => method.id).join(',')}>
          {currentAdmin.displayName}
          {authConfig.mode !== 'disabled' && (
            <button type="button" aria-label="logout-test" onClick={() => void onLogout()}>
              logout
            </button>
          )}
        </div>
      )}
    </AuthGateway>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function navigationAdapter(): AdminNavigationAdapter {
  return {
    current: () => ({ pathname: window.location.pathname, search: window.location.search }),
    replaceHistory: vi.fn((url: string) => window.history.replaceState({}, '', url)),
    replaceLocation: vi.fn()
  };
}

function disabledConfig(): PublicAdminAuthConfig {
  return { mode: 'disabled', entry: 'bypass', defaultMethod: '', methods: [] };
}

function devConfig(): PublicAdminAuthConfig {
  return { mode: 'dev-bootstrap', entry: 'page', defaultMethod: '', methods: [] };
}

function oidcConfig(overrides: Partial<PublicAdminAuthConfig> = {}): PublicAdminAuthConfig {
  return {
    mode: 'oidc',
    entry: 'page',
    defaultMethod: 'company_sso',
    methods: [{ id: 'company_sso', label: 'Company SSO', startUrl: '/api/auth/login?method=company_sso' }],
    ...overrides
  };
}
