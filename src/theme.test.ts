// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, initialTheme, subscribeToSystemTheme, THEME_STORAGE_KEY } from './theme';

describe('theme preference', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('uses and persists system as the default theme preference', () => {
    expect(initialTheme()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(initialTheme()).toBe('system');
  });

  it('resolves the system preference and reacts to system theme changes', () => {
    let dark = false;
    let changeListener: (() => void) | undefined;
    const mediaQuery = {
      get matches() {
        return dark;
      },
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        changeListener = listener;
      }),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

    applyTheme('system', 'zh');
    expect(document.documentElement.dataset.theme).toBe('light');

    const unsubscribe = subscribeToSystemTheme(() => applyTheme('system', 'zh'));
    dark = true;
    changeListener?.();
    expect(document.documentElement.dataset.theme).toBe('dark');

    unsubscribe();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
