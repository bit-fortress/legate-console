import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Globe2, LogIn, Moon, RefreshCw, Sun } from 'lucide-react';
import type { AdminAuthError, PublicAdminAuthConfig } from './auth';
import { createTranslator } from './i18n';
import { applyTheme, initialLocale, initialTheme, persistLocale, persistTheme, subscribeToSystemTheme } from './theme';
import type { Locale, ThemeName } from './types';
import legateLogo from './assets/legate-transparent.png';

interface LoginPageProps {
  config?: PublicAdminAuthConfig;
  returnTo: string;
  authError?: AdminAuthError;
  status?: 'ready' | 'failed';
  onDevToken: (token: string) => Promise<void> | void;
  onRetry: () => void;
}

export default function LoginPage({ config, returnTo, authError, status = 'ready', onDevToken, onRetry }: LoginPageProps) {
  const [theme, setTheme] = useState<ThemeName>(() => initialTheme());
  const [locale, setLocale] = useState<Locale>(() => initialLocale());
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const t = useMemo(() => createTranslator(locale), [locale]);

  useEffect(() => {
    applyTheme(theme, locale);
    persistTheme(theme);
    persistLocale(locale);
    if (theme === 'system') {
      return subscribeToSystemTheme(() => applyTheme(theme, locale));
    }
  }, [locale, theme]);

  async function submitDevToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = token.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onDevToken(value);
    } catch {
      setError(t('auth.verifyFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const methods = config?.mode === 'oidc' ? config.methods : [];
  const defaultMethod = config?.mode === 'oidc' ? config.defaultMethod : '';
  const callbackError = authErrorMessage(authError, t);

  return (
    <main className="login-shell">
      <header className="login-controls" aria-label={t('settings.title')}>
        <button
          type="button"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={theme === 'light' ? t('settings.dark') : t('settings.light')}
          title={theme === 'light' ? t('settings.dark') : t('settings.light')}
        >
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button
          type="button"
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          aria-label={t('settings.language')}
          title={t('settings.language')}
        >
          <Globe2 size={17} />
          <span>{locale === 'zh' ? 'EN' : '中'}</span>
        </button>
      </header>

      <section className="login-content">
        <div className="login-brand">
          <img src={legateLogo} alt="Legate" draggable={false} />
          <strong>Legate</strong>
        </div>

        {status === 'failed' ? (
          <div className="login-copy">
            <h1>{t('auth.serviceUnavailable')}</h1>
            <p>{t('auth.serviceDescription')}</p>
            <button type="button" className="login-action primary" onClick={onRetry}>
              <RefreshCw size={18} aria-hidden="true" />
              <span>{t('status.retry')}</span>
            </button>
          </div>
        ) : (
          <div className="login-copy">
            <h1>{t('auth.signInTitle')}</h1>
            <p>{t('auth.description')}</p>
            {callbackError && <div className="login-error" role="alert">{callbackError}</div>}

            {config?.mode === 'oidc' && (
              <div className="login-methods">
                {methods
                  .slice()
                  .sort((left, right) => Number(right.id === defaultMethod) - Number(left.id === defaultMethod))
                  .map((method) => (
                    <a
                      key={method.id}
                      className={`login-action ${method.id === defaultMethod ? 'primary' : 'secondary'}`}
                      href={loginStartURL(method.startUrl, returnTo)}
                    >
                      <LogIn size={18} aria-hidden="true" />
                      <span>{method.label}</span>
                    </a>
                  ))}
              </div>
            )}

            {config?.mode === 'dev-bootstrap' && (
              <form className="dev-login-form" onSubmit={(event) => void submitDevToken(event)}>
                <span className="development-label">{t('auth.developmentOnly')}</span>
                <span>{t('auth.devToken')}</span>
                <input
                  id="dev-admin-token"
                  aria-label={t('auth.devToken')}
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                {error && <div className="login-error" role="alert">{error}</div>}
                <button type="submit" className="login-action primary" disabled={!token.trim() || submitting}>
                  <LogIn size={18} aria-hidden="true" />
                  <span>{submitting ? t('app.loading') : t('actions.login')}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export function loginStartURL(startURL: string, returnTo: string): string {
  const parsed = new URL(startURL, 'http://legate.local');
  parsed.searchParams.set('return_to', returnTo);
  return `${parsed.pathname}${parsed.search}`;
}

function authErrorMessage(error: AdminAuthError | undefined, t: (key: string) => string): string {
  switch (error) {
    case 'sign_in_failed':
      return t('auth.errorSignInFailed');
    case 'access_denied':
      return t('auth.errorAccessDenied');
    case 'service_unavailable':
      return t('auth.errorServiceUnavailable');
    default:
      return '';
  }
}
