// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './AdminUsersPage';
import * as api from './api';
import type { AdminIdentity, AdminUser, AdminUserDetail } from './types';

vi.mock('./api', () => ({
  LegateAPIError: class LegateAPIError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  disableAdminIdentity: vi.fn(),
  getAdminUser: vi.fn(),
  listAdminUserIdentities: vi.fn(),
  listAdminUsers: vi.fn(),
  prepareDevelopmentIdentityMigration: vi.fn(),
  revokeAdminUserSessions: vi.fn(),
  updateAdminUser: vi.fn()
}));

const methods = [
  { id: 'corp', label: 'Corporate SSO', startUrl: '/api/auth/login?method=corp' },
  { id: 'partner', label: 'Partner Login', startUrl: '/api/auth/login?method=partner' }
];

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.lang = 'zh';
    vi.mocked(api.listAdminUsers).mockResolvedValue([activeUser(), legacyUser(), invitedUser()]);
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => userID === 42 ? legacyDetail() : userID === 43 ? invitedDetail() : activeDetail());
    vi.mocked(api.listAdminUserIdentities).mockImplementation(async (userID) => userID === 42 ? legacyIdentities() : userID === 43 ? [] : activeIdentities());
    vi.mocked(api.updateAdminUser).mockResolvedValue(activeUser());
    vi.mocked(api.revokeAdminUserSessions).mockResolvedValue();
    vi.mocked(api.disableAdminIdentity).mockResolvedValue();
    vi.mocked(api.prepareDevelopmentIdentityMigration).mockResolvedValue({
      ...legacyUser(),
      status: 'invited',
      invitationStatus: 'pending'
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows compact user state and platform-scoped identity and invitation detail', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: '平台用户' })).toBeInTheDocument();
    expect(screen.getByText('Active User')).toBeInTheDocument();
    expect(screen.getByText('Legacy User')).toBeInTheDocument();
    expect(screen.getByText('Invited User')).toBeInTheDocument();
    expect(screen.getByText('已邀请')).toBeInTheDocument();
    expect(screen.getByText('平台管理员')).toBeInTheDocument();
    expect(screen.queryByText('legacy-subject')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看 Legacy User' }));
    const dialog = await screen.findByRole('dialog', { name: '用户详情' });

    expect(within(dialog).getAllByText('dev-bootstrap')).toHaveLength(2);
    expect(within(dialog).getAllByText('legacy@example.com')).toHaveLength(2);
    expect(within(dialog).getByText('urn:legate:dev-bootstrap')).toBeInTheDocument();
    expect(within(dialog).getByText('legacy-subject')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '复制 issuer' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '复制 subject' })).toBeInTheDocument();
    expect(within(dialog).getByText('已取消')).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: '关闭' })[1]);

    await user.click(screen.getByRole('button', { name: '查看 Invited User' }));
    const invitedDialog = await screen.findByRole('dialog', { name: '用户详情' });
    expect(within(invitedDialog).getByText('Corporate SSO')).toBeInTheDocument();
    expect(within(invitedDialog).getByText('待领取')).toBeInTheDocument();
    expect(within(invitedDialog).getByText('2026-07-21 08:00 UTC')).toBeInTheDocument();
  });

  it('runs confirmed lifecycle, authority, session, and identity actions then refreshes detail', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Active User' }));
    const dialog = await screen.findByRole('dialog', { name: '用户详情' });

    await user.click(within(dialog).getByRole('button', { name: '停用用户' }));
    await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalledWith(41, { status: 'suspended' }));

    await user.click(within(dialog).getByRole('button', { name: '移除平台管理员' }));
    await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalledWith(41, { platformAdmin: false }));

    await user.click(within(dialog).getByRole('button', { name: '撤销所有会话' }));
    await waitFor(() => expect(api.revokeAdminUserSessions).toHaveBeenCalledWith(41));

    await user.click(within(dialog).getByRole('button', { name: '停用身份 Corporate SSO' }));
    await waitFor(() => expect(api.disableAdminIdentity).toHaveBeenCalledWith(41, 501));

    expect(window.confirm).toHaveBeenCalledTimes(4);
    expect(api.getAdminUser).toHaveBeenCalledTimes(5);
    expect(api.listAdminUserIdentities).toHaveBeenCalledTimes(5);
    expect(api.listAdminUsers).toHaveBeenCalledTimes(5);
  });

  it('prepares only a non-platform dev-only user for an exact OIDC provider and email', async () => {
    const user = userEvent.setup();
    let migrated = false;
    vi.mocked(api.listAdminUsers).mockImplementation(async () => [
      activeUser(),
      migrated ? { ...legacyUser(), status: 'invited', invitationStatus: 'pending' } : legacyUser(),
      invitedUser()
    ]);
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => {
      if (userID !== 42) return activeDetail();
      return migrated ? {
        ...legacyUser(),
        status: 'invited',
        invitationStatus: 'pending',
        invitations: [invitedDetail().invitations[0]]
      } : legacyDetail();
    });
    vi.mocked(api.prepareDevelopmentIdentityMigration).mockImplementation(async () => {
      migrated = true;
      return { ...legacyUser(), status: 'invited', invitationStatus: 'pending' };
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    const dialog = await screen.findByRole('dialog', { name: '用户详情' });

    expect(within(dialog).getByRole('heading', { name: '准备 OIDC 迁移' })).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('OIDC Provider'), 'corp');
    await user.clear(within(dialog).getByLabelText('迁移邮箱'));
    await user.type(within(dialog).getByLabelText('迁移邮箱'), 'migrate@example.com');
    await user.click(within(dialog).getByRole('button', { name: '准备迁移' }));

    expect(window.confirm).toHaveBeenCalledWith('确定为该用户准备 OIDC 迁移吗？当前会话会被撤销，但 Workspace 权限会保留。');
    await waitFor(() => expect(api.prepareDevelopmentIdentityMigration).toHaveBeenCalledWith(42, {
      providerId: 'corp',
      email: 'migrate@example.com'
    }));
    expect(api.getAdminUser).toHaveBeenCalledTimes(2);
    expect(api.listAdminUserIdentities).toHaveBeenCalledTimes(2);
    expect(api.listAdminUsers).toHaveBeenCalledTimes(2);
    expect(within(dialog).getByText('已邀请')).toBeInTheDocument();
    expect(within(dialog).getByText('待领取')).toBeInTheDocument();
  });

  it('does not prepare migration when danger confirmation is cancelled', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '准备迁移' }));

    expect(api.prepareDevelopmentIdentityMigration).not.toHaveBeenCalled();
  });

  it('keeps an invited retry provider diagnostic but disables migration when the provider is not public and enabled', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => userID === 42 ? {
      ...legacyDetail(),
      status: 'invited',
      email: 'retry@example.com',
      invitations: [{
        invitationId: 700,
        providerId: 'partner',
        status: 'pending',
        expiresAt: '2026-07-22T00:00:00Z',
        createdAt: '2026-07-15T00:00:00Z'
      }]
    } : activeDetail());
    renderPage([methods[0]]);
    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText('OIDC Provider')).toHaveValue('partner');
    expect(within(dialog).getByRole('option', { name: 'partner · 不可用或已停用' })).toBeDisabled();
    expect(within(dialog).getByText('该邀请的 Provider partner 当前不可用或已停用，无法续期迁移。')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '准备迁移' })).toBeDisabled();
    expect(api.prepareDevelopmentIdentityMigration).not.toHaveBeenCalled();
  });

  it.each([
    ['active dev-only user', { status: 'active', invitations: [] }, true, 'corp', 'legacy@example.com'],
    ['invited exact retry', {
      status: 'invited',
      email: 'retry@example.com',
      invitations: [{
        invitationId: 700,
        providerId: 'partner',
        status: 'pending',
        expiresAt: '2026-07-22T00:00:00Z',
        createdAt: '2026-07-15T00:00:00Z'
      }]
    }, true, 'partner', 'retry@example.com'],
    ['invited without pending retry', { status: 'invited', invitations: [] }, false, '', ''],
    ['suspended dev-only user', { status: 'suspended', invitations: [] }, false, '', '']
  ] as const)('aligns migration eligibility for %s', async (_name, overrides, visible, providerID, email) => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => userID === 42 ? {
      ...legacyDetail(),
      ...overrides,
      invitations: [...overrides.invitations]
    } as AdminUserDetail : activeDetail());
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    const dialog = await screen.findByRole('dialog');

    if (!visible) {
      expect(within(dialog).queryByRole('heading', { name: '准备 OIDC 迁移' })).not.toBeInTheDocument();
      return;
    }
    expect(within(dialog).getByRole('heading', { name: '准备 OIDC 迁移' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('OIDC Provider')).toHaveValue(providerID);
    expect(within(dialog).getByLabelText('迁移邮箱')).toHaveValue(email);
  });

  it('cancels pending invitations on suspend and does not reopen them on restore', async () => {
    const user = userEvent.setup();
    let status: AdminUser['status'] = 'invited';
    let invitationStatus: 'pending' | 'cancelled' = 'pending';
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => userID === 43 ? {
      ...invitedDetail(),
      status,
      invitationStatus,
      invitations: invitedDetail().invitations.map((invitation) => ({ ...invitation, status: invitationStatus }))
    } : activeDetail());
    vi.mocked(api.listAdminUsers).mockImplementation(async () => [
      activeUser(),
      legacyUser(),
      { ...invitedUser(), status, invitationStatus }
    ]);
    vi.mocked(api.updateAdminUser).mockImplementation(async (_userID, payload) => {
      status = payload.status ?? status;
      if (status === 'suspended') invitationStatus = 'cancelled';
      return { ...invitedUser(), status, invitationStatus };
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Invited User' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '停用用户' }));

    await waitFor(() => expect(within(dialog).getByText('已停用')).toBeInTheDocument());
    expect(within(dialog).queryByText('待领取')).not.toBeInTheDocument();
    expect(within(dialog).getByText('已取消')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '恢复用户' }));
    await waitFor(() => expect(within(dialog).getByText('活跃')).toBeInTheDocument());
    expect(within(dialog).queryByText('待领取')).not.toBeInTheDocument();
    expect(within(dialog).getByText('已取消')).toBeInTheDocument();
  });

  it('does not offer migration for a platform user with only dev-bootstrap identities', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => userID === 42 ? {
      ...legacyDetail(),
      platformAdmin: true
    } : activeDetail());
    renderPage();

    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    expect(within(await screen.findByRole('dialog')).queryByRole('heading', { name: '准备 OIDC 迁移' })).not.toBeInTheDocument();
  });

  it('does not offer migration for a user with a production identity', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listAdminUserIdentities).mockResolvedValue(activeIdentities());
    renderPage();

    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    expect(within(await screen.findByRole('dialog')).queryByRole('heading', { name: '准备 OIDC 迁移' })).not.toBeInTheDocument();
  });

  it.each(['invited', 'suspended'] as const)('does not offer platform admin grant to a %s user', async (status) => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminUser).mockImplementation(async (userID) => userID === 43 ? {
      ...invitedDetail(),
      status
    } : activeDetail());
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Invited User' }));

    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: '授予平台管理员' })).not.toBeInTheDocument();
  });

  it('invalidates an in-flight detail request when the dialog closes', async () => {
    const user = userEvent.setup();
    const detailRequest = deferred<AdminUserDetail>();
    const identitiesRequest = deferred<AdminIdentity[]>();
    vi.mocked(api.getAdminUser).mockReturnValue(detailRequest.promise);
    vi.mocked(api.listAdminUserIdentities).mockReturnValue(identitiesRequest.promise);
    renderPage();

    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getAllByRole('button', { name: '关闭' })[0]);
    detailRequest.resolve(legacyDetail());
    identitiesRequest.resolve(legacyIdentities());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('legacy-subject')).not.toBeInTheDocument();
  });

  it('allows closing during a deferred mutation and skips the platform detail refresh', async () => {
    const user = userEvent.setup();
    const mutation = deferred<AdminUser>();
    vi.mocked(api.updateAdminUser).mockReturnValue(mutation.promise);
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Active User' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '停用用户' }));
    await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalled());

    const closeButton = within(dialog).getAllByRole('button', { name: '关闭' })[0];
    expect(closeButton).toBeEnabled();
    await user.click(closeButton);
    mutation.resolve(activeUser());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.listAdminUsers).toHaveBeenCalledTimes(1);
    expect(api.getAdminUser).toHaveBeenCalledTimes(1);
    expect(api.listAdminUserIdentities).toHaveBeenCalledTimes(1);
  });

  it('ignores a deferred post-mutation refresh after Escape closes the dialog', async () => {
    const user = userEvent.setup();
    const refreshedDetail = deferred<AdminUserDetail>();
    const refreshedIdentities = deferred<AdminIdentity[]>();
    vi.mocked(api.getAdminUser)
      .mockResolvedValueOnce(activeDetail())
      .mockReturnValueOnce(refreshedDetail.promise);
    vi.mocked(api.listAdminUserIdentities)
      .mockResolvedValueOnce(activeIdentities())
      .mockReturnValueOnce(refreshedIdentities.promise);
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Active User' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '停用用户' }));
    await waitFor(() => expect(api.getAdminUser).toHaveBeenCalledTimes(2));

    fireEvent.keyDown(document, { key: 'Escape' });
    refreshedDetail.resolve(activeDetail());
    refreshedIdentities.resolve(activeIdentities());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('corp-subject')).not.toBeInTheDocument();
  });

  it('ignores an older detail response after another user is opened', async () => {
    const user = userEvent.setup();
    const oldDetail = deferred<AdminUserDetail>();
    const oldIdentities = deferred<AdminIdentity[]>();
    vi.mocked(api.getAdminUser)
      .mockReturnValueOnce(oldDetail.promise)
      .mockResolvedValueOnce(invitedDetail());
    vi.mocked(api.listAdminUserIdentities)
      .mockReturnValueOnce(oldIdentities.promise)
      .mockResolvedValueOnce([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: '查看 Legacy User' }));
    await user.click(within(await screen.findByRole('dialog')).getAllByRole('button', { name: '关闭' })[0]);
    await user.click(screen.getByRole('button', { name: '查看 Invited User' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('invited@example.com')).toBeInTheDocument());

    oldDetail.resolve(legacyDetail());
    oldIdentities.resolve(legacyIdentities());
    await Promise.resolve();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Invited User/)).toBeInTheDocument();
    expect(within(dialog).queryByText('legacy-subject')).not.toBeInTheDocument();
  });

  it.each([
    ['admin_auth_locked', '该操作会移除最后一个可用的平台管理员登录路径，因此无法执行。'],
    ['admin_recovery_target_in_use', '该用户是当前管理员恢复目标，请先调整恢复配置。']
  ])('explains non-actionable %s mutations', async (code, explanation) => {
    const user = userEvent.setup();
    vi.mocked(api.updateAdminUser).mockRejectedValue(new api.LegateAPIError(409, code, 'conflict'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '查看 Active User' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '停用用户' }));

    expect(await screen.findByText(explanation)).toBeInTheDocument();
  });
});

