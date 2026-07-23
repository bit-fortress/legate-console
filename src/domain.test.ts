import { describe, expect, it } from 'vitest';
import {
  addEndpointModel,
  changeEndpointDraftKind,
  endpointInsightRows,
  endpointModelCompatibility,
  endpointModelHasPricing,
  filterDriversByKind,
  hasWorkspaceCapability,
  mergeEndpointModels,
  modelUsageGroups,
  normalizeGroupMappings,
  normalizeUptime,
  removeEndpointModel,
  routingTierLabel,
  sortGroupMappingsByTier,
  updateEndpointModel
} from './domain';
import type { DriverCatalogItem, Endpoint, EndpointModel, InvocationAttempt, ModelGroup } from './types';

describe('endpoint domain helpers', () => {
  it('normalizes routing mappings with endpoint identity', () => {
    expect(normalizeGroupMappings([
      { endpointId: 4, modelId: 'gpt', tier: -1, weight: 0 },
      { endpointId: 5, modelId: 'gpt-backup', tier: 2.8, weight: 20000 }
    ])).toEqual([
      { endpointId: 4, modelId: 'gpt', tier: 0, weight: 100, sortOrder: 1 },
      { endpointId: 5, modelId: 'gpt-backup', tier: 2, weight: 10000, sortOrder: 2 }
    ]);
  });

  it('stably sorts mappings by tier and uses consistent Arabic fallback numbering', () => {
    const tierTwoA = { endpointId: 2, modelId: 'tier-two-a', tier: 2 };
    const tierZero = { endpointId: 1, modelId: 'primary', tier: 0 };
    const tierTwoB = { endpointId: 3, modelId: 'tier-two-b', tier: 2 };

    expect(sortGroupMappingsByTier([tierTwoA, tierZero, tierTwoB])).toEqual([tierZero, tierTwoA, tierTwoB]);
    expect(routingTierLabel(1, 'zh')).toBe('1级备选池');
    expect(routingTierLabel(2, 'zh')).toBe('2级备选池');
  });

  it('honors endpoint capabilities and platform admin access', () => {
    expect(hasWorkspaceCapability({ platformAdmin: false, capabilities: ['endpoints:read'] }, 'endpoints:read')).toBe(true);
    expect(hasWorkspaceCapability({ platformAdmin: false, capabilities: ['endpoints:read'] }, 'endpoints:write')).toBe(false);
    expect(hasWorkspaceCapability({ platformAdmin: true, capabilities: [] }, 'endpoints:write')).toBe(true);
  });

  it('adds, merges, updates, and removes endpoint models', () => {
    const initial = [model('gpt-5')];
    expect(addEndpointModel(initial, '  gpt-5  ', 'text')).toBe(initial);
    const added = addEndpointModel(initial, ' gpt-5-mini ', 'text');
    expect(added[1]).toMatchObject({ id: 'gpt-5-mini', textFeatures: ['text'] });
    expect(mergeEndpointModels(initial, [model('gpt-5'), model('gpt-5-nano')]).map((item) => item.id)).toEqual(['gpt-5', 'gpt-5-nano']);
    const priced = updateEndpointModel(added, 'gpt-5-mini', { inputPricePerMillion: '1.5' });
    expect(endpointModelHasPricing(priced[1])).toBe(true);
    expect(removeEndpointModel(priced, 'gpt-5').map((item) => item.id)).toEqual(['gpt-5-mini']);
  });

  it('strictly filters drivers by manifest kind', () => {
    const catalog = [driver('text', 'text-driver'), driver('image', 'image-driver')];
    expect(filterDriversByKind(catalog, 'text').map((item) => item.ref)).toEqual(['text-driver']);
    expect(filterDriversByKind(catalog, 'image').map((item) => item.ref)).toEqual(['image-driver']);
    expect(filterDriversByKind(catalog, 'video')).toEqual([]);
  });

  it('clears all kind-dependent draft state while preserving Base URL', () => {
    const draft = {
      kind: 'text' as const,
      baseUrl: 'https://upstream.example/v1',
      driverRef: 'text-driver',
      driverConfig: { mode: 'strict' },
      driverConfigText: '{"mode":"strict"}',
      credentials: { api_key: 'secret' },
      models: [model('gpt-5')]
    };
    expect(changeEndpointDraftKind(draft, 'image')).toEqual({
      kind: 'image',
      baseUrl: 'https://upstream.example/v1',
      driverRef: '',
      driverConfig: {},
      driverConfigText: '{}',
      credentials: {},
      models: []
    });
  });

  it('checks text driver protocol compatibility', () => {
    const endpoint = endpointFixture();
    const catalog = [driver('text', endpoint.driverRef)];
    const group = {
      kind: 'text' as const,
      inboundProtocolContracts: ['openai.chat_completions/2026-07-18'] as const
    };
    expect(endpointModelCompatibility(endpoint, endpoint.models[0], group, catalog)).toMatchObject({ compatible: true });
    const unsupported = { ...group, inboundProtocolContracts: ['anthropic.messages/2026-07-18'] as const };
    expect(endpointModelCompatibility(endpoint, endpoint.models[0], unsupported, catalog).reasons).toContain('driver_protocol');
  });

  it('checks image invocation compatibility against both driver and model', () => {
    const endpoint = {
      ...endpointFixture(),
      kind: 'image' as const,
      driverRef: 'image-driver',
      models: [{ ...model('gpt-image-1'), textFeatures: [], imageProtocolContracts: ['openai.images.generations/2026-07-19' as const] }]
    };
    const group = {
      kind: 'image' as const,
      inboundProtocolContracts: ['openai.images.generations/2026-07-19'] as const
    };
    expect(endpointModelCompatibility(endpoint, endpoint.models[0], group, [driver('image', 'image-driver')]).compatible).toBe(true);
  });

  it('finds model groups by endpoint mapping', () => {
    const group = modelGroupFixture();
    expect(modelUsageGroups(101, 'gpt-5', [group])).toEqual(['chat']);
    expect(modelUsageGroups(102, 'gpt-5', [group])).toEqual([]);
  });

  it('builds analytics rows by endpoint identity', () => {
    const endpoint = endpointFixture();
    const records = [invocation(1, true), invocation(2, false)];
    const rows = endpointInsightRows([endpoint], records, 'text');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ endpointId: 101, endpointName: 'OpenAI Text', callCount: 2 });
    expect(rows[0].uptime.percentage).toBe(50);
  });

  it('averages only known analytics values and preserves known zero', () => {
    const endpoint = endpointFixture();
    const unknown = invocation(1, true);
    unknown.tokensPerSecond = null;
    const knownZero = invocation(2, true);
    knownZero.tokensPerSecond = 0;

    const [row] = endpointInsightRows([endpoint], [unknown, knownZero], 'text');
    expect(row.averageTPS).toBe(0);

    knownZero.tokensPerSecond = null;
    const [unknownRow] = endpointInsightRows([endpoint], [unknown, knownZero], 'text');
    expect(unknownRow.averageTPS).toBeNull();
  });

  it('normalizes empty uptime as zero percent', () => {
    expect(normalizeUptime()).toEqual({ available: 0, total: 0, percentage: 0 });
    expect(normalizeUptime({ available: 3, total: 4, percentage: 999 })).toEqual({ available: 3, total: 4, percentage: 75 });
  });
});

