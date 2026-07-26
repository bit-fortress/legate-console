// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelGroupDetailPage from './ModelGroupDetailPage';
import { createTranslator } from './i18n';
import * as api from './api';
import type { Endpoint, EndpointGroup, ModelGroup, ModelGroupMappingStatistics } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, getModelGroupMappingStatistics: vi.fn() };
});

const t = createTranslator('zh');

describe('ModelGroupDetailPage', () => {
  beforeEach(() => {
    vi.mocked(api.getModelGroupMappingStatistics).mockResolvedValue(statistics());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('defaults to the last hour and renders null measurements as no samples', async () => {
    renderPage();

    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalledTimes(1));
    const params = vi.mocked(api.getModelGroupMappingStatistics).mock.calls[0][0];
    expect(params.bucket).toBe('1m');
    expect(new Date(params.to).getTime() - new Date(params.from).getTime()).toBe(60 * 60 * 1000);
    expect(screen.getByRole('button', { name: '1 小时' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('暂无样本').length).toBeGreaterThan(1);
  });

  it('does not request analytics without permission', async () => {
    renderPage({ canReadAnalytics: false, canReadEndpoints: false, endpoints: [] });

    expect(await screen.findByText('无 Analytics 查看权限，运行指标已隐藏。')).toBeInTheDocument();
    expect(api.getModelGroupMappingStatistics).not.toHaveBeenCalled();
    expect(screen.getAllByText('无查看权限').length).toBeGreaterThan(2);
    expect(screen.queryByText('0 / 1')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByText('暂无样本')).not.toBeInTheDocument();
  });

  it('clears completeness and historical notices after analytics permission is removed', async () => {
    const incomplete = statistics();
    incomplete.group.historicalOnlyAttemptCount = 2;
    incomplete.completeness.complete = false;
    vi.mocked(api.getModelGroupMappingStatistics).mockResolvedValue(incomplete);
    const view = renderPage();

    expect(await screen.findByText('当前遥测数据可能不完整，以下指标仅代表已观测数据。')).toBeInTheDocument();
    expect(screen.getByText('2 次调用来自当前配置中已不存在的映射。')).toBeInTheDocument();

    view.rerender(detailPage({ canReadAnalytics: false }));
    expect(await screen.findByText('无 Analytics 查看权限，运行指标已隐藏。')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('当前遥测数据可能不完整，以下指标仅代表已观测数据。')).not.toBeInTheDocument();
      expect(screen.queryByText('2 次调用来自当前配置中已不存在的映射。')).not.toBeInTheDocument();
    });
  });

  it('clears previous window statistics when the next window fails', async () => {
    const sampled = statistics();
    sampled.group = {
      availableAttemptCount: 1,
      attemptCount: 1,
      uptimePercentage: 100,
      historicalOnlyAttemptCount: 0,
      buckets: sampled.group.buckets
    };
    sampled.mappings[0] = { ...sampled.mappings[0], availableAttemptCount: 1, attemptCount: 1, uptimePercentage: 100 };
    vi.mocked(api.getModelGroupMappingStatistics).mockResolvedValueOnce(sampled).mockRejectedValueOnce(new Error('failed'));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findAllByText('100%')).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '24 小时' }));

    expect(await screen.findByText('运行统计加载失败，请重试。')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.getAllByText('统计不可用').length).toBeGreaterThan(2);
  });

  it('opens a clicked endpoint in the current-page drawer without opening the full endpoint view', async () => {
    const user = userEvent.setup();
    const onViewEndpoint = vi.fn();
    renderPage({ onViewEndpoint });
    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalled());

    await user.click(screen.getByRole('row', { name: /OpenAI Text/ }));
    expect(screen.getByRole('complementary', { name: 'OpenAI Text' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenAI Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看完整 Endpoint 配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭 Endpoint 详情' })).toBeInTheDocument();
    expect(screen.getByText('Endpoint Uptime')).toBeInTheDocument();
    expect(onViewEndpoint).not.toHaveBeenCalled();
  });

  it('links readonly routing selection to the same endpoint drawer', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '路由配置' }));
    await user.click(screen.getByRole('button', { name: '模型 gpt-5' }));

    expect(screen.getByRole('complementary', { name: 'OpenAI Text' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加模型' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider/)).not.toBeInTheDocument();
  });

  it('renders model group uptime instead of endpoint rows in the uptime view', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Uptime' }));

    expect(screen.getByRole('heading', { name: '模型组 Uptime' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '模型组 Uptime 趋势' })).toBeInTheDocument();
    expect(document.querySelector('.group-uptime-empty-line')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI Text')).not.toBeInTheDocument();
  });

  it('keeps every backend uptime bucket in the endpoint table', async () => {
    const sampled = statistics();
    sampled.mappings[0].buckets = Array.from({ length: 60 }, (_, index) => ({
      from: new Date(Date.UTC(2026, 6, 26, 0, index)).toISOString(),
      to: new Date(Date.UTC(2026, 6, 26, 0, index + 1)).toISOString(),
      availableAttemptCount: 0,
      attemptCount: 0,
      uptimePercentage: null
    }));
    vi.mocked(api.getModelGroupMappingStatistics).mockResolvedValue(sampled);

    renderPage();

    await waitFor(() => expect(document.querySelectorAll('.group-endpoint-table .mapping-uptime-buckets span')).toHaveLength(60));
  });

  it('plots sampled group uptime buckets in the independent uptime view', async () => {
    const sampled = statistics();
    sampled.group.uptimePercentage = 98;
    sampled.group.attemptCount = 2;
    sampled.group.availableAttemptCount = 1;
    sampled.group.buckets = [
      { from: '2026-07-26T00:00:00Z', to: '2026-07-26T00:01:00Z', availableAttemptCount: 1, attemptCount: 1, uptimePercentage: 100 },
      { from: '2026-07-26T00:01:00Z', to: '2026-07-26T00:02:00Z', availableAttemptCount: 0, attemptCount: 1, uptimePercentage: 0 }
    ];
    vi.mocked(api.getModelGroupMappingStatistics).mockResolvedValue(sampled);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Uptime' }));

    expect(document.querySelector('.group-uptime-chart-line')).toBeInTheDocument();
    expect(document.querySelector('.group-uptime-empty-line')).not.toBeInTheDocument();
  });

  it('switches all supported time windows with their fixed buckets', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(api.getModelGroupMappingStatistics).toHaveBeenCalledTimes(1));

    for (const [label, bucket] of [['24 小时', '30m'], ['7 天', '3h'], ['30 天', '12h']] as const) {
      await user.click(screen.getByRole('button', { name: label }));
      await waitFor(() => {
        const calls = vi.mocked(api.getModelGroupMappingStatistics).mock.calls;
        expect(calls[calls.length - 1]?.[0].bucket).toBe(bucket);
      });
    }
  });
});

