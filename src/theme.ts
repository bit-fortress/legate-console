import type { Locale, ThemeName } from './types';

export const THEME_STORAGE_KEY = 'legate.theme';
export const LOCALE_STORAGE_KEY = 'legate.locale';

export function initialTheme(): ThemeName {
  const stored = readStorage(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'light';
}

export function initialLocale(): Locale {
  const stored = readStorage(LOCALE_STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return 'zh';
}

export function applyTheme(theme: ThemeName, locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
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
