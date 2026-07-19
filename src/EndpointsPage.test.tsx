// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EndpointsPage, {
  type EndpointGroupListItem,
  type EndpointsPageLabels
} from './EndpointsPage';

const labels: EndpointsPageLabels = {
  title: '接入点',
  subtitle: '管理上游连接、模型和调度',
  createGroup: '创建接入点组',
  createEndpoint: (groupName) => `在 ${groupName} 中创建接入点`,
  openGroupActions: (groupName) => `${groupName} 更多操作`,
  deleteGroup: '删除',
  groupDeleteBlocked: '该组中仍有接入点',
  expandGroup: (groupName) => `展开 ${groupName}`,
  collapseGroup: (groupName) => `折叠 ${groupName}`,
  openEndpoint: (endpointName) => `查看 ${endpointName}`,
  endpointCount: (count) => `${count} 个接入点`,
  modelCount: (count) => `${count} 个模型`,
  emptyGroup: '这个组还没有接入点',
  emptyPage: '还没有接入点组',
  driver: '驱动',
  models: '模型',
  kind: '类型',
  status: '状态',
  kinds: { text: '文本', image: '图片', video: '视频' },
  statuses: { enabled: '启用', disabled: '停用', error: '异常' }
};

const groups: EndpointGroupListItem[] = [
  {
    id: 11,
    name: 'OpenAI Production',
    remark: 'Production endpoints',
    endpoints: [
      {
        id: 101,
        name: 'OpenAI Text',
        remark: 'Primary text route',
        kind: 'text',
        status: 'enabled',
        driverLabel: 'builtin://openai-chat-compatible@1',
        modelCount: 3
      },
      {
        id: 102,
        name: 'OpenAI Image',
        kind: 'image',
        status: 'disabled',
        driverLabel: 'profile://workspace/openai-image@sha256:abc',
        modelCount: 1
      }
    ]
  },
  {
    id: 22,
    name: 'Future Media',
    endpoints: []
  }
];

