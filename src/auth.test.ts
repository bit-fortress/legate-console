import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminToken, setAdminTokenProvider } from './api';
import {
  clearDevAdminToken,
  decideAnonymousAdminEntry,
  getDevAdminToken,
  initializeAdminAuth,
  isValidAdminLoginStartURL,
  normalizeAdminPrincipal,
  normalizePublicAdminAuthConfig,
  sanitizeAdminReturnPath,
  setDevAdminToken,
  type PublicAdminAuthConfig
} from './auth';

describe('admin auth runtime', () => {
  afterEach(() => {
    clearDevAdminToken();
    setAdminTokenProvider(null);
    vi.unstubAllGlobals();
  });

  it('accepts only an internal admin principal with a positive numeric user ID', () => {
    expect(normalizeAdminPrincipal({
      userId: 42,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformAdmin: true
    })).toEqual({
      userId: 42,
      email: 'admin@example.com',
      displayName: 'Admin',
      platformAdmin: true
    });

    for (const raw of [
      { subject: 'legacy', email: '', displayName: '', platformAdmin: true },
      { userId: 0, email: '', displayName: '', platformAdmin: false },
      { userId: -1, email: '', displayName: '', platformAdmin: false },
      { userId: 1.5, email: '', displayName: '', platformAdmin: false },
      { userId: '42', email: '', displayName: '', platformAdmin: false },
      { userId: 42, subject: 'legacy', email: '', displayName: '', platformAdmin: false },
      { userId: 42, email: null, displayName: '', platformAdmin: false },
      { userId: 42, email: '', displayName: null, platformAdmin: false }
    ]) {
      expect(normalizeAdminPrincipal(raw)).toBeNull();
    }
  });

  it.each([
    '',
    'endpoints',
    'https://evil.example/endpoints',
    '//evil.example/endpoints',
    '/endpoints\\settings',
    '/endpoints%5Csettings',
    '\\evil.example\\endpoints',
    '/endpoints#fragment',
    '/api/auth/login',
    '/api/auth/login?method=sso',
    '/%61pi/auth/login?method=sso',
    '/api/auth%2Flogin?method=sso',
    '/api/auth/callback',
    '/api/auth/logout?return_to=/endpoints',
    '%2Fendpoints',
    '/%2Fendpoints',
    '/foo/../api/auth/logout',
    '/api/auth/foo/../login',
    '/api/auth/./callback?code=secret',
    '/api//auth/login?method=sso',
    '/foo/%2e%2e/api/auth/logout',
    '/api/auth/foo/%2e%2e/login',
    '/endpoints\n?kind=text',
    '/endpoints\t?kind=text',
    '/endpoints\0?kind=text',
    '/endpoints\u007f?kind=text',
    '/login',
    '/login?return_to=/endpoints',
    '/foo/../login',
    '/foo/%2e%2e/login',
    '/%6cogin',
    '/login/../login'
  ])('rejects unsafe return path %s', (raw) => {
    expect(sanitizeAdminReturnPath(raw, '/fallback')).toBe('/fallback');
  });

  it.each([
    ['/', '/'],
    ['/.', '/'],
    ['/endpoints?kind=text', '/endpoints?kind=text'],
    ['/endpoints/../models?kind=text', '/models?kind=text'],
    ['/endpoints//text?enabled=true', '/endpoints//text?enabled=true']
  ])('normalizes safe return path %s', (raw, expected) => {
    expect(sanitizeAdminReturnPath(raw, '/fallback')).toBe(expected);
  });

  it('uses the root fallback when no return path is supplied', () => {
    expect(sanitizeAdminReturnPath(null)).toBe('/');
    expect(sanitizeAdminReturnPath(undefined)).toBe('/');
  });

  it('normalizes safe fallbacks and replaces unsafe fallbacks with root', () => {
    expect(sanitizeAdminReturnPath('unsafe', '/settings/../endpoints?kind=text')).toBe('/endpoints?kind=text');
    expect(sanitizeAdminReturnPath('unsafe', 'https://evil.example')).toBe('/');
    expect(sanitizeAdminReturnPath('unsafe', '/api/auth/login')).toBe('/');
    expect(sanitizeAdminReturnPath('unsafe', '/endpoints\n')).toBe('/');
  });

  it('bypasses the login page for disabled authentication', () => {
    expect(
      decideAnonymousAdminEntry(authConfig({ mode: 'disabled', entry: 'bypass', defaultMethod: '', methods: [] }), false)
    ).toEqual({ kind: 'bypass' });
  });

  it('renders the login page for page entry and manual redirect recovery', () => {
    const page = authConfig({ entry: 'page' });
    const redirect = authConfig({ entry: 'redirect' });

    expect(decideAnonymousAdminEntry(page, false)).toEqual({ kind: 'page' });
    expect(decideAnonymousAdminEntry(redirect, true)).toEqual({ kind: 'page' });
  });

  it('accepts OIDC page entry without a default method for one or multiple providers', () => {
    const single = authConfig({
      entry: 'page',
      defaultMethod: '',
      methods: [{ id: 'sso', label: 'SSO', startUrl: '/api/auth/login?method=sso' }]
    });
    const multiple = authConfig({
      entry: 'page',
      defaultMethod: '',
      methods: [
        { id: 'sso', label: 'SSO', startUrl: '/api/auth/login?method=sso' },
        { id: 'partner', label: 'Partner', startUrl: '/api/auth/login?method=partner' }
      ]
    });

    expect(normalizePublicAdminAuthConfig(single)).toEqual(single);
    expect(normalizePublicAdminAuthConfig(multiple)).toEqual(multiple);
    expect(decideAnonymousAdminEntry(single, false)).toEqual({ kind: 'page' });
    expect(decideAnonymousAdminEntry(multiple, false)).toEqual({ kind: 'page' });
  });

  it('requires methods for OIDC page entry and a valid default for redirect entry', () => {
    expect(normalizePublicAdminAuthConfig(authConfig({ entry: 'page', defaultMethod: '', methods: [] }))).toBeNull();
    expect(normalizePublicAdminAuthConfig(authConfig({ entry: 'redirect', defaultMethod: '' }))).toBeNull();
    expect(normalizePublicAdminAuthConfig(authConfig({ entry: 'redirect', defaultMethod: 'missing' }))).toBeNull();
  });

  it('redirects through the valid default login method only', () => {
    const config = authConfig({ entry: 'redirect' });

    expect(decideAnonymousAdminEntry(config, false)).toEqual({
      kind: 'redirect',
      startURL: '/api/auth/login?method=sso'
    });
    expect(decideAnonymousAdminEntry({ ...config, defaultMethod: 'missing' }, false)).toEqual({ kind: 'page' });
    expect(
      decideAnonymousAdminEntry(
        { ...config, methods: [{ id: 'sso', label: 'SSO', startUrl: 'https://evil.example/login' }] },
        false
      )
    ).toEqual({ kind: 'page' });
  });

  it('fails closed for malformed public auth config', () => {
    const malformedConfigs: unknown[] = [
      null,
      {},
      { mode: 'unexpected', entry: 'page', defaultMethod: '', methods: [] },
      { mode: 'oidc', entry: 'unexpected', defaultMethod: 'sso', methods: [] },
      { mode: 'oidc', entry: 'redirect', defaultMethod: null, methods: [] },
      { mode: 'oidc', entry: 'redirect', defaultMethod: 'sso', methods: null },
      authConfig({ methods: [{ id: 'Bad ID', label: 'SSO', startUrl: '/api/auth/login?method=Bad%20ID' }] }),
      authConfig({ methods: [{ id: 'sso', label: '   ', startUrl: '/api/auth/login?method=sso' }] }),
      authConfig({ methods: [{ id: 'sso', label: 'SSO', startUrl: null as unknown as string }] }),
      authConfig({ methods: [{ id: 'sso', label: 'SSO', startUrl: '/api/auth/login?method=sso' }, null as unknown as never] })
    ];

    for (const config of malformedConfigs) {
      expect(() => decideAnonymousAdminEntry(config as PublicAdminAuthConfig, false)).not.toThrow();
      expect(decideAnonymousAdminEntry(config as PublicAdminAuthConfig, false)).toEqual({ kind: 'page' });
    }
  });

  it('requires redirect start URL method to match the selected method', () => {
    const config = authConfig({
      methods: [{ id: 'sso', label: 'SSO', startUrl: '/api/auth/login?method=other' }]
    });

    expect(decideAnonymousAdminEntry(config, false)).toEqual({ kind: 'page' });
    expect(isValidAdminLoginStartURL('/api/auth/login?method=other', 'sso')).toBe(false);
  });

  it('returns a canonical start URL for redirect navigation', () => {
    const config = authConfig({
      methods: [{ id: 'sso', label: 'SSO', startUrl: '/api/auth/login?method=%73so' }]
    });

    expect(decideAnonymousAdminEntry(config, false)).toEqual({
      kind: 'redirect',
      startURL: '/api/auth/login?method=sso'
    });
  });

  it.each([
    '/api/auth/login?method=sso',
    '/api/auth/login?method=secondary',
    '/api/auth/login?method=company_sso'
  ])('accepts same-origin login start URL %s', (raw) => {
    expect(isValidAdminLoginStartURL(raw)).toBe(true);
  });

  it.each([
    '',
    'api/auth/login?method=sso',
    '//evil.example/api/auth/login?method=sso',
    'https://evil.example/api/auth/login?method=sso',
    '/api/auth/login\\?method=sso',
    '/api/auth/login?method=sso#fragment',
    '/api/auth/callback?method=sso',
    '/api/auth/foo/../login?method=sso',
    '/api/auth/login',
    '/api/auth/login?method=',
    '/api/auth/login?provider=sso',
    '/api/auth/login?method=sso&method=other',
    '/api/auth/login?method=sso&return_to=/endpoints',
    '/api/auth/login?method=sso\n',
    '/api/auth/login?method=sso\t',
    '/api/auth/login?method=sso\0',
    '/api/auth/login?method=sso\u007f'
  ])('rejects invalid login start URL %s', (raw) => {
    expect(isValidAdminLoginStartURL(raw)).toBe(false);
  });

  it('keeps a trimmed dev token in memory only and supplies it to the API client', () => {
    const sessionSet = vi.fn();
    const localSet = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(), setItem: sessionSet, removeItem: vi.fn() });
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: localSet, removeItem: vi.fn() });

    setDevAdminToken('  dev-secret  ');
    initializeAdminAuth('dev-bootstrap');

    expect(getDevAdminToken()).toBe('dev-secret');
    expect(getAdminToken()).toBe('dev-secret');
    expect(sessionSet).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
  });

  it('deletes empty dev tokens, clears logout state, and forgets the token outside dev mode', () => {
    setDevAdminToken('dev-secret');

    setDevAdminToken('   ');
    expect(getDevAdminToken()).toBe('');

    setDevAdminToken('another-secret');
    clearDevAdminToken();
    expect(getDevAdminToken()).toBe('');

    setDevAdminToken('kept-until-logout');
    initializeAdminAuth('oidc');
    expect(getAdminToken()).toBe('');
    expect(getDevAdminToken()).toBe('');
  });

  it('does not consult browser storage for development tokens', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('must not read');
      },
      setItem: () => {
        throw new Error('must not write');
      },
      removeItem: () => {
        throw new Error('must not remove');
      }
    });

    expect(() => setDevAdminToken('secret')).not.toThrow();
    expect(getDevAdminToken()).toBe('secret');
    expect(() => clearDevAdminToken()).not.toThrow();
    expect(() => initializeAdminAuth('dev-bootstrap')).not.toThrow();
    expect(getAdminToken()).toBe('');
  });
});

function authConfig(overrides: Partial<PublicAdminAuthConfig> = {}): PublicAdminAuthConfig {
  return {
    mode: 'oidc',
    entry: 'redirect',
    defaultMethod: 'sso',
    methods: [{ id: 'sso', label: 'SSO', startUrl: '/api/auth/login?method=sso' }],
    ...overrides
  };
}