function model(id: string): EndpointModel {
  return {
    id,
    textFeatures: ['text', 'function_tools'],
    imageProtocolContracts: [],
    inputPricePerMillion: '0',
    outputPricePerMillion: '0',
    cachePricePerMillion: '0'
  };
}

function driver(kind: 'text' | 'image', ref: string): DriverCatalogItem {
  return {
    ref,
    source: 'builtin',
    runtimeKind: 'builtin',
    manifest: {
      id: ref,
      displayName: ref,
      version: '1',
      kind,
      text: kind === 'text' ? {
        protocolContracts: ['openai.chat_completions/2026-07-18']
      } : undefined,
      image: kind === 'image' ? {
        protocolContracts: ['openai.images.generations/2026-07-19']
      } : undefined,
      managementCapabilities: [],
      configSchemaJson: '{}',
      credentialSchema: { slots: [] },
      requestedCapabilities: []
    }
  };
}

function endpointFixture(): Endpoint {
  return {
    id: 101,
    workspaceId: 1,
    groupId: 11,
    name: 'OpenAI Text',
    remark: '',
    kind: 'text',
    status: 'enabled',
    scheduleEnabled: true,
    driverRef: 'text-driver',
    driverConfig: {},
    baseUrl: 'https://example.test/v1',
    credentialSlots: [],
    models: [model('gpt-5')],
    modelGroupNames: ['chat'],
    uptime: { available: 0, total: 0, percentage: 0 },
    lastUsedAt: null,
    createdAt: '',
    updatedAt: ''
  };
}

function modelGroupFixture(): ModelGroup {
  return {
    id: 3,
    name: 'chat',
    kind: 'text',
    description: '',
    status: 'normal',
    routingMode: 'tiered_failover',
    sidecarConfigMode: 'full',
    inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
    mappings: [{ endpointId: 101, modelId: 'gpt-5' }],
    endpointTotal: 1,
    endpointAvailable: 1,
    uptime: { available: 0, total: 0, percentage: 0 },
    createdAt: '',
    updatedAt: ''
  };
}

function invocation(id: number, available: boolean): InvocationAttempt {
  return {
    eventId: `event-${id}`,
    rootRequestId: 'root-1',
    requestId: 'request-1',
    workspaceId: 1,
    apiKeyId: 2,
    invocation: { protocol: 'openai', operation: 'responses' },
    mode: 'buffered',
    executionLocation: 'central',
    originSidecarTokenId: null,
    originSidecarInstanceId: null,
    originSnapshotRevision: null,
    startedAt: '',
    durationMs: 100,
    groupId: 3,
    groupName: 'chat',
    endpointId: 101,
    endpointName: 'OpenAI Text',
    kind: 'text',
    requestPath: '/v1/responses',
    upstreamModelId: 'gpt-5',
    upstreamStatusCode: available ? 200 : 503,
    responseStatusCode: available ? 200 : null,
    outcome: available ? 'success' : 'upstream_error',
    available,
    retryable: !available,
    final: true,
    routingMode: 'tiered_failover',
    routingTier: 0,
    mappingWeight: 100,
    attemptIndex: 0,
    failoverReason: null,
    breakerState: 'closed',
    breakerKey: null,
    streamStatus: available ? 'completed' : 'failed_before_commit',
    responseCommitted: available,
    timeToFirstEventMs: null,
    timeToFirstOutputMs: available ? 100 : null,
    upstreamBytes: 0,
    downstreamBytes: available ? 0 : null,
    streamEventCount: null,
    terminationReason: available ? null : 'upstream_unavailable',
    usageStatus: 'final',
    inputTokens: 1,
    outputTokens: 1,
    cachedTokens: 0,
    reasoningTokens: 0,
    tokensPerSecond: 10,
    endpointCostNanoUSD: '0',
    usageProvenance: 'upstream_reported',
    usageErrorCode: null,
    driverRef: 'builtin://openai-responses-compatible@1',
    driverRuntimeKind: 'builtin',
    errorCode: null
  };
}
