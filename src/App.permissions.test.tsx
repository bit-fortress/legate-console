// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as api from './api';
import type { DriverCatalogItem, DriverProfile, Endpoint, EndpointGroup, InvocationAnalyticsSummary, InvocationAttempt, ModelGroup, ModelGroupMappingStatistics, ModelGroupUptimeSummaryList, ModelKind, WorkspaceAccess } from './types';

vi.mock('./api', () => ({
  LegateAPIError: class LegateAPIError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  createAPIKey: vi.fn(),
  createEndpoint: vi.fn(),
  createEndpointGroup: vi.fn(),
  createGroup: vi.fn(),
  createSidecarToken: vi.fn(),
  createWorkspace: vi.fn(),
  deleteAPIKey: vi.fn(),
  deleteDriverProfile: vi.fn(),
  deleteEndpoint: vi.fn(),
  deleteEndpointGroup: vi.fn(),
  deleteGroup: vi.fn(),
  deleteSidecarToken: vi.fn(),
  discoverEndpointModels: vi.fn(),
  getAnalyticsSummary: vi.fn(),
  getGroup: vi.fn(),
  getModelGroupMappingStatistics: vi.fn(),
  getModelGroupUptimeSummaries: vi.fn(),
  getSidecarInstance: vi.fn(),
  getSidecarSnapshot: vi.fn(),
  getWorkspaceSlug: vi.fn(() => 'workspace-alpha'),
  healthz: vi.fn(),
  listAPIKeys: vi.fn(),
  listDriverProfiles: vi.fn(),
  listDrivers: vi.fn(),
  listEndpointGroups: vi.fn(),
  listEndpoints: vi.fn(),
  listGroups: vi.fn(),
  listInvocationAttempts: vi.fn(),
  listInvocationRequests: vi.fn(),
  listMyWorkspaces: vi.fn(),
  listSidecarInstances: vi.fn(),
  listSidecarTokens: vi.fn(),
  listWorkspaces: vi.fn(),
  moveEndpoint: vi.fn(),
  saveWorkspaceSlug: vi.fn(),
  updateAPIKey: vi.fn(),
  updateDriverAlias: vi.fn(),
  updateEndpoint: vi.fn(),
  updateEndpointGroup: vi.fn(),
  updateEndpointSchedule: vi.fn(),
  updateGroup: vi.fn(),
  updateSidecarToken: vi.fn(),
  updateWorkspace: vi.fn(),
  uploadDriverProfile: vi.fn()
}));

const endpointGroups: EndpointGroup[] = [
  {
    id: 11,
    workspaceId: 1,
    name: 'Production',
    remark: 'Primary upstreams',
    sortOrder: 0,
    endpointCount: 1,
    createdAt: '2026-07-16T00:00:00Z',
    updatedAt: '2026-07-16T00:00:00Z'
  }
];

const endpoints: Endpoint[] = [
  {
    id: 101,
    workspaceId: 1,
    groupId: 11,
    name: 'OpenAI Text',
    remark: 'Primary text route',
    kind: 'text',
    status: 'enabled',
    scheduleEnabled: true,
    driverRef: 'builtin://openai-chat-compatible@1',
    driverConfig: {},
    baseUrl: 'https://api.openai.com/v1',
    credentialSlots: [{ name: 'api_key', configured: true }],
    models: [{
      id: 'gpt-5',
      textFeatures: ['text'],
      imageProtocolContracts: [],
      imageProtocolLimits: [],
      inputPricePerMillion: '1',
      outputPricePerMillion: '2',
      cachePricePerMillion: '0'
    }],
    modelGroupNames: ['chat'],
    uptime: { available: 10, total: 10, percentage: 100 },
    lastUsedAt: null,
    createdAt: '2026-07-16T00:00:00Z',
    updatedAt: '2026-07-16T01:00:00Z'
  }
];

const drivers: DriverCatalogItem[] = [
  driverFixture('text', 'builtin://openai-chat-compatible@1', 'OpenAI Text'),
  driverFixture('image', 'builtin://openai-image-compatible@1', 'OpenAI Image')
];

