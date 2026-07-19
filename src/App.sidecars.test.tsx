// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createSidecarToken, getSidecarInstance, getSidecarSnapshot, listMyWorkspaces, listSidecarInstances, listSidecarTokens } from './api';

vi.mock('./api', () => {
  const emptyList = vi.fn(async () => []);
  return {
    LegateAPIError: class LegateAPIError extends Error {},
    addWorkspaceMember: vi.fn(),
    createAPIKey: vi.fn(),
    createGroup: vi.fn(),
    createEndpoint: vi.fn(),
    createEndpointGroup: vi.fn(),
    createSidecarToken: vi.fn(),
    createWorkspace: vi.fn(),
    deleteAPIKey: vi.fn(),
    deleteGroup: vi.fn(),
    deleteEndpoint: vi.fn(),
    deleteEndpointGroup: vi.fn(),
    deleteDriverProfile: vi.fn(),
    deleteSidecarToken: vi.fn(),
    deleteWorkspaceMember: vi.fn(),
    getAnalyticsSummary: vi.fn(async () => ({
      window: { from: '', to: '' },
      requests: {
        count: 0,
        successfulCount: 0,
        failedCount: 0,
        outcomes: { success: 0, clientError: 0, authError: 0, routingError: 0, capacityError: 0, upstreamError: 0, timeout: 0, canceled: 0, internalError: 0 },
        averageDurationMs: null
      },
      attempts: {
        count: 0,
        successfulCount: 0,
        failedCount: 0,
        outcomes: { success: 0, clientError: 0, authError: 0, routingError: 0, capacityError: 0, upstreamError: 0, timeout: 0, canceled: 0, internalError: 0 },
        availableCount: 0,
        unavailableCount: 0,
        retryableCount: 0,
        retriedCount: 0,
        finalCount: 0,
        committedCount: 0,
        usage: { knownInputTokens: null, knownOutputTokens: null, knownCachedTokens: null, knownReasoningTokens: null, finalAttemptCount: 0, partialAttemptCount: 0, unavailableAttemptCount: 0 },
        cost: { knownEndpointCostNanoUSD: '0', knownAttemptCount: 0, unknownAttemptCount: 0 },
        averageDurationMs: null,
        averageTimeToFirstEventMs: null,
        averageTimeToFirstOutputMs: null
      },
      completeness: {
        complete: true,
        coverageStartedAt: null,
        coveredThrough: null,
        expectedSourceCount: 0,
        reportingSourceCount: 0,
        completeSourceCount: 0,
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
    })),
    getSidecarSnapshot: vi.fn(),
    getSidecarInstance: vi.fn(),
    getWorkspaceSlug: vi.fn(() => 'alpha'),
    healthz: vi.fn(async () => ({ ok: true })),
    listAPIKeys: emptyList,
    listGroups: emptyList,
    listInvocationAttempts: vi.fn(async () => ({ items: [], nextCursor: null })),
    listInvocationRequests: vi.fn(async () => ({ items: [], nextCursor: null })),
    listMyWorkspaces: vi.fn(async () => [{ id: 1, slug: 'alpha', name: 'Alpha', status: 'active', role: 'admin', platformAdmin: false, capabilities: ['sidecar_tokens:read'] }]),
    listEndpoints: emptyList,
    listEndpointGroups: emptyList,
    listDriverProfiles: emptyList,
    listDrivers: emptyList,
    listSidecarInstances: vi.fn(),
    listSidecarTokens: vi.fn(async () => [{ id: 3, name: 'edge-token', remark: '', status: 'enabled', prefix: 'lsc', suffix: '1234', instanceCount: 1, onlineInstanceCount: 1, offlineInstanceCount: 0, lastSeenAt: '2026-07-11T10:00:00Z', versions: [{ version: 'v0.5.0', instanceCount: 1, onlineInstanceCount: 1 }], createdAt: '', updatedAt: '' }]),
    listWorkspaceMembers: emptyList,
    listWorkspaces: emptyList,
    resolveWorkspaceMember: vi.fn(),
    saveWorkspaceSlug: vi.fn(),
    updateAPIKey: vi.fn(),
    updateGroup: vi.fn(),
    updateEndpoint: vi.fn(),
    updateEndpointGroup: vi.fn(),
    updateEndpointSchedule: vi.fn(),
    moveEndpoint: vi.fn(),
    updateSidecarToken: vi.fn(),
    updateWorkspace: vi.fn(),
    uploadDriverProfile: vi.fn(),
    updateDriverAlias: vi.fn()
  };
});

const instance = {
  id: 9,
  tokenId: 3,
  tokenName: 'edge-token',
  instanceId: 'pod-a-full-id',
  hostname: 'edge-a',
  sidecarVersion: 'v0.5.0',
  syncIntervalSeconds: 30,
  online: true,
  lastSeenAt: '2026-07-11T10:00:00Z',
  lastPullAt: '2026-07-11T09:59:30Z',
  lastPullSuccess: false,
  lastPullError: 'snapshot decode failed',
  appliedSnapshotSchemaVersion: 1,
  appliedSnapshotRevision: 'revision-8',
  createdAt: '2026-07-11T09:00:00Z',
  updatedAt: '2026-07-11T10:00:00Z'
};

const instanceDetail = {
  ...instance,
  telemetry: {
    incarnation: 7,
    sessionId: '0123456789abcdef0123456789abcdef',
    generation: 2,
    sessionStartedAt: '2026-07-11T09:55:00Z',
    lastReportedAt: '2026-07-11T10:00:00Z',
    coveredThrough: '2026-07-11T09:59:59Z',
    queueDepth: 0,
    oldestQueuedAt: null,
    droppedEventCount: 0,
    dropCounterSaturated: false
  }
};

describe('Sidecar page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/sidecars');
    vi.mocked(listSidecarInstances).mockResolvedValue({ items: [instance], total: 1, limit: 50, offset: 0 });
    vi.mocked(getSidecarInstance).mockResolvedValue(instanceDetail);
  });

  afterEach(cleanup);

  it('defaults to instances, opens details, and switches to the Tokens URL', async () => {
    const user = userEvent.setup();
    render(<App currentAdmin={{ userId: 1, email: '', displayName: 'Admin', platformAdmin: false }} authConfig={disabledAuthConfig()} onLogout={vi.fn()} />);

    expect(await screen.findByText('edge-a')).toBeInTheDocument();
    expect(screen.getByText('v0.5.0')).toBeInTheDocument();
    expect(listSidecarInstances).toHaveBeenCalled();

    await user.click(screen.getByText('edge-a'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('snapshot decode failed');
    expect(screen.getByRole('dialog')).toHaveTextContent('Snapshot Schema');
    expect(screen.getByRole('dialog')).toHaveTextContent('1');
    expect(screen.getByRole('dialog')).toHaveTextContent('revision-8');
    expect(screen.getByRole('dialog')).toHaveTextContent('调用遥测');
    expect(screen.getByRole('dialog')).toHaveTextContent('0123456789abcdef0123456789abcdef');
    expect(screen.getByRole('dialog')).toHaveTextContent('进程代 / 会话代');
    expect(screen.getByRole('dialog')).toHaveTextContent('7 / 2');
    expect(screen.getByRole('dialog')).toHaveTextContent('队列积压0');
    expect(screen.getByRole('dialog')).toHaveTextContent('累计丢失事件0');

    await user.click(screen.getByRole('tab', { name: '令牌' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('view')).toBe('tokens'));
    expect(screen.getByText('edge-token')).toBeInTheDocument();
    expect(screen.getByText('1 online / 0 offline')).toBeInTheDocument();
  });

  it('shows inline success feedback after copying a newly created token', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    window.history.replaceState({}, '', '/sidecars?view=tokens');
    vi.mocked(listMyWorkspaces).mockResolvedValueOnce([{
      id: 1,
      slug: 'alpha',
      name: 'Alpha',
      status: 'active',
      role: 'admin',
      platformAdmin: false,
      capabilities: ['sidecar_tokens:read', 'sidecar_tokens:write'],
      createdAt: '',
      updatedAt: ''
    }]);
    vi.mocked(createSidecarToken).mockResolvedValue({
      id: 4,
      name: 'new-edge-token',
      remark: '',
      status: 'enabled',
      prefix: 'sc-leg-new',
      suffix: '5678',
      key: 'sc-leg-new-secret',
      instanceCount: 0,
      onlineInstanceCount: 0,
      offlineInstanceCount: 0,
      lastSeenAt: null,
      versions: [],
      createdAt: '',
      updatedAt: ''
    });

    render(<App currentAdmin={{ userId: 1, email: '', displayName: 'Admin', platformAdmin: false }} authConfig={disabledAuthConfig()} onLogout={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: '添加 Sidecar 令牌' }));
    await user.type(screen.getByLabelText('名称'), 'new-edge-token');
    await user.click(screen.getByRole('button', { name: '保存' }));

    const dialog = await screen.findByRole('dialog', { name: '一次性密钥' });
    expect(screen.queryByRole('button', { name: '应用' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();

    const copyButton = screen.getByRole('button', { name: '复制' });
    await user.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('sc-leg-new-secret'));
    expect(screen.getByRole('button', { name: '已复制' })).toHaveClass('copied');
    expect(dialog).toBeInTheDocument();
  });

  it('shows an unapplied snapshot identity without a legacy fallback', async () => {
    const user = userEvent.setup();
    const legacyInstance = {
      ...instance,
      appliedSnapshotSchemaVersion: 0,
      appliedSnapshotRevision: ''
    };
    vi.mocked(listSidecarInstances).mockResolvedValue({ items: [legacyInstance], total: 1, limit: 50, offset: 0 });
    vi.mocked(getSidecarInstance).mockResolvedValue({ ...legacyInstance, telemetry: null });

    render(<App currentAdmin={{ userId: 1, email: '', displayName: 'Admin', platformAdmin: false }} authConfig={disabledAuthConfig()} onLogout={vi.fn()} />);

    await user.click(await screen.findByText('edge-a'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Snapshot Schema');
    expect(screen.getByRole('dialog')).toHaveTextContent('从未');
    expect(screen.getByRole('dialog')).toHaveTextContent('遥测会话未上报');
  });

  it('keeps loaded instances when refresh finishes resolving sidecar permissions', async () => {
    let resolveSidecarTokens: (tokens: Awaited<ReturnType<typeof listSidecarTokens>>) => void = () => {};
    vi.mocked(listSidecarTokens).mockImplementationOnce(() => new Promise((resolve) => {
      resolveSidecarTokens = resolve;
    }));

    render(<App currentAdmin={{ userId: 2, email: '', displayName: 'Viewer', platformAdmin: false }} authConfig={disabledAuthConfig()} onLogout={vi.fn()} />);

    expect(await screen.findByText('edge-a')).toBeInTheDocument();

    await act(async () => {
      resolveSidecarTokens([{
        id: 3,
        name: 'edge-token',
        remark: '',
        status: 'enabled',
        prefix: 'lsc',
        suffix: '1234',
        instanceCount: 1,
        onlineInstanceCount: 1,
        offlineInstanceCount: 0,
        lastSeenAt: '2026-07-11T10:00:00Z',
        versions: [{ version: 'v0.5.0', instanceCount: 1, onlineInstanceCount: 1 }],
        createdAt: '',
        updatedAt: ''
      }]);
    });

    await waitFor(() => expect(screen.getByLabelText('实例运行汇总')).toHaveTextContent('全部实例1在线1离线0'));
    expect(screen.getByText('edge-a')).toBeInTheDocument();
  });

  it('refreshes runtime totals when entering the instance view', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/sidecars?view=tokens');
    vi.mocked(listSidecarTokens)
      .mockResolvedValueOnce([{ id: 3, name: 'edge-token', remark: '', status: 'enabled', prefix: 'lsc', suffix: '1234', instanceCount: 0, onlineInstanceCount: 0, offlineInstanceCount: 0, lastSeenAt: null, versions: [], createdAt: '', updatedAt: '' }])
      .mockResolvedValue([{ id: 3, name: 'edge-token', remark: '', status: 'enabled', prefix: 'lsc', suffix: '1234', instanceCount: 2, onlineInstanceCount: 1, offlineInstanceCount: 1, lastSeenAt: '2026-07-11T10:00:00Z', versions: [{ version: 'v0.5.0', instanceCount: 2, onlineInstanceCount: 1 }], createdAt: '', updatedAt: '' }]);
    vi.mocked(listSidecarInstances).mockResolvedValue({
      items: [instance, { ...instance, id: 10, instanceId: 'pod-b-full-id', hostname: 'edge-b', online: false }],
      total: 2,
      limit: 50,
      offset: 0
    });

    render(<App currentAdmin={{ userId: 1, email: '', displayName: 'Admin', platformAdmin: false }} authConfig={disabledAuthConfig()} onLogout={vi.fn()} />);

    await user.click(await screen.findByRole('tab', { name: '实例' }));
    expect(await screen.findByText('edge-a')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('实例运行汇总')).toHaveTextContent('全部实例2在线1离线1'));
  });

  it('shows driver profiles plus full and reference group mappings when verifying a token', async () => {
    const user = userEvent.setup();
    vi.mocked(getSidecarSnapshot).mockResolvedValue({
      schemaVersion: 1,
      revision: 'workspace-1-r9',
      profiles: [{
        ref: 'wasm/openai@1.0.0+sha256:abc',
        manifest: { displayName: 'OpenAI WASM', runtimeKind: 'wasm' },
        artifact: { digest: 'sha256:abc', mediaType: 'application/wasm', sizeBytes: 8 }
      }],
      endpoints: [{ id: 1, name: 'local', kind: 'text', status: 'enabled', driverRef: 'wasm/openai@1.0.0+sha256:abc', driverConfig: {}, scheduleEnabled: true, baseUrl: 'https://example.test', credentials: {}, models: [] }],
      groups: [
        { id: 11, name: 'local-chat', sidecarConfigMode: 'full', mappings: [{ endpointId: 1, modelId: 'gpt' }] },
        { id: 12, name: 'central-chat', sidecarConfigMode: 'reference', mappings: [] }
      ],
      apiKeys: []
    });

    render(<App currentAdmin={{ userId: 1, email: '', displayName: 'Admin', platformAdmin: false }} authConfig={disabledAuthConfig()} onLogout={vi.fn()} />);
    await user.click(await screen.findByRole('tab', { name: '令牌' }));
    await user.type(screen.getByLabelText('Sidecar 令牌'), 'sidecar-secret');
    await user.click(screen.getByRole('button', { name: '验证' }));

    const output = await screen.findByText(/workspace-1-r9/);
    expect(output).toHaveTextContent('OpenAI WASM');
    expect(output).toHaveTextContent('local-chat');
    expect(output).toHaveTextContent('"sidecarConfigMode": "full"');
    expect(output).toHaveTextContent('"modelId": "gpt"');
    expect(output).toHaveTextContent('central-chat');
    expect(output).toHaveTextContent('"sidecarConfigMode": "reference"');
    expect(getSidecarSnapshot).toHaveBeenCalledWith('sidecar-secret', 'alpha');
  });
});

function disabledAuthConfig() {
  return { mode: 'disabled' as const, entry: 'bypass' as const, defaultMethod: '', methods: [] };
}
