// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceMembersPanel from './WorkspaceMembersPanel';
import * as api from './api';
import type { WorkspaceMember, WorkspaceMemberResolution } from './types';

vi.mock('./api', () => ({
  addWorkspaceMember: vi.fn(),
  deleteWorkspaceMember: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  resolveWorkspaceMember: vi.fn()
}));

const workspace = { id: 7, slug: 'alpha', name: 'Alpha' };
const methods = [
  { id: 'corp', label: 'Corp SSO', startUrl: '/api/auth/login?method=corp' },
  { id: 'partner', label: 'Partner SSO', startUrl: '/api/auth/login?method=partner' }
];

describe('WorkspaceMembersPanel', () => {
  beforeEach(() => {
    vi.mocked(api.listWorkspaceMembers).mockResolvedValue([
      memberFixture({
        userId: 11,
        email: 'active@example.com',
        displayName: 'Active User',
        userStatus: 'active',
        invitationStatus: ''
      }),
      memberFixture({
        userId: 12,
        email: 'invited@example.com',
        displayName: 'Invited User',
        userStatus: 'invited',
        invitationStatus: 'pending'
      }),
      memberFixture({
        userId: 13,
        email: 'suspended@example.com',
        displayName: 'Suspended User',
        userStatus: 'suspended',
        invitationStatus: 'claimed'
      })
    ]);
    vi.mocked(api.addWorkspaceMember).mockImplementation(async (_workspaceId, payload) => memberFixture({
      userId: 'userId' in payload ? payload.userId : 99,
      email: 'email' in payload ? payload.email : 'resolved@example.com',
      displayName: '',
      userStatus: 'userId' in payload ? 'active' : 'invited',
      invitationStatus: 'userId' in payload ? 'claimed' : 'pending',
      role: payload.role
    }));
    vi.mocked(api.deleteWorkspaceMember).mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads members and exposes user and invitation status badges', async () => {
    renderPanel();

    expect(await screen.findByText('Active User')).toBeInTheDocument();
    expect(api.listWorkspaceMembers).toHaveBeenCalledWith(7);
    expect(screen.getAllByText('活跃')).toHaveLength(1);
    expect(screen.getAllByText('已邀请')).toHaveLength(1);
    expect(screen.getAllByText('已停用')).toHaveLength(1);
    expect(screen.getByText('待领取')).toBeInTheDocument();
    expect(screen.getAllByText('已领取')).toHaveLength(1);
    const activeRow = screen.getByText('Active User').closest('tr');
    expect(activeRow).not.toBeNull();
    expect(within(activeRow!).getByText('—')).toBeInTheDocument();
    expect(within(activeRow!).queryByText('adminInvitation.status.')).not.toBeInTheDocument();
  });

  it('resolves an exact email and requires explicit confirmation of the numeric user ID', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resolveWorkspaceMember).mockResolvedValue({
      userId: 42,
      email: 'exact@example.com',
      displayName: 'Exact User',
      status: 'active'
    });
    renderPanel();
    await screen.findByText('Active User');

    await user.type(screen.getByLabelText('用户邮箱'), ' exact@example.com ');
    await user.click(screen.getByRole('button', { name: '精确查找' }));

    expect(api.resolveWorkspaceMember).toHaveBeenCalledWith(7, 'exact@example.com');
    expect(await screen.findByText('#42')).toBeInTheDocument();
    expect(screen.getByText('Exact User')).toBeInTheDocument();
    expect(api.addWorkspaceMember).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确认添加用户 #42' }));
    await waitFor(() => expect(api.addWorkspaceMember).toHaveBeenCalledWith(7, { userId: 42, role: 'viewer' }));
  });

  it('does not silently invite a suspended resolved user', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resolveWorkspaceMember).mockResolvedValue({
      userId: 77,
      email: 'blocked@example.com',
      displayName: 'Blocked User',
      status: 'suspended'
    });
    const onToast = vi.fn();
    renderPanel({ onToast });
    await screen.findByText('Active User');

    await user.type(screen.getByLabelText('用户邮箱'), 'blocked@example.com');
    await user.click(screen.getByRole('button', { name: '精确查找' }));

    expect(await screen.findByText('该用户已停用，不能加入 Workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /确认添加用户/ })).not.toBeInTheDocument();
    expect(api.addWorkspaceMember).not.toHaveBeenCalled();
  });

  it('ignores stale resolver responses and never submits an obsolete user ID', async () => {
    const user = userEvent.setup();
    const oldRequest = deferred<WorkspaceMemberResolution>();
    const currentRequest = deferred<WorkspaceMemberResolution>();
    vi.mocked(api.resolveWorkspaceMember)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    renderPanel();
    await screen.findByText('Active User');

    const emailInput = screen.getByLabelText('用户邮箱');
    await user.type(emailInput, 'old@example.com');
    await user.click(screen.getByRole('button', { name: '精确查找' }));
    await user.clear(emailInput);
    await user.type(emailInput, 'current@example.com');
    await user.click(screen.getByRole('button', { name: '精确查找' }));

    currentRequest.resolve({
      userId: 99,
      email: 'current@example.com',
      displayName: 'Current User',
      status: 'active'
    });
    expect(await screen.findByText('#99')).toBeInTheDocument();

    oldRequest.resolve({
      userId: 42,
      email: 'old@example.com',
      displayName: 'Old User',
      status: 'active'
    });
    await waitFor(() => expect(screen.queryByText('#42')).not.toBeInTheDocument());
    expect(screen.getByText('#99')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认添加用户 #99' }));
    await waitFor(() => expect(api.addWorkspaceMember).toHaveBeenCalledWith(7, { userId: 99, role: 'viewer' }));
    expect(api.addWorkspaceMember).not.toHaveBeenCalledWith(7, { userId: 42, role: 'viewer' });
  });

  it('invites a new user through a configured OIDC provider', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Active User');

    await user.click(screen.getByRole('button', { name: '邀请新用户' }));
    await user.type(screen.getByLabelText('邀请邮箱'), ' new@example.com ');
    await selectCustomOption(user, screen.getByLabelText('OIDC 登录方式'), 'Partner SSO');
    await selectCustomOption(user, screen.getByLabelText('角色'), '管理员');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    await waitFor(() => expect(api.addWorkspaceMember).toHaveBeenCalledWith(7, {
      email: 'new@example.com',
      providerId: 'partner',
      role: 'admin'
    }));
    expect(screen.queryByRole('button', { name: /添加 OIDC|管理 OIDC|删除 OIDC/ })).not.toBeInTheDocument();
  });

  it('updates roles and deletes members by numeric user ID', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel();
    const row = (await screen.findByText('Active User')).closest('tr');
    expect(row).not.toBeNull();

    await selectCustomOption(user, within(row!).getByLabelText('Active User 角色'), '管理员');
    await waitFor(() => expect(api.addWorkspaceMember).toHaveBeenCalledWith(7, { userId: 11, role: 'admin' }));

    const refreshedRow = (await screen.findByText('Active User')).closest('tr');
    expect(refreshedRow).not.toBeNull();
    await user.click(within(refreshedRow!).getByRole('button', { name: '删除 Active User' }));
    await waitFor(() => expect(api.deleteWorkspaceMember).toHaveBeenCalledWith(7, 11));
  });

  it('keeps a suspended member role immutable while still allowing removal', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel();
    const row = (await screen.findByText('Suspended User')).closest('tr');
    expect(row).not.toBeNull();
    const role = within(row!).getByLabelText('Suspended User 角色');

    expect(role).toBeDisabled();
    await user.click(role);
    expect(api.addWorkspaceMember).not.toHaveBeenCalledWith(7, { userId: 13, role: 'admin' });

    await user.click(within(row!).getByRole('button', { name: '删除 Suspended User' }));
    await waitFor(() => expect(api.deleteWorkspaceMember).toHaveBeenCalledWith(7, 13));
  });

  it('keeps member listing read-only when write capability is absent', async () => {
    renderPanel({ canWrite: false });

    expect(await screen.findByText('Active User')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '已有用户' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '邀请新用户' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Active User 角色')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除 Active User' })).not.toBeInTheDocument();
  });
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof WorkspaceMembersPanel>> = {}) {
  return render(
    <WorkspaceMembersPanel
      workspace={workspace}
      canWrite
      methods={methods}
      onClose={vi.fn()}
      onToast={vi.fn()}
      {...overrides}
    />
  );
}

function memberFixture(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    workspaceId: 7,
    userId: 11,
    email: 'member@example.com',
    displayName: 'Member',
    userStatus: 'active',
    role: 'viewer',
    invitationStatus: 'claimed',
    lastLoginAt: '2026-07-13T08:00:00Z',
    createdAt: '2026-07-12T08:00:00Z',
    updatedAt: '2026-07-12T08:00:00Z',
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function selectCustomOption(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, optionName: string) {
  await user.click(trigger);
  await user.click(screen.getByRole('option', { name: optionName }));
}