describe('App endpoint permissions and flows', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/endpoints');
    vi.mocked(api.healthz).mockResolvedValue({ ok: true });
    vi.mocked(api.listEndpointGroups).mockResolvedValue(endpointGroups);
    vi.mocked(api.listEndpoints).mockResolvedValue(endpoints);
    vi.mocked(api.listDrivers).mockResolvedValue(drivers);
    vi.mocked(api.listDriverProfiles).mockResolvedValue([]);
    vi.mocked(api.listGroups).mockResolvedValue([]);
    vi.mocked(api.listAPIKeys).mockResolvedValue([]);
    vi.mocked(api.listSidecarTokens).mockResolvedValue([]);
    vi.mocked(api.listInvocationAttempts).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(api.listInvocationRequests).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(api.getAnalyticsSummary).mockResolvedValue(analyticsSummaryFixture());
    vi.mocked(api.getModelGroupMappingStatistics).mockResolvedValue(modelGroupStatisticsFixture());
    vi.mocked(api.getModelGroupUptimeSummaries).mockResolvedValue(modelGroupUptimeFixture());
    vi.mocked(api.listWorkspaces).mockResolvedValue([]);
    vi.mocked(api.createEndpoint).mockResolvedValue(endpoints[0]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('follows live system theme changes when the system preference is selected', async () => {
    const user = userEvent.setup();
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
    localStorage.setItem('legate.theme', 'light');
    mockWorkspace([]);

    renderApp();
    await user.click(screen.getByRole('button', { name: '个人设置' }));
    await user.click(within(screen.getByTestId('theme-toggle')).getByRole('button', { name: '跟随系统' }));

    expect(localStorage.getItem('legate.theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => {
      dark = true;
      changeListener?.();
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('creates endpoints only from a group and locks the selected group', async () => {
    const user = userEvent.setup();
    mockWorkspace(['endpoints:read', 'endpoints:write', 'endpoint_drivers:read']);
    renderApp();

    await screen.findByRole('button', { name: '查看 OpenAI Text' });
    expect(screen.getAllByRole('button', { name: '创建接入点组' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '创建接入点' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '在 Production 中创建接入点' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: '创建接入点' })).toBeInTheDocument();
    const groupControl = within(dialog).getByRole('button', { name: '接入点组' });
    expect(groupControl).toBeDisabled();
    expect(groupControl).toHaveTextContent('Production');

    await user.click(within(dialog).getByRole('button', { name: '类型' }));
    await user.click(screen.getByRole('option', { name: '图片' }));
    await user.click(within(dialog).getByRole('button', { name: '驱动' }));
    expect(screen.getByRole('option', { name: 'OpenAI Image' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'OpenAI Text' })).not.toBeInTheDocument();
  });

  it('clears the selected driver when a create draft changes kind', async () => {
    const user = userEvent.setup();
    mockWorkspace(['endpoints:read', 'endpoints:write', 'endpoint_drivers:read']);
    renderApp();
    await screen.findByRole('button', { name: '查看 OpenAI Text' });

    await user.click(screen.getByRole('button', { name: '在 Production 中创建接入点' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '接入点类型' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Chat Completions' }));
    expect(within(dialog).getByRole('button', { name: '驱动' })).toHaveTextContent('OpenAI Text');

    await user.click(within(dialog).getByRole('button', { name: '类型' }));
    await user.click(screen.getByRole('option', { name: '图片' }));
    expect(within(dialog).getByRole('button', { name: '驱动' })).toHaveTextContent('选择驱动');
  });

  it('links exposed text protocols with compatible endpoint choices in both directions', async () => {
    const user = userEvent.setup();
    const universalEndpoint: Endpoint = {
      ...endpoints[0],
      id: 102,
      name: 'Universal Text',
      driverRef: 'builtin://universal-text@1',
      modelGroupNames: []
    };
    const universalDriver = driverFixture('text', 'builtin://universal-text@1', 'Universal Text');
    if (universalDriver.manifest.text) {
      universalDriver.manifest.text.protocolContracts = [
        'openai.chat_completions/2026-07-18',
        'openai.responses/2026-07-18',
        'anthropic.messages/2026-07-18'
      ];
    }
    window.history.replaceState({}, '', '/groups');
    vi.mocked(api.listEndpoints).mockResolvedValue([endpoints[0], universalEndpoint]);
    vi.mocked(api.listDrivers).mockResolvedValue([drivers[0], universalDriver]);
    mockWorkspace(['model_groups:read', 'model_groups:write', 'endpoints:read', 'endpoint_drivers:read']);
    renderApp();

    await user.click(await screen.findByRole('button', { name: '添加模型组' }));
    const dialog = screen.getByRole('dialog', { name: '添加模型组' });
    const timeoutInput = within(dialog).getByRole('spinbutton', { name: '上游首响应超时（秒）' });
    expect(timeoutInput).toHaveAttribute('placeholder', '继承默认值');
    expect(timeoutInput).toHaveAttribute('max', '1800');
    expect(within(dialog).getByText('留空默认 180 秒，最高 1800 秒')).toBeInTheDocument();
    const endpointSelect = within(dialog).getByRole('button', { name: '接入点' });

    await user.click(endpointSelect);
    expect(screen.getByRole('option', { name: 'Universal Text' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'OpenAI Text' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(within(dialog).getByLabelText('OpenAI Responses'));
    await user.click(within(dialog).getByLabelText('Anthropic Messages'));
    await user.click(endpointSelect);
    expect(screen.getByRole('option', { name: 'Universal Text' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'OpenAI Text' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'OpenAI Text' }));

    expect(within(dialog).getByLabelText('OpenAI Chat Completions')).not.toBeDisabled();
    expect(within(dialog).getByLabelText('OpenAI Responses')).toBeDisabled();
    expect(within(dialog).getByLabelText('Anthropic Messages')).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: '名称' }), 'reasoning');
    await user.type(timeoutInput, '181');
    await user.click(within(dialog).getByRole('button', { name: '模型' }));
    await user.click(screen.getByRole('option', { name: 'gpt-5' }));
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith(expect.objectContaining({
      firstResponseTimeoutSeconds: 181
    })));
  });

  it('defaults new model groups to central forwarding and warns on the Sidecar option', async () => {
    const user = userEvent.setup();
    const warning = '该方式会将模型供应商的配置信息全量下发至 Sidecar 上，请确保 Sidecar 处于可信环境中';
    window.history.replaceState({}, '', '/groups');
    mockWorkspace(['model_groups:read', 'model_groups:write', 'endpoints:read', 'endpoint_drivers:read']);
    renderApp();

    await user.click(await screen.findByRole('button', { name: '添加模型组' }));
    const dialog = screen.getByRole('dialog', { name: '添加模型组' });
    const forwardingSelect = within(dialog).getByRole('button', { name: 'Sidecar 配置下发' });
    expect(forwardingSelect).toHaveTextContent('仅引用（转发到中心节点）');

    await user.click(forwardingSelect);
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      '仅引用（转发到中心节点）',
      '完整下发（Sidecar 本地转发）'
    ]);
    const warningIcon = screen.getByRole('img', { name: warning });
    expect(warningIcon).toHaveClass('select-option-warning');
    expect(warningIcon.closest('[role="option"]')).toHaveTextContent('完整下发（Sidecar 本地转发）');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseEnter(warningIcon);
    expect(screen.getByRole('tooltip')).toHaveTextContent(warning);

    fireEvent.mouseLeave(warningIcon);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps an existing model group forwarding mode without the create-only warning', async () => {
    const user = userEvent.setup();
    const warning = '该方式会将模型供应商的配置信息全量下发至 Sidecar 上，请确保 Sidecar 处于可信环境中';
    const existingGroup: ModelGroup = {
      id: 3,
      workspaceId: 1,
      name: 'chat',
      description: 'Primary route',
      kind: 'text',
      status: 'normal',
      firstResponseTimeoutSeconds: null,
      effectiveFirstResponseTimeoutSeconds: 180,
      routingMode: 'tiered_failover',
      sidecarConfigMode: 'full',
      inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
      mappings: [{ id: 41, groupId: 3, endpointId: 101, modelId: 'gpt-5', tier: 0, weight: 100, sortOrder: 0 }],
      endpointTotal: 1,
      endpointAvailable: 1,
      createdAt: '',
      updatedAt: ''
    };
    window.history.replaceState({}, '', '/groups');
    vi.mocked(api.listGroups).mockResolvedValue([existingGroup]);
    mockWorkspace(['model_groups:read', 'model_groups:write', 'endpoints:read', 'endpoint_drivers:read']);
    renderApp();

    const row = await screen.findByRole('row', { name: /chat/ });
    await user.click(within(row).getByRole('button', { name: '编辑' }));
    const dialog = screen.getByRole('dialog', { name: '编辑' });
    const forwardingSelect = within(dialog).getByRole('button', { name: 'Sidecar 配置下发' });
    expect(forwardingSelect).toHaveTextContent('完整下发（Sidecar 本地转发）');

    await user.click(forwardingSelect);
    expect(screen.queryByRole('img', { name: warning })).not.toBeInTheDocument();
  });

  it('keeps mapping creation in a list toolbar and reorders tiers only after blur', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/groups');
    mockWorkspace(['model_groups:read', 'model_groups:write', 'endpoints:read', 'endpoint_drivers:read']);
    renderApp();

    await user.click(await screen.findByRole('button', { name: '添加模型组' }));
    const dialog = screen.getByRole('dialog', { name: '添加模型组' });
    const mappingToolbar = within(dialog).getByRole('toolbar', { name: '映射列表' });
    expect(within(mappingToolbar).getByText('1 条映射')).toBeInTheDocument();

    await user.click(within(mappingToolbar).getByRole('button', { name: '添加映射' }));
    expect(within(mappingToolbar).getByText('2 条映射')).toBeInTheDocument();
    let tierInputs = within(dialog).getAllByRole('spinbutton', { name: '层级' });

    await user.clear(tierInputs[0]);
    await user.type(tierInputs[0], '2');
    tierInputs = within(dialog).getAllByRole('spinbutton', { name: '层级' });
    expect(tierInputs.map((input) => (input as HTMLInputElement).value)).toEqual(['2', '0']);

    await user.tab();
    tierInputs = within(dialog).getAllByRole('spinbutton', { name: '层级' });
    expect(tierInputs.map((input) => (input as HTMLInputElement).value)).toEqual(['0', '2']);
  });

  it('shows the last-hour uptime for every model group in the outer list', async () => {
    window.history.replaceState({}, '', '/groups');
    vi.mocked(api.listGroups).mockResolvedValue([modelGroupFixture()]);
    mockWorkspace(['model_groups:read', 'analytics:read']);

    renderApp();

    const row = await screen.findByRole('row', { name: /chat/ });
    expect(screen.getByRole('columnheader', { name: '可用率' })).toHaveAttribute('title', '最近 1 小时');
    expect(within(row).getByText('75%')).toBeInTheDocument();
    await waitFor(() => expect(api.getModelGroupUptimeSummaries).toHaveBeenCalledTimes(1));
    const range = vi.mocked(api.getModelGroupUptimeSummaries).mock.calls[0][0]!;
    expect(new Date(range.to!).getTime() - new Date(range.from!).getTime()).toBe(60 * 60 * 1000);
  });

  it('keeps the uptime column visible without exposing analytics to a model-group viewer', async () => {
    window.history.replaceState({}, '', '/groups');
    vi.mocked(api.listGroups).mockResolvedValue([modelGroupFixture()]);
    mockWorkspace(['model_groups:read']);

    renderApp();

    const row = await screen.findByRole('row', { name: /chat/ });
    expect(within(row).getByText('无查看权限')).toBeInTheDocument();
    expect(api.getModelGroupUptimeSummaries).not.toHaveBeenCalled();
  });

  it('filters model groups by text, image, video, or all kinds', async () => {
    const user = userEvent.setup();
    const textGroup = modelGroupFixture();
    const imageGroup: ModelGroup = {
      ...textGroup,
      id: 4,
      name: 'image-generation',
      kind: 'image',
      inboundProtocolContracts: ['openai.images.generations/2026-07-19'],
      mappings: []
    };
    const videoGroup: ModelGroup = {
      ...textGroup,
      id: 5,
      name: 'video-generation',
      kind: 'video',
      inboundProtocolContracts: [],
      mappings: []
    };
    window.history.replaceState({}, '', '/groups');
    vi.mocked(api.listGroups).mockResolvedValue([textGroup, imageGroup, videoGroup]);
    mockWorkspace(['model_groups:read']);

    renderApp();

    await screen.findByRole('button', { name: 'chat' });
    const kindFilter = screen.getByRole('group', { name: '模型组类型' });
    expect(within(kindFilter).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'image-generation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'video-generation' })).toBeInTheDocument();

    await user.click(within(kindFilter).getByRole('button', { name: '文本' }));
    expect(screen.getByRole('button', { name: 'chat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'image-generation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'video-generation' })).not.toBeInTheDocument();

    await user.click(within(kindFilter).getByRole('button', { name: '图片' }));
    expect(screen.getByRole('button', { name: 'image-generation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'chat' })).not.toBeInTheDocument();

    await user.click(within(kindFilter).getByRole('button', { name: '视频' }));
    expect(screen.getByRole('button', { name: 'video-generation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'image-generation' })).not.toBeInTheDocument();

    await user.click(within(kindFilter).getByRole('button', { name: '全部' }));
    expect(screen.getByRole('button', { name: 'chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'image-generation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'video-generation' })).toBeInTheDocument();
  });

  it('loads a model group detail URL directly with the dedicated group and analytics contracts', async () => {
    const detailGroup: ModelGroup = {
      id: 3, workspaceId: 1, name: 'chat', description: 'Primary route', kind: 'text', status: 'normal',
      firstResponseTimeoutSeconds: null, effectiveFirstResponseTimeoutSeconds: 180, routingMode: 'tiered_failover', sidecarConfigMode: 'full',
      inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
      mappings: [{ id: 41, groupId: 3, endpointId: 101, modelId: 'gpt-5', tier: 0, weight: 100, sortOrder: 0 }],
      endpointTotal: 1, endpointAvailable: 1, createdAt: '', updatedAt: ''
    };
    window.history.replaceState({}, '', '/groups/3');
    vi.mocked(api.getGroup).mockResolvedValue(detailGroup);
    mockWorkspace(['model_groups:read', 'analytics:read', 'endpoints:read']);

    renderApp();

    expect(await screen.findByRole('heading', { name: 'chat' })).toBeInTheDocument();
    expect(api.getGroup).toHaveBeenCalledWith(3);
    expect(api.listGroups).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalledWith(expect.objectContaining({ groupId: 3, bucket: '1m' })));
  });

  it('links exposed image protocols with compatible endpoint choices in both directions', async () => {
    const user = userEvent.setup();
    const generationEndpoint: Endpoint = {
      ...endpoints[0],
      id: 103,
      name: 'Generation Image',
      kind: 'image',
      driverRef: 'builtin://openai-image-compatible@1',
      models: [{
        ...endpoints[0].models[0],
        id: 'gpt-image-generation',
        textFeatures: [],
        imageProtocolContracts: ['openai.images.generations/2026-07-19']
      }],
      modelGroupNames: []
    };
    const universalEndpoint: Endpoint = {
      ...generationEndpoint,
      id: 104,
      name: 'Universal Image',
      driverRef: 'builtin://universal-image@1',
      models: [{
        ...generationEndpoint.models[0],
        id: 'gpt-image-universal',
        imageProtocolContracts: [
          'openai.images.generations/2026-07-19',
          'openai.images.edits/2026-07-19'
        ]
      }]
    };
    const universalDriver = driverFixture('image', 'builtin://universal-image@1', 'Universal Image');
    if (universalDriver.manifest.image) {
      universalDriver.manifest.image.protocolContracts = [
        'openai.images.generations/2026-07-19',
        'openai.images.edits/2026-07-19'
      ];
    }
    window.history.replaceState({}, '', '/groups');
    vi.mocked(api.listEndpoints).mockResolvedValue([generationEndpoint, universalEndpoint]);
    vi.mocked(api.listDrivers).mockResolvedValue([drivers[1], universalDriver]);
    mockWorkspace(['model_groups:read', 'model_groups:write', 'endpoints:read', 'endpoint_drivers:read']);
    renderApp();

    await user.click(await screen.findByRole('button', { name: '添加模型组' }));
    const dialog = screen.getByRole('dialog', { name: '添加模型组' });
    await user.click(within(dialog).getByRole('button', { name: '类型' }));
    await user.click(screen.getByRole('option', { name: '图片' }));
    expect(within(dialog).getByText('留空默认 300 秒，最高 1800 秒')).toBeInTheDocument();
    const endpointSelect = within(dialog).getByRole('button', { name: '接入点' });

    await user.click(endpointSelect);
    expect(screen.getByRole('option', { name: 'Universal Image' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Generation Image' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(within(dialog).getByLabelText('OpenAI Image Edit'));
    await user.click(endpointSelect);
    expect(screen.getByRole('option', { name: 'Universal Image' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Generation Image' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Generation Image' }));

    expect(within(dialog).getByLabelText('OpenAI Image Generation')).not.toBeDisabled();
    expect(within(dialog).getByLabelText('OpenAI Image Edit')).toBeDisabled();
  });

  it('confirms deletion of an empty endpoint group with its name emphasized', async () => {
    const user = userEvent.setup();
    const emptyGroup: EndpointGroup = {
      id: 22,
      workspaceId: 1,
      name: 'Future Media',
      remark: '',
      sortOrder: 1,
      endpointCount: 0,
      createdAt: '2026-07-16T00:00:00Z',
      updatedAt: '2026-07-16T00:00:00Z'
    };
    vi.mocked(api.listEndpointGroups).mockResolvedValue([...endpointGroups, emptyGroup]);
    mockWorkspace(['endpoints:read', 'endpoints:write']);
    renderApp();

    await screen.findByRole('button', { name: 'Future Media 更多操作' });
    await user.click(screen.getByRole('button', { name: 'Future Media 更多操作' }));
    await user.click(within(screen.getByRole('menu', { name: 'Future Media 更多操作' })).getByRole('menuitem', { name: '删除' }));

    const dialog = screen.getByRole('dialog', { name: '删除' });
    const message = within(dialog).getByText((_, element) => element?.classList.contains('delete-confirm-message') ?? false);
    expect(message).toHaveTextContent('是否要删除接入点组Future Media？');
    expect(within(message).getByText('Future Media')).toHaveProperty('tagName', 'STRONG');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.deleteEndpointGroup).toHaveBeenCalledWith(22));
  });

  it('lets viewers open endpoint details without rendering write actions', async () => {
    const user = userEvent.setup();
    mockWorkspace(['endpoints:read', 'endpoint_drivers:read']);
    renderApp();

    await screen.findByRole('button', { name: '查看 OpenAI Text' });
    expect(screen.queryByRole('button', { name: '创建接入点组' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /中创建接入点/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看 OpenAI Text' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'OpenAI Text' })).toBeInTheDocument();
    expect(within(dialog).getByText('https://api.openai.com/v1')).toBeInTheDocument();
    expect(within(dialog).getByText('api_key: 已配置')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('deletes an endpoint from detail with an explicit mapping cascade warning', async () => {
    const user = userEvent.setup();
    mockWorkspace(['endpoints:read', 'endpoints:write', 'endpoint_drivers:read']);
    renderApp();

    await user.click(await screen.findByRole('button', { name: '查看 OpenAI Text' }));
    const detail = screen.getByRole('dialog', { name: 'OpenAI Text' });
    const deleteButton = within(detail).getByRole('button', { name: '删除' });
    expect(deleteButton).toHaveClass('danger');
    await user.click(deleteButton);

    const confirmation = screen.getByRole('dialog', { name: '删除' });
    expect(within(confirmation).getByText((_, element) => element?.classList.contains('delete-confirm-message') ?? false))
      .toHaveTextContent('删除接入点「OpenAI Text」后，所有模型组中引用该接入点的映射也会一并删除。此操作不可恢复。');
    await user.type(within(confirmation).getByRole('textbox'), '确认删除');
    await user.click(within(confirmation).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(api.deleteEndpoint).toHaveBeenCalledWith(101));
  });

  it('uses endpoint driver permissions for the driver page', async () => {
    window.history.replaceState({}, '', '/drivers');
    mockWorkspace(['endpoint_drivers:read']);
    renderApp();

    await screen.findByRole('heading', { name: '驱动' });
    expect(api.listDrivers).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /上传 WASM 驱动/ })).not.toBeInTheDocument();
  });

  it('filters built-in and WASM drivers by the same kind categories', async () => {
    const user = userEvent.setup();
    const builtins = [
      driverFixture('text', 'builtin://text@1', 'Built-in Text'),
      driverFixture('image', 'builtin://image@1', 'Built-in Image'),
      driverFixture('video', 'builtin://video@1', 'Built-in Video')
    ];
    const profileDrivers = [
      driverFixture('text', 'profile://text@1', 'Workspace Text', 'profile'),
      driverFixture('image', 'profile://image@1', 'Workspace Image', 'profile'),
      driverFixture('video', 'profile://video@1', 'Workspace Video', 'profile')
    ];
    const profiles: DriverProfile[] = profileDrivers.map((driver, index) => ({
      id: index + 1,
      ref: driver.ref,
      name: driver.manifest.displayName,
      artifactDigest: `sha256:${index + 1}`,
      artifactSizeBytes: 1024,
      manifest: driver.manifest,
      usedByEndpoints: 0,
      createdAt: '2026-07-16T00:00:00Z',
      uploadedBy: { userId: 7, displayName: 'Alice Operator' }
    }));

    window.history.replaceState({}, '', '/drivers');
    mockWorkspace(['endpoint_drivers:read']);
    vi.mocked(api.listDrivers).mockResolvedValue([...builtins, ...profileDrivers]);
    vi.mocked(api.listDriverProfiles).mockResolvedValue(profiles);
    renderApp();

    await screen.findByRole('button', { name: 'Built-in Text' });
    const kindFilter = screen.getByRole('group', { name: '驱动类型' });
    expect(within(kindFilter).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(kindFilter).getByRole('button', { name: '图片' }));
    expect(screen.getByRole('button', { name: 'Built-in Image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Built-in Text' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Built-in Video' })).not.toBeInTheDocument();

    const sourceFilter = screen.getByRole('group', { name: '驱动来源' });
    await user.click(within(sourceFilter).getByRole('button', { name: 'WASM 驱动' }));
    expect(await screen.findByRole('button', { name: 'Workspace Image' })).toBeInTheDocument();
    expect(screen.getByText('Alice Operator')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workspace Text' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workspace Video' })).not.toBeInTheDocument();

    await user.click(within(kindFilter).getByRole('button', { name: '视频' }));
    expect(screen.getByRole('button', { name: 'Workspace Video' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workspace Image' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Workspace Video' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('上传人')).toBeInTheDocument();
    expect(within(dialog).getByText('Alice Operator')).toBeInTheDocument();
  });

  it('does not load endpoint data without endpoint read or write access', async () => {
    mockWorkspace(['analytics:read']);
    renderApp();

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(api.listEndpoints).not.toHaveBeenCalled();
    expect(api.listEndpointGroups).not.toHaveBeenCalled();
  });

  it('loads origin requests for Overview without reusing attempt activity state', async () => {
    window.history.replaceState({}, '', '/');
    mockWorkspace(['analytics:read']);

    renderApp();

    await screen.findByRole('heading', { name: '系统概览' });
    await waitFor(() => expect(api.listInvocationRequests).toHaveBeenCalledWith(expect.objectContaining({ role: 'origin', limit: 8 })));
    expect(api.listInvocationAttempts).not.toHaveBeenCalled();
  });

  it('applies a second-precision time range to Overview analytics', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/');
    mockWorkspace(['analytics:read']);
    renderApp();

    await screen.findByRole('heading', { name: '系统概览' });
    await user.click(screen.getByRole('button', { name: '最近 15 分钟' }));

    const fromInput = screen.getByLabelText('开始时间');
    const toInput = screen.getByLabelText('结束时间');
    expect(fromInput).toHaveAttribute('step', '1');
    expect(toInput).toHaveAttribute('step', '1');

    const from = '2026-07-24T10:20:30';
    const to = '2026-07-24T11:21:31';
    fireEvent.change(fromInput, { target: { value: from } });
    fireEvent.change(toInput, { target: { value: to } });
    vi.mocked(api.getAnalyticsSummary).mockClear();
    vi.mocked(api.listInvocationRequests).mockClear();
    await user.click(screen.getByRole('button', { name: '应用时间范围' }));

    const expectedRange = {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString()
    };
    await waitFor(() => expect(api.getAnalyticsSummary).toHaveBeenCalledWith(expectedRange));
    expect(api.listInvocationRequests).toHaveBeenCalledWith({
      ...expectedRange,
      limit: 8,
      role: 'origin'
    });
    expect(screen.getByRole('button', { name: /2026-07-24 10:20:30/ })).toHaveTextContent('2026-07-24 11:21:31');
  });

  it('filters Activity on the server without filtering Summary or Endpoint insights', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/analytics');
    mockWorkspace(['analytics:read', 'endpoints:read']);
    vi.mocked(api.listInvocationAttempts).mockImplementation(async (params = {}) => ({
      items: params.outcome
        ? [invocationFixture({
            eventId: 'attempt-2',
            endpointName: 'Filtered failure',
            outcome: 'upstream_error',
            available: false,
            responseStatusCode: 502
          })]
        : [invocationFixture({ endpointName: 'Unfiltered success' })],
      nextCursor: null
    }));
    renderApp();

    await screen.findByText('100%');
    await user.click(screen.getByRole('button', { name: '调用记录' }));
    await screen.findByRole('button', { name: '调用结果' });
    const callsBeforeFilter = vi.mocked(api.listInvocationAttempts).mock.calls.length;
    await user.click(screen.getByRole('button', { name: '调用结果' }));
    await user.click(screen.getByRole('option', { name: '上游错误' }));

    await screen.findByText('Filtered failure');
    expect(screen.queryByText('Unfiltered success')).not.toBeInTheDocument();
    const filterRefreshCalls = vi.mocked(api.listInvocationAttempts).mock.calls.slice(callsBeforeFilter);
    expect(filterRefreshCalls.some(([params]) => params?.outcome === 'upstream_error')).toBe(true);
    expect(filterRefreshCalls.some(([params]) => !params?.outcome)).toBe(true);
    for (const [params] of vi.mocked(api.getAnalyticsSummary).mock.calls) {
      expect(params).not.toHaveProperty('outcome');
    }

    const analyticsTabs = document.querySelector('.tabs');
    expect(analyticsTabs).not.toBeNull();
    await user.click(within(analyticsTabs as HTMLElement).getByRole('button', { name: '接入点' }));
    const insightRow = screen.getByText('OpenAI Text').closest('tr');
    expect(within(insightRow as HTMLTableRowElement).getByText('100%')).toBeInTheDocument();
  });
});

function mockWorkspace(capabilities: WorkspaceAccess['capabilities']) {
  vi.mocked(api.listMyWorkspaces).mockResolvedValue([{
    id: 1,
    slug: 'workspace-alpha',
    name: 'Workspace Alpha',
    status: 'active',
    role: capabilities.includes('endpoints:write') ? 'admin' : 'viewer',
    platformAdmin: false,
    capabilities,
    createdAt: '2026-07-16T00:00:00Z',
    updatedAt: '2026-07-16T00:00:00Z'
  }]);
}

function renderApp() {
  return render(
    <App
      currentAdmin={{ userId: 1, email: 'admin@example.com', displayName: 'Admin', platformAdmin: false }}
      authConfig={{ mode: 'disabled', entry: 'bypass', defaultMethod: '', methods: [] }}
      onLogout={vi.fn()}
    />
  );
}

function invocationFixture(overrides: Partial<InvocationAttempt> = {}): InvocationAttempt {
  return {
    eventId: 'attempt-1',
    rootRequestId: 'root-1',
    requestId: 'request-1',
    workspaceId: 1,
    apiKeyId: 2,
    startedAt: '2026-07-16T04:00:00Z',
    durationMs: 100,
    groupId: 3,
    groupName: 'chat',
    endpointId: 101,
    endpointName: 'OpenAI Text',
    kind: 'text',
    invocation: { protocol: 'openai', operation: 'responses' },
    mode: 'sse',
    requestPath: '/v1/responses',
    executionLocation: 'central',
    originSidecarTokenId: null,
    originSidecarInstanceId: null,
    originSnapshotRevision: null,
    upstreamModelId: 'gpt-5',
    upstreamStatusCode: 200,
    responseStatusCode: 200,
    outcome: 'success',
    available: true,
    retryable: false,
    final: true,
    routingMode: 'tiered_failover',
    routingTier: 0,
    mappingWeight: 100,
    attemptIndex: 1,
    failoverReason: null,
    breakerState: 'closed',
    breakerKey: 'workspace:1:endpoint:101',
    streamStatus: 'completed',
    responseCommitted: true,
    timeToFirstEventMs: 10,
    timeToFirstOutputMs: 20,
    upstreamBytes: 100,
    downstreamBytes: 100,
    streamEventCount: 2,
    terminationReason: null,
    usageStatus: 'final',
    inputTokens: 10,
    outputTokens: 5,
    cachedTokens: 0,
    reasoningTokens: 0,
    tokensPerSecond: 50,
    endpointCostNanoUSD: '1000000',
    usageProvenance: 'upstream_reported',
    usageErrorCode: null,
    driverRef: 'builtin://openai-chat-compatible@1',
    driverRuntimeKind: 'builtin',
    errorCode: null,
    ...overrides
  };
}

function analyticsSummaryFixture(): InvocationAnalyticsSummary {
  const outcomes = {
    success: 1,
    clientError: 0,
    authError: 0,
    routingError: 0,
    capacityError: 0,
    upstreamError: 0,
    timeout: 0,
    canceled: 0,
    internalError: 0
  };
  return {
    window: { from: '2026-07-17T00:00:00Z', to: '2026-07-17T01:00:00Z' },
    requests: { count: 1, successfulCount: 1, failedCount: 0, outcomes, averageDurationMs: 100 },
    attempts: {
      count: 1,
      successfulCount: 1,
      failedCount: 0,
      outcomes,
      availableCount: 1,
      unavailableCount: 0,
      retryableCount: 0,
      retriedCount: 0,
      finalCount: 1,
      committedCount: 1,
      usage: {
        knownInputTokens: 10,
        knownOutputTokens: 5,
        knownCachedTokens: 0,
        knownReasoningTokens: 0,
        finalAttemptCount: 1,
        partialAttemptCount: 0,
        unavailableAttemptCount: 0
      },
      cost: { knownEndpointCostNanoUSD: '1000000', knownAttemptCount: 1, unknownAttemptCount: 0 },
      averageDurationMs: 100,
      averageTimeToFirstEventMs: 10,
      averageTimeToFirstOutputMs: 20
    },
    completeness: {
      complete: true,
      coverageStartedAt: '2026-07-17T00:00:00Z',
      coveredThrough: '2026-07-17T01:00:00Z',
      expectedSourceCount: 1,
      reportingSourceCount: 1,
      completeSourceCount: 1,
      missingCurrentSessionSourceCount: 0,
      inactiveSourceCount: 0,
      staleSourceCount: 0,
      coverageGapSourceCount: 0,
      watermarkMissingSourceCount: 0,
      pendingQueueSourceCount: 0,
      pendingInFlightSourceCount: 0,
      knownLossSourceCount: 0,
      unknownLossSourceCount: 0,
      saturatedSourceCount: 0,
      knownDroppedEventCount: 0,
      dropCounterSaturated: false,
      knownDroppedEventCountSaturated: false,
      sources: []
    }
  };
}

function modelGroupStatisticsFixture(): ModelGroupMappingStatistics {
  return {
    window: { from: '2026-07-26T00:00:00Z', to: '2026-07-26T01:00:00Z', bucketSeconds: 60 },
    group: {
      availableAttemptCount: 1,
      attemptCount: 1,
      uptimePercentage: 100,
      historicalOnlyAttemptCount: 0,
      buckets: [{ from: '2026-07-26T00:00:00Z', to: '2026-07-26T00:01:00Z', availableAttemptCount: 1, attemptCount: 1, uptimePercentage: 100 }]
    },
    mappings: [{
      endpointId: 101, upstreamModelId: 'gpt-5', availableAttemptCount: 1, attemptCount: 1, uptimePercentage: 100,
      p50TimeToFirstOutputMs: 20, timeToFirstOutputSampleCount: 1, p50TokensPerSecond: 50, tokensPerSecondSampleCount: 1,
      buckets: [{ from: '2026-07-26T00:00:00Z', to: '2026-07-26T00:01:00Z', availableAttemptCount: 1, attemptCount: 1, uptimePercentage: 100 }]
    }],
    completeness: analyticsSummaryFixture().completeness
  };
}

function modelGroupFixture(): ModelGroup {
  return {
    id: 3,
    workspaceId: 1,
    name: 'chat',
    description: 'Primary route',
    kind: 'text',
    status: 'normal',
    firstResponseTimeoutSeconds: null,
    effectiveFirstResponseTimeoutSeconds: 180,
    routingMode: 'tiered_failover',
    sidecarConfigMode: 'full',
    inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
    mappings: [{ id: 41, groupId: 3, endpointId: 101, modelId: 'gpt-5', tier: 0, weight: 100, sortOrder: 0 }],
    endpointTotal: 1,
    endpointAvailable: 1,
    createdAt: '',
    updatedAt: ''
  };
}

function modelGroupUptimeFixture(): ModelGroupUptimeSummaryList {
  return {
    window: { from: '2026-07-26T00:00:00Z', to: '2026-07-26T01:00:00Z' },
    items: [{ groupId: 3, availableAttemptCount: 3, attemptCount: 4, uptimePercentage: 75 }],
    completeness: analyticsSummaryFixture().completeness
  };
}

function driverFixture(kind: ModelKind, ref: string, displayName: string, source: DriverCatalogItem['source'] = 'builtin'): DriverCatalogItem {
  return {
    ref,
    source,
    runtimeKind: source === 'profile' ? 'wasm' : 'builtin',
    manifest: {
      id: displayName.toLowerCase().replace(/ /g, '-'),
      displayName,
      version: '1',
      kind,
      text: kind === 'text' ? {
        protocolContracts: ['openai.chat_completions/2026-07-18']
      } : undefined,
      image: kind === 'image' ? {
        protocolContracts: ['openai.images.generations/2026-07-19']
      } : undefined,
      managementCapabilities: ['models.list'],
      configSchemaJson: '{"type":"object"}',
      credentialSchema: { slots: [{ name: 'api_key', required: true }] },
      requestedCapabilities: []
    }
  };
}
