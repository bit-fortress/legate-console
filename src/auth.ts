import { setAdminTokenProvider } from './api';
import type { AdminPrincipal } from './types';

export type { AdminPrincipal } from './types';

export type AdminAuthMode = 'disabled' | 'dev-bootstrap' | 'oidc';
export type AdminLoginEntry = 'bypass' | 'page' | 'redirect';
export type AdminAuthError = 'sign_in_failed' | 'access_denied' | 'service_unavailable';

export interface AdminLoginMethod {
  id: string;
  label: string;
  startUrl: string;
}

export interface PublicAdminAuthConfig {
  mode: AdminAuthMode;
  entry: AdminLoginEntry;
  defaultMethod: string;
  methods: AdminLoginMethod[];
}

export type AnonymousAdminEntryDecision =
  | { kind: 'bypass' }
  | { kind: 'page' }
  | { kind: 'redirect'; startURL: string };

const ADMIN_AUTH_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/callback', '/api/auth/logout']);
const ADMIN_AUTH_MODES = new Set<AdminAuthMode>(['disabled', 'dev-bootstrap', 'oidc']);
const ADMIN_LOGIN_ENTRIES = new Set<AdminLoginEntry>(['bypass', 'page', 'redirect']);
const ADMIN_AUTH_ERRORS = new Set<AdminAuthError>(['sign_in_failed', 'access_denied', 'service_unavailable']);
const LOGIN_METHOD_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const LOCAL_ORIGIN = 'http://legate.local';
let devAdminToken = '';

export function normalizeAdminPrincipal(raw: unknown): AdminPrincipal | null {
  if (
    !isRecord(raw) ||
    'subject' in raw ||
    typeof raw.userId !== 'number' ||
    !Number.isSafeInteger(raw.userId) ||
    raw.userId <= 0 ||
    typeof raw.email !== 'string' ||
    typeof raw.displayName !== 'string' ||
    typeof raw.platformAdmin !== 'boolean'
  ) {
    return null;
  }
  return {
    userId: raw.userId,
    email: raw.email,
    displayName: raw.displayName,
    platformAdmin: raw.platformAdmin
  };
}

export function normalizeAdminAuthError(raw: unknown): AdminAuthError | undefined {
  return typeof raw === 'string' && ADMIN_AUTH_ERRORS.has(raw as AdminAuthError)
    ? raw as AdminAuthError
    : undefined;
}

export function sanitizeAdminReturnPath(raw: string | null | undefined, fallback = '/'): string {
  const safeFallback = normalizeAdminReturnPath(fallback) ?? '/';
  return normalizeAdminReturnPath(raw) ?? safeFallback;
}

export function decideAnonymousAdminEntry(config: PublicAdminAuthConfig, manual: boolean): AnonymousAdminEntryDecision {
  const validated = normalizePublicAdminAuthConfig(config);
  if (!validated) return { kind: 'page' };
  if (validated.mode === 'disabled') return { kind: 'bypass' };
  if (manual || validated.entry !== 'redirect') return { kind: 'page' };

  const method = validated.methods.find((candidate) => candidate.id === validated.defaultMethod);
  return method ? { kind: 'redirect', startURL: method.startUrl } : { kind: 'page' };
}

export function isValidAdminLoginStartURL(raw: string, expectedMethodID?: string): boolean {
  return normalizeAdminLoginStartURL(raw, expectedMethodID) !== null;
}