describe('EndpointsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders grouped endpoints with one page-level create action and group-scoped actions', async () => {
    const user = userEvent.setup();
    const onCreateGroup = vi.fn();
    const onCreateEndpoint = vi.fn();
    const onDeleteGroup = vi.fn();
    const onOpenEndpoint = vi.fn();
    renderPage({ onCreateGroup, onCreateEndpoint, onDeleteGroup, onOpenEndpoint });

    expect(screen.getByRole('heading', { name: '接入点' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '创建接入点组' })).toHaveLength(1);
    expect(screen.getByText('2 个接入点')).toBeInTheDocument();
    expect(screen.getByText('0 个接入点')).toBeInTheDocument();
    expect(screen.getByText('这个组还没有接入点')).toBeInTheDocument();
    expect(screen.getByText('builtin://openai-chat-compatible@1')).toBeInTheDocument();
    expect(screen.getByText('图片')).toBeInTheDocument();
    const textEndpoint = screen.getByRole('button', { name: '查看 OpenAI Text' }).closest('.endpoint-list-item');
    expect(textEndpoint).not.toBeNull();
    expect(within(textEndpoint as HTMLElement).getByText('类型')).toBeInTheDocument();
    expect(within(textEndpoint as HTMLElement).getByText('状态')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建接入点组' }));
    await user.click(screen.getByRole('button', { name: '在 OpenAI Production 中创建接入点' }));
    await user.click(screen.getByRole('button', { name: 'OpenAI Production 更多操作' }));
    expect(screen.getByRole('menu', { name: 'OpenAI Production 更多操作' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看 OpenAI Text' }));

    expect(onCreateGroup).toHaveBeenCalledTimes(1);
    expect(onCreateEndpoint).toHaveBeenCalledWith(11);
    expect(onDeleteGroup).not.toHaveBeenCalled();
    expect(onOpenEndpoint).toHaveBeenCalledWith(101);
  });

  it('toggles a group from the keyboard and restores collapse state per workspace and group', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage();
    const toggle = screen.getByRole('button', { name: '折叠 OpenAI Production' });

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('legate.endpoints.group-collapsed:workspace-alpha:11')).toBe('1');
    expect(screen.queryByText('OpenAI Text')).not.toBeInTheDocument();

    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: '折叠 OpenAI Production' })).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem('legate.endpoints.group-collapsed:workspace-alpha:11')).toBe('0');

    await user.click(screen.getByRole('button', { name: '折叠 OpenAI Production' }));
    rerender(page({ workspaceKey: 'workspace-beta' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '折叠 OpenAI Production' })).toHaveAttribute('aria-expanded', 'true');
    });

    rerender(page({ workspaceKey: 'workspace-alpha' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开 OpenAI Production' })).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('keeps viewer groups readable and collapsible without rendering mutation controls', async () => {
    const user = userEvent.setup();
    const onCreateGroup = vi.fn();
    const onCreateEndpoint = vi.fn();
    const onDeleteGroup = vi.fn();
    const onOpenEndpoint = vi.fn();
    renderPage({ canWrite: false, onCreateGroup, onCreateEndpoint, onDeleteGroup, onOpenEndpoint });

    expect(screen.queryByRole('button', { name: '创建接入点组' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /中创建接入点/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /更多操作/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '折叠 Future Media' }));
    expect(screen.getByRole('button', { name: '展开 Future Media' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: '查看 OpenAI Text' }));

    expect(onOpenEndpoint).toHaveBeenCalledWith(101);
    expect(onCreateGroup).not.toHaveBeenCalled();
    expect(onCreateEndpoint).not.toHaveBeenCalled();
    expect(onDeleteGroup).not.toHaveBeenCalled();
  });

  it('guards group deletion in a downward action menu', async () => {
    const user = userEvent.setup();
    const onDeleteGroup = vi.fn();
    renderPage({ onDeleteGroup });

    await user.click(screen.getByRole('button', { name: 'OpenAI Production 更多操作' }));
    const blockedMenu = screen.getByRole('menu', { name: 'OpenAI Production 更多操作' });
    const blockedDelete = within(blockedMenu).getByRole('menuitem', { name: '删除' });
    expect(blockedDelete).toBeDisabled();
    expect(blockedDelete).toHaveClass('danger');
    expect(blockedDelete).toHaveAttribute('aria-describedby');
    expect(within(blockedMenu).getByRole('tooltip')).toHaveTextContent('该组中仍有接入点');

    await user.click(screen.getByRole('button', { name: 'Future Media 更多操作' }));
    const emptyMenu = screen.getByRole('menu', { name: 'Future Media 更多操作' });
    const enabledDelete = within(emptyMenu).getByRole('menuitem', { name: '删除' });
    expect(enabledDelete).toBeEnabled();
    await user.click(enabledDelete);

    expect(onDeleteGroup).toHaveBeenCalledWith(22);
  });

  it('keeps group actions in the DOM with explicit names for touch users', () => {
    renderPage();
    const group = screen.getByText('OpenAI Production').closest('.endpoint-group-section');
    expect(group).not.toBeNull();
    const create = within(group as HTMLElement).getByRole('button', { name: '在 OpenAI Production 中创建接入点' });
    const more = within(group as HTMLElement).getByRole('button', { name: 'OpenAI Production 更多操作' });
    expect(create).toHaveAttribute('title', '在 OpenAI Production 中创建接入点');
    expect(more).toHaveAttribute('title', 'OpenAI Production 更多操作');
  });
});

function renderPage(overrides: Partial<React.ComponentProps<typeof EndpointsPage>> = {}) {
  return render(page(overrides));
}

function page(overrides: Partial<React.ComponentProps<typeof EndpointsPage>> = {}) {
  return (
    <EndpointsPage
      workspaceKey="workspace-alpha"
      groups={groups}
      canWrite
      labels={labels}
      onCreateGroup={vi.fn()}
      onCreateEndpoint={vi.fn()}
      onDeleteGroup={vi.fn()}
      onOpenEndpoint={vi.fn()}
      {...overrides}
    />
  );
}