function renderPage(loginMethods = methods) {
  return render(<AdminUsersPage currentUserId={999} methods={loginMethods} onSelfDemoted={vi.fn()} onToast={vi.fn()} />);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

function activeUser(): AdminUser {
  return {
    userId: 41,
    email: 'active@example.com',
    displayName: 'Active User',
    status: 'active',
    invitationStatus: 'claimed',
    platformAdmin: true,
    lastLoginAt: '2026-07-14T01:02:00Z',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-14T01:02:00Z'
  };
}

function legacyUser(): AdminUser {
  return {
    userId: 42,
    email: 'legacy@example.com',
    displayName: 'Legacy User',
    status: 'active',
    invitationStatus: '',
    platformAdmin: false,
    lastLoginAt: null,
    createdAt: '2026-07-02T00:00:00Z',
    updatedAt: '2026-07-14T00:00:00Z'
  };
}

function invitedUser(): AdminUser {
  return {
    userId: 43,
    email: 'invited@example.com',
    displayName: 'Invited User',
    status: 'invited',
    invitationStatus: 'pending',
    platformAdmin: false,
    lastLoginAt: null,
    createdAt: '2026-07-03T00:00:00Z',
    updatedAt: '2026-07-14T08:00:00Z'
  };
}

function activeDetail(): AdminUserDetail {
  return { ...activeUser(), invitations: [] };
}

function legacyDetail(): AdminUserDetail {
  return {
    ...legacyUser(),
    invitations: [
      {
        invitationId: 600,
        providerId: 'partner',
        status: 'cancelled',
        expiresAt: '2026-07-20T08:00:00Z',
        createdAt: '2026-07-13T08:00:00Z'
      }
    ]
  };
}

function invitedDetail(): AdminUserDetail {
  return {
    ...invitedUser(),
    invitations: [{
      invitationId: 601,
      providerId: 'corp',
      status: 'pending',
      expiresAt: '2026-07-21T08:00:00Z',
      createdAt: '2026-07-14T08:00:00Z'
    }]
  };
}

function activeIdentities(): AdminIdentity[] {
  return [{
    identityId: 501,
    providerId: 'corp',
    issuer: 'https://login.example.com',
    subject: 'corp-subject',
    emailAtLink: 'active@example.com',
    status: 'active',
    lastLoginAt: '2026-07-14T01:02:00Z'
  }];
}

function legacyIdentities(): AdminIdentity[] {
  return [{
    identityId: 502,
    providerId: 'dev-bootstrap',
    issuer: 'urn:legate:dev-bootstrap',
    subject: 'legacy-subject',
    emailAtLink: 'legacy@example.com',
    status: 'active',
    lastLoginAt: null
  }];
}
