import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  LegateAPIError,
  createEndpoint,
  createEndpointGroup,
  createGroup,
  deleteDriverProfile,
  deleteEndpoint,
  deleteEndpointGroup,
  discoverEndpointModels,
  getAnalyticsSummary,
  getGroup,
  getModelGroupMappingStatistics,
  getDriverProfile,
  getEndpoint,
  getEndpointGroup,
  getSidecarInstance,
  getSidecarSnapshot,
  listDriverProfiles,
  listDrivers,
  listEndpointGroups,
  listEndpoints,
  listGroups,
  listInvocationAttempts,
  listInvocationRequests,
  listSidecarInstances,
  moveEndpoint,
  setAdminTokenProvider,
  setUnauthorizedHandler,
  updateDriverAlias,
  updateEndpoint,
  updateEndpointGroup,
  updateEndpointSchedule,
  updateGroup,
  uploadDriverProfile
} from './api';
import type { CreateEndpointPayload, EndpointGroupPayload, GroupPayload } from './api';
import type { DriverUploadManifest, InvocationAnalyticsSummary, InvocationAttempt, InvocationRequest } from './types';

const fetchMock = vi.fn<typeof fetch>();

describe('endpoint API client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setAdminTokenProvider(null);
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    setAdminTokenProvider(null);
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('uses the endpoint group collection and item routes', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: null }))
      .mockResolvedValueOnce(response(endpointGroup()))
      .mockResolvedValueOnce(response(endpointGroup(), 201))
      .mockResolvedValueOnce(response(endpointGroup()))
      .mockResolvedValueOnce(response({ ok: true }));
    const payload: EndpointGroupPayload = { name: 'Production', remark: '', sortOrder: 0 };

    await expect(listEndpointGroups()).resolves.toEqual([]);
    await getEndpointGroup(11);
    await createEndpointGroup(payload);
    await updateEndpointGroup(11, payload);
    await deleteEndpointGroup(11);

    expect(requestAt(0)[0]).toBe('/api/admin/endpoint-groups');
    expect(requestAt(1)[0]).toBe('/api/admin/endpoint-groups/11');
    expect(requestAt(2)).toEqual(expect.arrayContaining([
      '/api/admin/endpoint-groups', expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
    ]));
    expect(requestAt(3)).toEqual(expect.arrayContaining([
      '/api/admin/endpoint-groups/11', expect.objectContaining({ method: 'PUT' })
    ]));
    expect(requestAt(4)).toEqual(expect.arrayContaining([
      '/api/admin/endpoint-groups/11', expect.objectContaining({ method: 'DELETE' })
    ]));
  });

  it('normalizes secret-free endpoint responses and driver config JSON', async () => {
    fetchMock.mockResolvedValue(response({ items: [endpointResponse()] }));
    const [endpoint] = await listEndpoints();

    expect(endpoint).toMatchObject({
      id: 101,
      groupId: 11,
      kind: 'text',
      driverRef: 'builtin://openai-chat-compatible@1',
      driverConfig: { region: 'us' },
      credentialSlots: [{ name: 'api_key', configured: true }],
      modelGroupNames: ['chat']
    });
    expect(endpoint).not.toHaveProperty('credentials');
    expect(endpoint.uptime.percentage).toBe(75);
  });

  it('creates and fetches endpoints through the canonical routes', async () => {
    fetchMock
      .mockResolvedValueOnce(response(endpointResponse(), 201))
      .mockResolvedValueOnce(response(endpointResponse()));
    const payload = createEndpointPayload();

    await createEndpoint(payload);
    await getEndpoint(101);

    expect(requestAt(0)).toEqual(expect.arrayContaining([
      '/api/admin/endpoints',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
    ]));
    expect(requestAt(1)[0]).toBe('/api/admin/endpoints/101');
  });

  it('discovers and normalizes remote endpoint models from the current draft', async () => {
    fetchMock.mockResolvedValue(response({ models: [{ id: ' gpt-5 ' }, { id: 'gpt-5' }, { id: 'gpt-4.1' }, { id: 7 }] }));
    const payload = {
      kind: 'text' as const,
      driverRef: 'builtin://openai-chat-compatible@1',
      driverConfig: {},
      baseUrl: 'https://api.example/v1',
      credentials: { api_key: 'secret' }
    };

    await expect(discoverEndpointModels(payload)).resolves.toEqual(['gpt-5', 'gpt-4.1']);
    expect(requestAt(0)).toEqual(expect.arrayContaining([
      '/api/admin/endpoints/discover-models',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
    ]));
  });

  it('omits blank credential updates so existing secrets are preserved', async () => {
    fetchMock.mockResolvedValue(response(endpointResponse()));
    const { groupId: _groupId, kind: _kind, ...payload } = createEndpointPayload();
    payload.credentials = { api_key: '', organization: 'org-1', whitespace: '   ' };

    await updateEndpoint(101, payload);

    const body = JSON.parse(String((requestAt(0)[1] as RequestInit).body));
    expect(body.credentials).toEqual({ organization: 'org-1' });
    expect(body).not.toHaveProperty('groupId');
    expect(body).not.toHaveProperty('kind');
  });

  it('uses endpoint-specific schedule, move, and delete routes', async () => {
    fetchMock
      .mockResolvedValueOnce(response(endpointResponse()))
      .mockResolvedValueOnce(response(endpointResponse()))
      .mockResolvedValueOnce(response({ ok: true }));

    await updateEndpointSchedule(101, false);
    await moveEndpoint(101, 12);
    await deleteEndpoint(101);

    expect(requestAt(0)).toEqual(expect.arrayContaining(['/api/admin/endpoints/101/schedule', expect.objectContaining({ method: 'PATCH', body: '{"enabled":false}' })]));
    expect(requestAt(1)).toEqual(expect.arrayContaining(['/api/admin/endpoints/101/group', expect.objectContaining({ method: 'PATCH', body: '{"groupId":12}' })]));
    expect(requestAt(2)).toEqual(expect.arrayContaining(['/api/admin/endpoints/101', expect.objectContaining({ method: 'DELETE' })]));
  });

  it('never requests a legacy upstream provider route', async () => {
    fetchMock.mockImplementation(async () => response({ items: [] }));
    await listEndpoints();
    await listEndpointGroups();
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/api/admin/providers'))).toBe(false);
  });

  it('uses the new driver catalog and profile routes', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [driverCatalogItem()] }))
      .mockResolvedValueOnce(response({ items: [driverProfile()] }))
      .mockResolvedValueOnce(response(driverProfile()))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ ok: true }));

    await listDrivers();
    const profiles = await listDriverProfiles();
    const profile = await getDriverProfile(9);
    await updateDriverAlias('profile://workspace/custom@sha256:abc', 'Primary');
    await deleteDriverProfile(9);

    expect(requestAt(0)[0]).toBe('/api/admin/drivers');
    expect(requestAt(1)[0]).toBe('/api/admin/driver-profiles');
    expect(requestAt(2)[0]).toBe('/api/admin/driver-profiles/9');
    expect(requestAt(3)).toEqual(expect.arrayContaining(['/api/admin/drivers', expect.objectContaining({ method: 'PATCH' })]));
    expect(requestAt(4)).toEqual(expect.arrayContaining(['/api/admin/driver-profiles/9', expect.objectContaining({ method: 'DELETE' })]));
    expect(profiles[0].uploadedBy).toEqual({ userId: 7, displayName: 'Alice Operator' });
    expect(profile.uploadedBy.displayName).toBe('Alice Operator');
  });

  it('uploads driver manifest and WASM as multipart data', async () => {
    fetchMock.mockResolvedValue(response(driverProfile(), 201));
    const wasm = new Blob(['wasm'], { type: 'application/wasm' });
    await uploadDriverProfile(driverUploadManifest(), wasm);

    const [path, init] = requestAt(0);
    expect(path).toBe('/api/admin/driver-profiles');
    expect(init).toEqual(expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    expect(new Headers((init as RequestInit).headers).has('Content-Type')).toBe(false);
  });

  it('serializes only model group command fields when editing response mappings', async () => {
    fetchMock
      .mockResolvedValueOnce(response(modelGroup(), 201))
      .mockResolvedValueOnce(response(modelGroup()));
    const payload: GroupPayload = {
      name: 'chat',
      kind: 'text',
      description: '',
      status: 'normal',
      firstResponseTimeoutSeconds: null,
      routingMode: 'tiered_failover',
      sidecarConfigMode: 'full',
      inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
      mappings: [{ endpointId: 101, modelId: 'gpt-5', tier: 0, weight: 100, sortOrder: 1 }]
    };

    await createGroup(payload);
    const body = JSON.parse(String((requestAt(0)[1] as RequestInit).body));
    expect(body.mappings[0]).toMatchObject({ endpointId: 101 });
    expect(body.mappings[0]).not.toHaveProperty('providerId');
    expect(body).toMatchObject({ inboundProtocolContracts: ['openai.chat_completions/2026-07-18'] });
    expect(body.firstResponseTimeoutSeconds).toBeNull();

    const responseMapping = { ...payload.mappings[0], id: 1, groupId: 3 };
    await updateGroup(3, { ...payload, mappings: [responseMapping] });
    const updateBody = JSON.parse(String((requestAt(1)[1] as RequestInit).body));
    expect(updateBody.mappings[0]).toEqual({
      endpointId: 101,
      modelId: 'gpt-5',
      tier: 0,
      weight: 100,
      sortOrder: 1
    });
  });

  it('normalizes model group summaries from endpoint totals', async () => {
    fetchMock.mockResolvedValue(response({ items: [modelGroup()] }));
    const [group] = await listGroups();
    expect(group).toMatchObject({ endpointTotal: 1, endpointAvailable: 1, inboundProtocolContracts: ['openai.chat_completions/2026-07-18'] });
    expect(group).not.toHaveProperty('uptime');
  });

  it('loads a model group item through its canonical detail route', async () => {
    fetchMock.mockResolvedValue(response(modelGroup()));

    await expect(getGroup(3)).resolves.toMatchObject({ id: 3, name: 'chat' });
    expect(requestAt(0)[0]).toBe('/api/admin/model-groups/3');
  });

  it('queries mapping statistics with the exact group window and bucket contract', async () => {
    fetchMock.mockResolvedValue(response({
      window: { from: '2026-07-26T00:00:00Z', to: '2026-07-26T01:00:00Z', bucketSeconds: 60 },
      group: { availableAttemptCount: 0, attemptCount: 0, uptimePercentage: null, historicalOnlyAttemptCount: 0 },
      mappings: [],
      completeness: analyticsSummaryResponse().completeness
    }));

    const result = await getModelGroupMappingStatistics({
      groupId: 3,
      from: '2026-07-26T00:00:00Z',
      to: '2026-07-26T01:00:00Z',
      bucket: '1m'
    });

    expect(requestAt(0)[0]).toBe('/api/admin/analytics/model-group-mappings?groupId=3&from=2026-07-26T00%3A00%3A00Z&to=2026-07-26T01%3A00%3A00Z&bucket=1m');
    expect(result.group.uptimePercentage).toBeNull();
    expect(result.group.historicalOnlyAttemptCount).toBe(0);
  });

  it('uses only the three V1 analytics routes with stable typed query ordering', async () => {
    fetchMock
      .mockResolvedValueOnce(response(analyticsSummaryResponse()))
      .mockResolvedValueOnce(response({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
    const range = { from: '2026-07-17T00:00:00.000Z', to: '2026-07-17T01:00:00.000Z' };

    await getAnalyticsSummary({ ...range, groupId: 3 });
    await listInvocationRequests({
      ...range,
      groupId: 3,
      outcome: 'client_error',
      role: 'origin',
      rootRequestId: 'root-1',
      cursor: 'cursor+/=',
      limit: 20
    });
    await listInvocationAttempts({
      ...range,
      groupId: 3,
      endpointId: 101,
      outcome: 'upstream_error',
      rootRequestId: 'root-1',
      cursor: 'cursor+/=',
      limit: 40
    });

    expect(requestAt(0)[0]).toBe('/api/admin/analytics/summary?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-17T01%3A00%3A00.000Z&groupId=3');
    expect(requestAt(1)[0]).toBe('/api/admin/analytics/requests?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-17T01%3A00%3A00.000Z&groupId=3&outcome=client_error&role=origin&rootRequestId=root-1&cursor=cursor%2B%2F%3D&limit=20');
    expect(requestAt(2)[0]).toBe('/api/admin/analytics/attempts?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-17T01%3A00%3A00.000Z&groupId=3&endpointId=101&outcome=upstream_error&rootRequestId=root-1&cursor=cursor%2B%2F%3D&limit=40');
  });

  it('preserves nullable V1 summary measurements, known zero, and large decimal cost', async () => {
    fetchMock.mockResolvedValue(response(analyticsSummaryResponse()));

    const summary = await getAnalyticsSummary();
    expect(summary.requests).toMatchObject({ count: 2, successfulCount: 1, failedCount: 1 });
    expect(summary.attempts.usage).toMatchObject({ knownInputTokens: null, knownOutputTokens: 0 });
    expect(summary.attempts.averageTimeToFirstEventMs).toBeNull();
    expect(summary.attempts.averageTimeToFirstOutputMs).toBe(0);
    expect(summary.attempts.cost.knownEndpointCostNanoUSD).toBe('9007199254740993');
    expect(summary.completeness.complete).toBe(true);
  });

  it('keeps the V1 attempt contract and cursor intact', async () => {
    fetchMock.mockResolvedValue(response({ items: [invocationAttemptResponse()], nextCursor: 'next-page' }));

    const page = await listInvocationAttempts();
    expect(page.nextCursor).toBe('next-page');
    expect(page.items[0]).toMatchObject({
      mode: 'sse',
      streamStatus: 'partial_failure',
      responseCommitted: true,
      timeToFirstEventMs: 0,
      timeToFirstOutputMs: null,
      upstreamBytes: 0,
      downstreamBytes: null,
      streamEventCount: 0,
      usageStatus: 'partial',
      inputTokens: 0,
      outputTokens: null,
      reasoningTokens: null,
      tokensPerSecond: null,
      endpointCostNanoUSD: null,
      usageProvenance: 'driver_accumulated',
      driverRef: 'profile://stream-driver@1',
      driverRuntimeKind: 'wasm'
    });
    expect(page.items[0]).toMatchObject({
      upstreamStatusCode: 503,
      responseStatusCode: 502,
      outcome: 'upstream_error'
    });
  });

  it('types analytics nullable fields explicitly', () => {
    expectTypeOf<InvocationAnalyticsSummary['attempts']['averageTimeToFirstEventMs']>().toEqualTypeOf<number | null>();
    expectTypeOf<InvocationAttempt['reasoningTokens']>().toEqualTypeOf<number | null>();
    expectTypeOf<InvocationAttempt['driverRuntimeKind']>().toEqualTypeOf<'builtin' | 'wasm'>();
    expectTypeOf<InvocationAttempt['upstreamStatusCode']>().toEqualTypeOf<number | null>();
    expectTypeOf<InvocationAttempt['responseStatusCode']>().toEqualTypeOf<number | null>();
    expectTypeOf<InvocationRequest['outcome']>().toEqualTypeOf<
      | 'success'
      | 'client_error'
      | 'auth_error'
      | 'routing_error'
      | 'capacity_error'
      | 'upstream_error'
      | 'timeout'
      | 'canceled'
      | 'internal_error'
    >();
  });

  it('preserves null raw status and normalizes omitted optional fields without copying status axes', async () => {
    fetchMock.mockResolvedValue(response({
      items: [{ ...invocationAttemptResponse(), upstreamStatusCode: null, responseStatusCode: undefined }],
      nextCursor: null
    }));

    const page = await listInvocationAttempts();
    const record = page.items[0];

    expect(record.responseStatusCode).toBeNull();
    expect(record.upstreamStatusCode).toBeNull();
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBeNull();
  });

  it('returns request pages separately from attempt pages', async () => {
    fetchMock.mockResolvedValue(response({ items: [invocationRequestResponse()], nextCursor: null }));

    const page = await listInvocationRequests();

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ role: 'origin', responseStatusCode: 200, parentRequestId: null });
  });

  it('reads nullable Sidecar telemetry detail without changing the list contract', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [sidecarInstanceResponse()], total: 1, limit: 50, offset: 0 }))
      .mockResolvedValueOnce(response({
        ...sidecarInstanceResponse(),
        telemetry: {
          incarnation: 7,
          sessionId: '0123456789abcdef0123456789abcdef',
          generation: 2,
          sessionStartedAt: '2026-07-17T00:00:00Z',
          lastReportedAt: '2026-07-17T00:01:00Z',
          coveredThrough: '2026-07-17T00:00:59Z',
          queueDepth: 0,
          oldestQueuedAt: null,
          droppedEventCount: 0,
          dropCounterSaturated: false
        }
      }));

    const listed = await listSidecarInstances();
    const detail = await getSidecarInstance(9);

    expect(requestAt(0)[0]).toBe('/api/admin/sidecar-instances');
    expect(requestAt(1)[0]).toBe('/api/admin/sidecar-instances/9');
    expect(listed.items[0]).not.toHaveProperty('telemetry');
    expect(detail.telemetry).toMatchObject({ queueDepth: 0, droppedEventCount: 0, oldestQueuedAt: null });
  });

  it('accepts endpoint snapshots and rejects groups in reference mode with mappings', async () => {
    fetchMock.mockResolvedValueOnce(response({
      schemaVersion: 1,
      revision: 'rev-1',
      profiles: [],
      endpoints: [],
      groups: [],
      apiKeys: []
    }));
    await expect(getSidecarSnapshot('token')).resolves.toMatchObject({ revision: 'rev-1', endpoints: [] });

    fetchMock.mockResolvedValueOnce(response({
      schemaVersion: 1,
      revision: 'rev-2',
      profiles: [],
      endpoints: [],
      groups: [{ id: 3, name: 'central', sidecarConfigMode: 'reference', mappings: [{ endpointId: 1, modelId: 'gpt' }] }],
      apiKeys: []
    }));
    await expect(getSidecarSnapshot('token')).rejects.toThrow('reference group central must not contain mappings');
  });

  it('invokes the unauthorized handler once and preserves API error details', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    fetchMock.mockImplementation(async () => response({ error: { code: 'unauthorized', message: 'sign in' } }, 401));

    await expect(listEndpoints()).rejects.toMatchObject<Partial<LegateAPIError>>({ status: 401, code: 'unauthorized' });
    await expect(listEndpointGroups()).rejects.toMatchObject<Partial<LegateAPIError>>({ status: 401, code: 'unauthorized' });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('adds a hidden bearer token and workspace header to admin requests', async () => {
    setAdminTokenProvider(() => 'admin-token');
    fetchMock.mockResolvedValue(response({ items: [] }));
    await listEndpoints();
    const headers = new Headers((requestAt(0)[1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
    expect(headers.get('X-Legate-Workspace')).toBeTruthy();
  });
});

function requestAt(index: number): [string, RequestInit] {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function endpointGroup() {
  return {
    id: 11,
    workspaceId: 1,
    name: 'Production',
    remark: '',
    sortOrder: 0,
    endpointCount: 1,
    createdAt: '',
    updatedAt: ''
  };
}

function createEndpointPayload(): CreateEndpointPayload {
  return {
    groupId: 11,
    kind: 'text',
    name: 'OpenAI Text',
    remark: '',
    scheduleEnabled: true,
    driverRef: 'builtin://openai-chat-compatible@1',
    driverConfig: { region: 'us' },
    baseUrl: 'https://api.openai.com/v1',
    credentials: { api_key: 'secret' },
    models: [endpointResponse().models[0]]
  };
}

function endpointResponse() {
  return {
    id: 101,
    workspaceId: 1,
    groupId: 11,
    name: 'OpenAI Text',
    remark: '',
    kind: 'text',
    status: 'enabled',
    scheduleEnabled: true,
    driverRef: 'builtin://openai-chat-compatible@1',
    driverConfigJson: '{"region":"us"}',
    baseUrl: 'https://api.openai.com/v1',
    credentialSlots: [{ name: 'api_key', configured: true }],
    models: [{
      id: 'gpt-5',
      textFeatures: ['text'],
      imageProtocolContracts: [],
      inputPricePerMillion: '1',
      outputPricePerMillion: '2',
      cachePricePerMillion: '0'
    }],
    modelGroupNames: ['chat'],
    uptime: { available: 3, total: 4, percentage: 99 },
    lastUsedAt: null,
    createdAt: '',
    updatedAt: ''
  };
}

function sidecarInstanceResponse() {
  return {
    id: 9,
    tokenId: 3,
    tokenName: 'edge-token',
    instanceId: 'edge-a',
    hostname: 'edge-a.example',
    sidecarVersion: 'v1.0.0',
    syncIntervalSeconds: 30,
    online: true,
    lastSeenAt: '2026-07-17T00:01:00Z',
    lastPullAt: null,
    lastPullSuccess: null,
    lastPullError: '',
    appliedSnapshotSchemaVersion: 1,
    appliedSnapshotRevision: 'revision-1',
    createdAt: '2026-07-17T00:00:00Z',
    updatedAt: '2026-07-17T00:01:00Z'
  };
}

function invocationAttemptResponse(): InvocationAttempt {
  return {
    eventId: 'attempt-event',
    rootRequestId: 'root-1',
    requestId: 'request-1',
    workspaceId: 1,
    apiKeyId: 2,
    startedAt: '2026-07-16T04:00:00Z',
    durationMs: 250,
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
    upstreamStatusCode: 503,
    responseStatusCode: 502,
    outcome: 'upstream_error',
    available: false,
    retryable: true,
    final: true,
    routingMode: 'tiered_failover',
    routingTier: 0,
    mappingWeight: 100,
    attemptIndex: 1,
    failoverReason: null,
    breakerState: 'closed',
    breakerKey: 'workspace:1:endpoint:101',
    streamStatus: 'partial_failure',
    responseCommitted: true,
    timeToFirstEventMs: 0,
    timeToFirstOutputMs: null,
    upstreamBytes: 0,
    downstreamBytes: null,
    streamEventCount: 0,
    terminationReason: 'upstream_stream_truncated',
    usageStatus: 'partial',
    inputTokens: 0,
    outputTokens: null,
    cachedTokens: 0,
    reasoningTokens: null,
    tokensPerSecond: null,
    endpointCostNanoUSD: null,
    usageProvenance: 'driver_accumulated',
    usageErrorCode: null,
    driverRef: 'profile://stream-driver@1',
    driverRuntimeKind: 'wasm',
    errorCode: 'upstream_stream_truncated'
  };
}

function invocationRequestResponse(): InvocationRequest {
  return {
    eventId: 'request-event',
    rootRequestId: 'root-1',
    requestId: 'request-1',
    parentRequestId: null,
    workspaceId: 1,
    apiKeyId: 2,
    groupId: 3,
    groupName: 'chat',
    kind: 'text',
    invocation: { protocol: 'openai', operation: 'responses' },
    mode: 'buffered',
    requestPath: '/v1/responses',
    role: 'origin',
    entryLocation: 'central',
    executionLocation: 'central',
    originSidecarTokenId: null,
    originSidecarInstanceId: null,
    originSnapshotRevision: null,
    startedAt: '2026-07-16T04:00:00Z',
    durationMs: 250,
    responseStatusCode: 200,
    outcome: 'success',
    streamStatus: 'completed',
    responseCommitted: true,
    timeToFirstEventMs: null,
    timeToFirstOutputMs: 25,
    downstreamBytes: 128,
    terminationReason: 'completed',
    errorCode: null
  };
}

function analyticsSummaryResponse(): InvocationAnalyticsSummary {
  const outcomes = {
    success: 1,
    clientError: 0,
    authError: 0,
    routingError: 0,
    capacityError: 0,
    upstreamError: 1,
    timeout: 0,
    canceled: 0,
    internalError: 0
  };
  return {
    window: { from: '2026-07-17T00:00:00Z', to: '2026-07-17T01:00:00Z' },
    requests: { count: 2, successfulCount: 1, failedCount: 1, outcomes, averageDurationMs: 10 },
    attempts: {
      count: 2,
      successfulCount: 1,
      failedCount: 1,
      outcomes,
      availableCount: 1,
      unavailableCount: 1,
      retryableCount: 1,
      retriedCount: 1,
      finalCount: 1,
      committedCount: 1,
      usage: {
        knownInputTokens: null,
        knownOutputTokens: 0,
        knownCachedTokens: 0,
        knownReasoningTokens: null,
        finalAttemptCount: 1,
        partialAttemptCount: 1,
        unavailableAttemptCount: 0
      },
      cost: {
        knownEndpointCostNanoUSD: '9007199254740993',
        knownAttemptCount: 1,
        unknownAttemptCount: 1
      },
      averageDurationMs: 0,
      averageTimeToFirstEventMs: null,
      averageTimeToFirstOutputMs: 0
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

function driverCatalogItem() {
  return {
    ref: 'builtin://openai-chat-compatible@1',
    source: 'builtin',
    runtimeKind: 'builtin',
    manifest: driverManifest()
  };
}

function driverProfile() {
  return {
    id: 9,
    ref: 'profile://workspace/custom@sha256:abc',
    name: 'custom',
    artifactDigest: 'sha256:abc',
    artifactSizeBytes: 4,
    manifest: driverManifest(),
    usedByEndpoints: 0,
    createdAt: '',
    uploadedBy: { userId: 7, displayName: 'Alice Operator' }
  };
}

function driverManifest() {
  return {
    id: 'openai-chat-compatible',
    displayName: 'OpenAI Text',
    version: '1',
    kind: 'text',
    text: {
      protocolContracts: ['openai.chat_completions/2026-07-18']
    },
    managementCapabilities: ['models.list'],
    configSchemaJson: '{"type":"object"}',
    credentialSchema: { slots: [{ name: 'api_key', required: true }] },
    requestedCapabilities: []
  };
}

function driverUploadManifest(): DriverUploadManifest {
  const { configSchemaJson: _configSchemaJSON, ...manifest } = driverManifest();
  return {
    ...manifest,
    kind: 'text',
    text: {
      protocolContracts: ['openai.chat_completions/2026-07-18']
    },
    wireAbiVersion: '1',
    configSchema: { type: 'object' }
  };
}

function modelGroup() {
  return {
    id: 3,
    workspaceId: 1,
    name: 'chat',
    kind: 'text',
    description: '',
    status: 'normal',
    firstResponseTimeoutSeconds: null,
    effectiveFirstResponseTimeoutSeconds: 180,
    routingMode: 'tiered_failover',
    sidecarConfigMode: 'full',
    inboundProtocolContracts: ['openai.chat_completions/2026-07-18'],
    mappings: [{ id: 1, groupId: 3, endpointId: 101, modelId: 'gpt-5', tier: 0, weight: 100, sortOrder: 1 }],
    endpointTotal: 1,
    endpointAvailable: 1,
    uptime: { available: 1, total: 1, percentage: 100 },
    createdAt: '',
    updatedAt: ''
  };
}
