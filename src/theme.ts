import type { Locale, ThemeName } from './types';

export const THEME_STORAGE_KEY = 'legate.theme';
export const LOCALE_STORAGE_KEY = 'legate.locale';
const SYSTEM_DARK_THEME_QUERY = '(prefers-color-scheme: dark)';

export function initialTheme(): ThemeName {
  const stored = readStorage(THEME_STORAGE_KEY);
  if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
  return 'system';
}

export function initialLocale(): Locale {
  const stored = readStorage(LOCALE_STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return 'zh';
}

export function applyTheme(theme: ThemeName, locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(theme);
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}

export function subscribeToSystemTheme(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mediaQuery = window.matchMedia(SYSTEM_DARK_THEME_QUERY);
  mediaQuery.addEventListener?.('change', listener);
  if (!mediaQuery.addEventListener) mediaQuery.addListener?.(listener);
  return () => {
    mediaQuery.removeEventListener?.('change', listener);
    if (!mediaQuery.removeEventListener) mediaQuery.removeListener?.(listener);
  };
}

export function persistTheme(theme: ThemeName) {
  writeStorage(THEME_STORAGE_KEY, theme);
}

export function persistLocale(locale: Locale) {
  writeStorage(LOCALE_STORAGE_KEY, locale);
}

function readStorage(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(key) ?? '';
}

function writeStorage(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}

function resolveTheme(theme: ThemeName): Exclude<ThemeName, 'system'> {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(SYSTEM_DARK_THEME_QUERY).matches ? 'dark' : 'light';
}