function renderPage(overrides: Partial<React.ComponentProps<typeof ModelGroupDetailPage>> = {}) {
  return render(detailPage(overrides));
}

function detailPage(overrides: Partial<React.ComponentProps<typeof ModelGroupDetailPage>> = {}) {
  return (
    <ModelGroupDetailPage
      group={group}
      loading={false}
      staticError=""
      endpoints={[endpoint]}
      endpointGroups={[endpointGroup]}
      workspaceSlug="workspace-alpha"
      canReadAnalytics
      canReadEndpoints
      canWriteGroups
      t={t}
      onBack={vi.fn()}
      onRetry={vi.fn()}
      onEdit={vi.fn()}
      onViewEndpoint={vi.fn()}
      {...overrides}
    />
  );
}

const endpointGroup: EndpointGroup = {
  id: 11, workspaceId: 1, name: 'Production', remark: '', sortOrder: 0, endpointCount: 1, createdAt: '', updatedAt: ''
};

const endpoint: Endpoint = {
  id: 101, workspaceId: 1, groupId: 11, name: 'OpenAI Text', remark: '', kind: 'text', status: 'enabled', scheduleEnabled: true,
  driverRef: 'builtin://openai-chat-compatible@1', driverConfig: {}, baseUrl: 'https://api.example/v1', credentialSlots: [],
  models: [{ id: 'gpt-5', textFeatures: [], imageProtocolContracts: [], imageProtocolLimits: [], inputPricePerMillion: '1', outputPricePerMillion: '2', cachePricePerMillion: '0' }],
  modelGroupNames: ['chat'], uptime: { available: 0, total: 0, percentage: 100 }, lastUsedAt: null, createdAt: '', updatedAt: ''
};

const group: ModelGroup = {
  id: 3, workspaceId: 1, name: 'chat', description: 'Primary route', kind: 'text', status: 'normal', firstResponseTimeoutSeconds: null,
  effectiveFirstResponseTimeoutSeconds: 180, routingMode: 'tiered_failover', sidecarConfigMode: 'full',
  inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
  mappings: [{ id: 41, groupId: 3, endpointId: 101, modelId: 'gpt-5', tier: 0, weight: 100, sortOrder: 0 }],
  endpointTotal: 1, endpointAvailable: 1, createdAt: '', updatedAt: '2026-07-26T00:00:00Z'
};

function statistics(): ModelGroupMappingStatistics {
  return {
    window: { from: '2026-07-26T00:00:00Z', to: '2026-07-26T01:00:00Z', bucketSeconds: 60 },
    group: {
      availableAttemptCount: 0,
      attemptCount: 0,
      uptimePercentage: null,
      historicalOnlyAttemptCount: 0,
      buckets: [{ from: '2026-07-26T00:00:00Z', to: '2026-07-26T00:01:00Z', availableAttemptCount: 0, attemptCount: 0, uptimePercentage: null }]
    },
    mappings: [{
      endpointId: 101, upstreamModelId: 'gpt-5', availableAttemptCount: 0, attemptCount: 0, uptimePercentage: null,
      p50TimeToFirstOutputMs: null, timeToFirstOutputSampleCount: 0, p50TokensPerSecond: null, tokensPerSecondSampleCount: 0,
      buckets: [{ from: '2026-07-26T00:00:00Z', to: '2026-07-26T00:01:00Z', availableAttemptCount: 0, attemptCount: 0, uptimePercentage: null }]
    }],
    completeness: {
      complete: true, coverageStartedAt: null, coveredThrough: null, expectedSourceCount: 0, reportingSourceCount: 0, completeSourceCount: 0,
      missingCurrentSessionSourceCount: 0, inactiveSourceCount: 0, staleSourceCount: 0, coverageGapSourceCount: 0, watermarkMissingSourceCount: 0,
      pendingQueueSourceCount: 0, pendingInFlightSourceCount: 0, knownLossSourceCount: 0, unknownLossSourceCount: 0, saturatedSourceCount: 0,
      knownDroppedEventCount: 0, dropCounterSaturated: false, knownDroppedEventCountSaturated: false, sources: []
    }
  };
}
