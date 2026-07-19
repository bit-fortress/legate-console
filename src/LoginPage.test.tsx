// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import type { PublicAdminAuthConfig } from './auth';

describe('LoginPage', () => {
  afterEach(() => cleanup());

  it('renders the default OIDC method as the primary action and other methods below it', () => {
    render(
      <LoginPage
        config={oidcConfig()}
        returnTo="/endpoints?kind=text"
        onDevToken={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '登录 Legate' })).toBeInTheDocument();
    expect(screen.getByText('使用管理员身份继续访问控制台。')).toBeInTheDocument();
    const primary = screen.getByRole('link', { name: 'Company SSO' });
    const secondary = screen.getByRole('link', { name: 'Security Key' });
    expect(primary).toHaveClass('primary');
    expect(primary).toHaveAttribute(
      'href',
      '/api/auth/login?method=company_sso&return_to=%2Fendpoints%3Fkind%3Dtext'
    );
    expect(secondary).toHaveClass('secondary');
    expect(secondary).toHaveAttribute(
      'href',
      '/api/auth/login?method=security_key&return_to=%2Fendpoints%3Fkind%3Dtext'
    );
  });

  it.each([
    ['sign_in_failed', '无法完成登录，请重试。'],
    ['access_denied', '无法使用此身份访问 Legate。请联系管理员。'],
    ['service_unavailable', '登录服务暂时不可用，请稍后重试。']
  ] as const)('renders the generic %s callback error', (authError, message) => {
    render(
      <LoginPage
        config={oidcConfig()}
        returnTo="/"
        authError={authError}
        onDevToken={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('does not render unknown callback details or a password or registration form', () => {
    render(
      <LoginPage
        config={oidcConfig()}
        returnTo="/"
        authError={'user@example.com invitation missing' as never}
        onDevToken={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/密码|password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /注册|register|sign up/i })).not.toBeInTheDocument();
  });

  it('submits a trimmed development token without exposing it in a URL or local storage', async () => {
    const user = userEvent.setup();
    const onDevToken = vi.fn(async () => undefined);
    const localStorageSet = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <LoginPage
        config={devConfig()}
        returnTo="/"
        onDevToken={onDevToken}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('仅限开发环境')).toBeInTheDocument();
    const input = screen.getByLabelText('开发管理员令牌');
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, '  secret-token  ');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onDevToken).toHaveBeenCalledWith('secret-token');
    expect(window.location.href).not.toContain('secret-token');
    expect(localStorageSet).not.toHaveBeenCalledWith(expect.anything(), 'secret-token');
  });

  it('keeps the development form visible and reports a rejected token', async () => {
    const user = userEvent.setup();
    render(
      <LoginPage
        config={devConfig()}
        returnTo="/"
        onDevToken={vi.fn(async () => {
          throw new Error('invalid');
        })}
        onRetry={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('开发管理员令牌'), 'bad-token');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法验证管理员身份，请重试。');
    expect(screen.getByLabelText('开发管理员令牌')).toBeInTheDocument();
  });

  it('renders an authentication service failure with a retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <LoginPage
        status="failed"
        returnTo="/"
        onDevToken={vi.fn()}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('heading', { name: '登录服务暂时不可用' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

function oidcConfig(): PublicAdminAuthConfig {
  return {
    mode: 'oidc',
    entry: 'page',
    defaultMethod: 'company_sso',
    methods: [
      { id: 'company_sso', label: 'Company SSO', startUrl: '/api/auth/login?method=company_sso' },
      { id: 'security_key', label: 'Security Key', startUrl: '/api/auth/login?method=security_key' }
    ]
  };
}

function devConfig(): PublicAdminAuthConfig {
  return { mode: 'dev-bootstrap', entry: 'page', defaultMethod: '', methods: [] };
}