function normalizeAdminReturnPath(raw: unknown): string | null {
  if (
    typeof raw !== 'string' ||
    !raw ||
    raw[0] !== '/' ||
    raw.startsWith('//') ||
    raw.includes('#') ||
    raw.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(raw)
  ) {
    return null;
  }

  try {
    const parsed = new URL(raw, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN || parsed.hash || !parsed.pathname.startsWith('/')) {
      return null;
    }

    const decodedPath = decodeURIComponent(parsed.pathname);
    const decodedSearch = decodeURIComponent(parsed.search);
    if (
      decodedPath.startsWith('//') ||
      decodedPath.includes('\\') ||
      CONTROL_CHARACTER_PATTERN.test(decodedPath) ||
      CONTROL_CHARACTER_PATTERN.test(decodedSearch)
    ) {
      return null;
    }
    if (ADMIN_AUTH_PATHS.has(canonicalPath(decodedPath))) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function normalizeAdminLoginStartURL(raw: unknown, expectedMethodID?: string): string | null {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/api/auth/login?') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    raw.includes('#') ||
    CONTROL_CHARACTER_PATTERN.test(raw)
  ) {
    return null;
  }

  const queryIndex = raw.indexOf('?');
  if (raw.slice(0, queryIndex) !== '/api/auth/login') return null;

  try {
    const parsed = new URL(raw, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN || parsed.pathname !== '/api/auth/login') return null;
    if (CONTROL_CHARACTER_PATTERN.test(decodeURIComponent(parsed.search))) return null;

    const entries = [...parsed.searchParams.entries()];
    if (entries.length !== 1 || entries[0][0] !== 'method') return null;
    const methodID = entries[0][1];
    if (!LOGIN_METHOD_ID_PATTERN.test(methodID) || (expectedMethodID !== undefined && methodID !== expectedMethodID)) {
      return null;
    }
    return `/api/auth/login?method=${encodeURIComponent(methodID)}`;
  } catch {
    return null;
  }
}

export function normalizePublicAdminAuthConfig(raw: unknown): PublicAdminAuthConfig | null {
  if (!isRecord(raw)) return null;
  if (!ADMIN_AUTH_MODES.has(raw.mode as AdminAuthMode) || !ADMIN_LOGIN_ENTRIES.has(raw.entry as AdminLoginEntry)) {
    return null;
  }
  if (typeof raw.defaultMethod !== 'string' || !Array.isArray(raw.methods)) return null;

  const methods: AdminLoginMethod[] = [];
  const methodIDs = new Set<string>();
  for (const candidate of raw.methods) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !LOGIN_METHOD_ID_PATTERN.test(candidate.id)) {
      return null;
    }
    if (
      typeof candidate.label !== 'string' ||
      candidate.label.trim() !== candidate.label ||
      !candidate.label ||
      Array.from(candidate.label).length > 80 ||
      typeof candidate.startUrl !== 'string' ||
      methodIDs.has(candidate.id)
    ) {
      return null;
    }
    const startUrl = normalizeAdminLoginStartURL(candidate.startUrl, candidate.id);
    if (!startUrl) return null;
    methodIDs.add(candidate.id);
    methods.push({ id: candidate.id, label: candidate.label, startUrl });
  }

  const mode = raw.mode as AdminAuthMode;
  const entry = raw.entry as AdminLoginEntry;
  if (mode === 'disabled') {
    if (entry !== 'bypass' || raw.defaultMethod || methods.length) return null;
  } else if (mode === 'dev-bootstrap') {
    if (entry !== 'page' || raw.defaultMethod || methods.length) return null;
  } else {
    if (entry === 'bypass' || methods.length === 0) return null;
    if (raw.defaultMethod && (!LOGIN_METHOD_ID_PATTERN.test(raw.defaultMethod) || !methodIDs.has(raw.defaultMethod))) return null;
    if (entry === 'redirect' && !raw.defaultMethod) return null;
  }

  return { mode, entry, defaultMethod: raw.defaultMethod, methods };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getDevAdminToken(): string {
  return devAdminToken;
}

export function setDevAdminToken(token: string): void {
  devAdminToken = token.trim();
}

export function clearDevAdminToken(): void {
  devAdminToken = '';
}

export function initializeAdminAuth(mode: AdminAuthMode): void {
  if (mode !== 'dev-bootstrap') clearDevAdminToken();
  setAdminTokenProvider(mode === 'dev-bootstrap' ? getDevAdminToken : null);
}

function canonicalPath(pathname: string): string {
  const segments: string[] = [];
  for (const segment of pathname.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`;
}
