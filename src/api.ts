import type {
  APIKey,
  APIKeyCreateResult,
  APIKeyStatus,
  AdminIdentity,
  AdminUser,
  AdminUserDetail,
  InvocationAnalyticsSummary,
  InvocationAttempt,
  InvocationAttemptPage,
  DriverCatalogItem,
  DriverProfile,
  DriverUploadManifest,
  Endpoint,
  EndpointGroup,
  EndpointModel,
  InboundProtocolContract,
  InvocationOutcome,
  InvocationRequest,
  InvocationRequestPage,
  InvocationRequestRole,
  ModelGroup,
  ModelGroupMappingStatistics,
  ModelGroupMapping,
  ModelGroupStatus,
  ModelKind,
  RoutingMode,
  SidecarConfigMode,
  SidecarSnapshot,
  SidecarInstance,
  SidecarInstanceDetail,
  SidecarInstancePage,
  SidecarInstanceQuery,
  SidecarToken,
  SidecarTokenCreateResult,
  SidecarTokenStatus,
  Uptime,
  Workspace,
  WorkspaceAccess,
  WorkspaceMember,
  WorkspaceMemberResolution,
  WorkspaceRole,
  WorkspaceStatus
} from './types';
import type { AdminPrincipal } from './types';
import { normalizeAdminPrincipal, type PublicAdminAuthConfig } from './auth';
import { normalizeGroupMappings, normalizeUptime } from './domain';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export const WORKSPACE_STORAGE_KEY = 'legate.workspace';
export const DEFAULT_WORKSPACE = import.meta.env.VITE_DEFAULT_WORKSPACE ?? 'default';

type AdminTokenProvider = () => string;
type UnauthorizedHandler = () => void | Promise<void>;

let adminTokenProvider: AdminTokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedHandlerInvoked = false;

export interface EndpointGroupPayload {
  name: string;
  remark: string;
  sortOrder: number;
}

export interface CreateEndpointPayload {
  groupId: number;
  kind: ModelKind;
  name: string;
  remark: string;
  scheduleEnabled: boolean;
  driverRef: string;
  driverConfig: Record<string, unknown>;
  baseUrl: string;
  credentials: Record<string, string>;
  models: EndpointModel[];
}

export type UpdateEndpointPayload = Omit<CreateEndpointPayload, 'groupId' | 'kind'>;

export interface DiscoverEndpointModelsPayload {
  endpointId?: number;
  kind: ModelKind;
  driverRef: string;
  driverConfig: Record<string, unknown>;
  baseUrl: string;
  credentials: Record<string, string>;
}

export interface GroupPayload {
  name: string;
  kind: ModelKind;
  description: string;
  status: ModelGroupStatus;
  firstResponseTimeoutSeconds: number | null;
  routingMode: RoutingMode;
  sidecarConfigMode: SidecarConfigMode;
  inboundProtocolContracts: InboundProtocolContract[];
  mappings: ModelGroupMappingPayload[];
}

export interface ModelGroupMappingPayload {
  endpointId: number;
  modelId: string;
  tier: number;
  weight: number;
  sortOrder: number;
}

export interface APIKeyPayload {
  name: string;
  remark: string;
  status: APIKeyStatus;
  modelGroupIds: number[];
}

export interface SidecarTokenPayload {
  name: string;
  remark: string;
  status: SidecarTokenStatus;
}

export interface WorkspacePayload {
  slug: string;
  name: string;
  status: WorkspaceStatus;
}

export interface UpdateAdminUserPayload {
  status?: 'active' | 'suspended';
  platformAdmin?: boolean;
}

export interface DevelopmentIdentityMigrationPayload {
  providerId: string;
  email: string;
}

export type AddWorkspaceMemberPayload =
  | { userId: number; email?: never; providerId?: never; role: WorkspaceRole }
  | { userId?: never; email: string; providerId: string; role: WorkspaceRole };

export interface AnalyticsRangeParams {
  from?: string;
  to?: string;
}

export interface InvocationAnalyticsSummaryParams extends AnalyticsRangeParams {
  groupId?: number;
}

export interface InvocationRequestListParams extends AnalyticsRangeParams {
  groupId?: number;
  outcome?: InvocationOutcome;
  role?: InvocationRequestRole;
  rootRequestId?: string;
  cursor?: string;
  limit?: number;
}

export interface InvocationAttemptListParams extends AnalyticsRangeParams {
  groupId?: number;
  endpointId?: number;
  outcome?: InvocationOutcome;
  rootRequestId?: string;
  cursor?: string;
  limit?: number;
}

export interface ModelGroupMappingStatisticsParams {
  groupId: number;
  from: string;
  to: string;
  bucket: '1m' | '30m' | '3h' | '12h';
  signal?: AbortSignal;
}

interface RequestOptions {
  workspace?: string;
  token?: string;
  skipWorkspace?: boolean;
  skipAdminAuth?: boolean;
  suppressUnauthorizedHandler?: boolean;
}

type EndpointResponse = Omit<Endpoint, 'models' | 'modelGroupNames' | 'driverConfig' | 'credentialSlots' | 'uptime'> & {
  models?: EndpointModel[] | null;
  modelGroupNames?: string[] | null;
  driverConfigJson?: unknown;
  credentialSlots?: Endpoint['credentialSlots'] | null;
  uptime?: Uptime | null;
};

type APIKeyResponse = Omit<APIKey, 'modelGroups'> & {
  modelGroups?: APIKey['modelGroups'] | null;
};

type ModelGroupResponse = Omit<ModelGroup, 'sidecarConfigMode' | 'mappings'> & {
  sidecarConfigMode: unknown;
  mappings?: ModelGroupMapping[] | null;
};

type SidecarTokenResponse = SidecarToken;

const SIDECAR_VERIFY_ONLY_HEADER = 'X-Legate-Sidecar-Verify-Only';
const ADMIN_CSRF_COOKIE = '__Host-legate_admin_csrf';
const ADMIN_CSRF_HEADER = 'X-Legate-CSRF';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class LegateAPIError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'LegateAPIError';
    this.status = status;
    this.code = code;
  }
}

export function setAdminTokenProvider(provider: AdminTokenProvider | null) {
  adminTokenProvider = provider;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
  unauthorizedHandlerInvoked = false;
}

export function getAdminToken(): string {
  if (!adminTokenProvider) return '';
  return adminTokenProvider().trim();
}

export function getWorkspaceSlug(): string {
  return readStorage(WORKSPACE_STORAGE_KEY) || DEFAULT_WORKSPACE;
}

export function saveWorkspaceSlug(workspace: string) {
  writeStorage(WORKSPACE_STORAGE_KEY, workspace.trim() || DEFAULT_WORKSPACE);
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body != null;
  if (hasBody && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let token = '';
  if (!options.skipAdminAuth) {
    token = options.token ?? getAdminToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (init.method ?? 'GET').toUpperCase();
  if (!options.skipAdminAuth && !token && !SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(ADMIN_CSRF_COOKIE);
    if (csrfToken) headers.set(ADMIN_CSRF_HEADER, csrfToken);
  }

  if (!options.skipWorkspace) {
    const workspace = options.workspace ?? getWorkspaceSlug();
    if (workspace) headers.set('X-Legate-Workspace', workspace);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin'
  });
  let data: any = {};
  try {
    data = parseJSON(await response.text());
  } catch (error) {
    if (response.ok) throw error;
  }
  if (!response.ok) {
    const code = data?.error?.code ?? data?.code ?? 'request_failed';
    const message = data?.error?.message ?? data?.message ?? response.statusText;
    if (response.status === 401 && !options.suppressUnauthorizedHandler) {
      notifyUnauthorized();
    }
    throw new LegateAPIError(response.status, code, message);
  }
  return data as T;
}

export async function getPublicAuthConfig(): Promise<PublicAdminAuthConfig> {
  return request<PublicAdminAuthConfig>('/api/auth/config', {}, {
    skipWorkspace: true,
    skipAdminAuth: true,
    suppressUnauthorizedHandler: true
  });
}

export async function getCurrentAdmin(): Promise<AdminPrincipal> {
  const raw = await request<unknown>('/api/auth/me', {}, {
    skipWorkspace: true,
    suppressUnauthorizedHandler: true
  });
  const principal = normalizeAdminPrincipal(raw);
  if (!principal) {
    throw new LegateAPIError(502, 'invalid_admin_principal', 'Invalid administrator session response');
  }
  return principal;
}

export async function logoutAdmin(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }, { skipWorkspace: true });
}

export async function healthz(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/healthz', {}, { skipWorkspace: true, skipAdminAuth: true });
}

export async function listMyWorkspaces(): Promise<WorkspaceAccess[]> {
  const response = await request<{ items: WorkspaceAccess[] | null }>('/api/admin/me/workspaces', {}, { skipWorkspace: true });
  return itemsOrEmpty(response.items).map(normalizeWorkspaceAccess);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const response = await request<{ items: Workspace[] | null }>('/api/admin/workspaces', {}, { skipWorkspace: true });
  return itemsOrEmpty(response.items);
}

export async function createWorkspace(payload: WorkspacePayload): Promise<Workspace> {
  return request<Workspace>('/api/admin/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, { skipWorkspace: true });
}

export async function updateWorkspace(id: number, payload: WorkspacePayload): Promise<Workspace> {
  return request<Workspace>(`/api/admin/workspaces/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }, { skipWorkspace: true });
}

export async function listWorkspaceMembers(id: number): Promise<WorkspaceMember[]> {
  const response = await request<{ items: WorkspaceMember[] | null }>(`/api/admin/workspaces/${id}/members`, {}, { skipWorkspace: true });
  return itemsOrEmpty(response.items);
}

export async function addWorkspaceMember(id: number, payload: AddWorkspaceMemberPayload): Promise<WorkspaceMember> {
  return request<WorkspaceMember>(`/api/admin/workspaces/${id}/members`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }, { skipWorkspace: true });
}

export async function resolveWorkspaceMember(id: number, email: string): Promise<WorkspaceMemberResolution> {
  const query = new URLSearchParams({ email: email.trim() });
  return request<WorkspaceMemberResolution>(`/api/admin/workspaces/${id}/members/resolve?${query.toString()}`, {}, { skipWorkspace: true });
}

export async function deleteWorkspaceMember(id: number, userId: number): Promise<void> {
  await request(`/api/admin/workspaces/${id}/members/${userId}`, {
    method: 'DELETE'
  }, { skipWorkspace: true });
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await request<{ items: AdminUser[] | null }>('/api/admin/users', {}, { skipWorkspace: true });
  return itemsOrEmpty(response.items);
}

export async function getAdminUser(userId: number): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/api/admin/users/${userId}`, {}, { skipWorkspace: true });
}

export async function listAdminUserIdentities(userId: number): Promise<AdminIdentity[]> {
  const response = await request<{ items: AdminIdentity[] | null }>(`/api/admin/users/${userId}/identities`, {}, { skipWorkspace: true });
  return itemsOrEmpty(response.items);
}

export async function updateAdminUser(userId: number, payload: UpdateAdminUserPayload): Promise<AdminUser> {
  return request<AdminUser>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }, { skipWorkspace: true });
}

export async function revokeAdminUserSessions(userId: number): Promise<void> {
  await request(`/api/admin/users/${userId}/sessions/revoke`, { method: 'POST' }, { skipWorkspace: true });
}

export async function disableAdminIdentity(userId: number, identityId: number): Promise<void> {
  await request(`/api/admin/users/${userId}/identities/${identityId}`, { method: 'DELETE' }, { skipWorkspace: true });
}

export async function prepareDevelopmentIdentityMigration(
  userId: number,
  payload: DevelopmentIdentityMigrationPayload
): Promise<AdminUser> {
  return request<AdminUser>(`/api/admin/users/${userId}/development-identity-migration`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }, { skipWorkspace: true });
}

export async function listEndpointGroups(): Promise<EndpointGroup[]> {
  const response = await request<{ items: EndpointGroup[] | null }>('/api/admin/endpoint-groups');
  return itemsOrEmpty(response.items);
}

export async function getEndpointGroup(id: number): Promise<EndpointGroup> {
  return request<EndpointGroup>(`/api/admin/endpoint-groups/${id}`);
}

export async function createEndpointGroup(payload: EndpointGroupPayload): Promise<EndpointGroup> {
  return request<EndpointGroup>('/api/admin/endpoint-groups', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateEndpointGroup(id: number, payload: EndpointGroupPayload): Promise<EndpointGroup> {
  return request<EndpointGroup>(`/api/admin/endpoint-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteEndpointGroup(id: number): Promise<void> {
  await request(`/api/admin/endpoint-groups/${id}`, { method: 'DELETE' });
}

export async function listDrivers(): Promise<DriverCatalogItem[]> {
  const response = await request<{ items: DriverCatalogItem[] | null }>('/api/admin/drivers');
  return itemsOrEmpty(response.items).map(normalizeDriverCatalogItem);
}

export async function updateDriverAlias(ref: string, alias: string): Promise<void> {
  await request('/api/admin/drivers', {
    method: 'PATCH',
    body: JSON.stringify({ ref, alias })
  });
}

export async function listDriverProfiles(): Promise<DriverProfile[]> {
  const response = await request<{ items: DriverProfile[] | null }>('/api/admin/driver-profiles');
  return itemsOrEmpty(response.items).map(normalizeDriverProfile);
}

export async function getDriverProfile(id: number): Promise<DriverProfile> {
  return normalizeDriverProfile(await request<DriverProfile>(`/api/admin/driver-profiles/${id}`));
}

export async function uploadDriverProfile(manifest: DriverUploadManifest, wasm: Blob): Promise<DriverProfile> {
  const body = new FormData();
  body.append('manifest', new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'manifest.json');
  body.append('wasm', wasm.slice(0, wasm.size, 'application/wasm'), 'driver.wasm');
  return normalizeDriverProfile(await request<DriverProfile>('/api/admin/driver-profiles', {
    method: 'POST',
    body
  }));
}

export async function deleteDriverProfile(id: number): Promise<void> {
  await request(`/api/admin/driver-profiles/${id}`, { method: 'DELETE' });
}

export async function listEndpoints(): Promise<Endpoint[]> {
  const response = await request<{ items: EndpointResponse[] | null }>('/api/admin/endpoints');
  return itemsOrEmpty(response.items).map(normalizeEndpoint);
}

export async function getEndpoint(id: number): Promise<Endpoint> {
  return normalizeEndpoint(await request<EndpointResponse>(`/api/admin/endpoints/${id}`));
}

export async function createEndpoint(payload: CreateEndpointPayload): Promise<Endpoint> {
  const response = await request<EndpointResponse>('/api/admin/endpoints', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return normalizeEndpoint(response);
}

export async function updateEndpoint(id: number, payload: UpdateEndpointPayload): Promise<Endpoint> {
  const response = await request<EndpointResponse>(`/api/admin/endpoints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(endpointUpdatePayload(payload))
  });
  return normalizeEndpoint(response);
}

export async function discoverEndpointModels(payload: DiscoverEndpointModelsPayload): Promise<string[]> {
  const response = await request<{ models?: Array<{ id?: unknown }> | null }>('/api/admin/endpoints/discover-models', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!Array.isArray(response.models)) return [];
  return response.models
    .map((model) => typeof model?.id === 'string' ? model.id.trim() : '')
    .filter((id, index, values) => id.length > 0 && values.indexOf(id) === index);
}

function endpointUpdatePayload(payload: UpdateEndpointPayload): UpdateEndpointPayload {
  const credentials = Object.fromEntries(
    Object.entries(payload.credentials).filter(([, value]) => value.trim() !== '')
  );
  return { ...payload, credentials };
}

export async function deleteEndpoint(id: number): Promise<void> {
  await request(`/api/admin/endpoints/${id}`, { method: 'DELETE' });
}

export async function updateEndpointSchedule(id: number, enabled: boolean): Promise<Endpoint> {
  const response = await request<EndpointResponse>(`/api/admin/endpoints/${id}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
  });
  return normalizeEndpoint(response);
}

export async function moveEndpoint(id: number, groupId: number): Promise<Endpoint> {
  const response = await request<EndpointResponse>(`/api/admin/endpoints/${id}/group`, {
    method: 'PATCH',
    body: JSON.stringify({ groupId })
  });
  return normalizeEndpoint(response);
}

export async function listGroups(): Promise<ModelGroup[]> {
  const response = await request<{ items: ModelGroupResponse[] | null }>('/api/admin/model-groups');
  return itemsOrEmpty(response.items).map(normalizeGroup);
}

export async function getGroup(id: number): Promise<ModelGroup> {
  const response = await request<ModelGroupResponse>(`/api/admin/model-groups/${id}`);
  return normalizeGroup(response);
}

export async function createGroup(payload: GroupPayload): Promise<ModelGroup> {
  return request<ModelGroup>('/api/admin/model-groups', {
    method: 'POST',
    body: JSON.stringify(groupCommand(payload))
  });
}

export async function updateGroup(id: number, payload: GroupPayload): Promise<ModelGroup> {
  return request<ModelGroup>(`/api/admin/model-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(groupCommand(payload))
  });
}

function groupCommand(payload: GroupPayload): GroupPayload {
  return {
    name: payload.name,
    kind: payload.kind,
    description: payload.description,
    status: payload.status,
    firstResponseTimeoutSeconds: payload.firstResponseTimeoutSeconds,
    routingMode: payload.routingMode,
    sidecarConfigMode: payload.sidecarConfigMode,
    inboundProtocolContracts: payload.inboundProtocolContracts,
    mappings: payload.mappings.map((mapping) => ({
      endpointId: mapping.endpointId,
      modelId: mapping.modelId,
      tier: mapping.tier,
      weight: mapping.weight,
      sortOrder: mapping.sortOrder
    }))
  };
}

export async function deleteGroup(id: number): Promise<void> {
  await request(`/api/admin/model-groups/${id}`, { method: 'DELETE' });
}

export async function listAPIKeys(): Promise<APIKey[]> {
  const response = await request<{ items: APIKeyResponse[] | null }>('/api/admin/api-keys');
  return itemsOrEmpty(response.items).map(normalizeAPIKey);
}

export async function createAPIKey(payload: APIKeyPayload): Promise<APIKeyCreateResult> {
  const response = await request<APIKeyCreateResult>('/api/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return { ...normalizeAPIKey(response), key: response.key };
}

export async function updateAPIKey(id: number, payload: APIKeyPayload): Promise<APIKey> {
  const response = await request<APIKeyResponse>(`/api/admin/api-keys/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return normalizeAPIKey(response);
}

export async function deleteAPIKey(id: number): Promise<void> {
  await request(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
}

export async function listSidecarTokens(): Promise<SidecarToken[]> {
  const response = await request<{ items: SidecarTokenResponse[] | null }>('/api/admin/sidecar-tokens');
  return itemsOrEmpty(response.items).map(normalizeSidecarToken);
}

export async function createSidecarToken(payload: SidecarTokenPayload): Promise<SidecarTokenCreateResult> {
  return request<SidecarTokenCreateResult>('/api/admin/sidecar-tokens', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateSidecarToken(id: number, payload: SidecarTokenPayload): Promise<SidecarToken> {
  return request<SidecarToken>(`/api/admin/sidecar-tokens/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteSidecarToken(id: number): Promise<void> {
  await request(`/api/admin/sidecar-tokens/${id}`, { method: 'DELETE' });
}

export async function getSidecarSnapshot(sidecarToken: string, workspace = getWorkspaceSlug()): Promise<SidecarSnapshot> {
  const response = await request<unknown>('/api/v1/sidecar/snapshot', {
    headers: {
      [SIDECAR_VERIFY_ONLY_HEADER]: 'true'
    }
  }, { token: sidecarToken, workspace, skipAdminAuth: false });
  return normalizeSidecarSnapshot(response);
}

export async function listSidecarInstances(query: SidecarInstanceQuery = {}): Promise<SidecarInstancePage> {
  const params = new URLSearchParams();
  if (query.tokenId) params.set('tokenId', String(query.tokenId));
  if (query.online !== undefined) params.set('online', String(query.online));
  if (query.version?.trim()) params.set('version', query.version.trim());
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const suffix = params.size ? `?${params}` : '';
  const response = await request<Omit<SidecarInstancePage, 'items'> & { items: SidecarInstance[] | null }>(`/api/admin/sidecar-instances${suffix}`);
  return { ...response, items: itemsOrEmpty(response.items) };
}

export async function getSidecarInstance(id: number): Promise<SidecarInstanceDetail> {
  const response = await request<SidecarInstanceDetail>(`/api/admin/sidecar-instances/${id}`);
  return { ...response, telemetry: response.telemetry ?? null };
}

export async function getAnalyticsSummary(params: InvocationAnalyticsSummaryParams = {}): Promise<InvocationAnalyticsSummary> {
  const query = new URLSearchParams();
  appendAnalyticsRange(query, params);
  if (params.groupId) query.set('groupId', String(params.groupId));
  const suffix = query.toString() ? `?${query}` : '';
  return request<InvocationAnalyticsSummary>(`/api/admin/analytics/summary${suffix}`);
}

export async function getModelGroupMappingStatistics(
  params: ModelGroupMappingStatisticsParams
): Promise<ModelGroupMappingStatistics> {
  const query = new URLSearchParams();
  query.set('groupId', String(params.groupId));
  query.set('from', params.from);
  query.set('to', params.to);
  query.set('bucket', params.bucket);
  return request<ModelGroupMappingStatistics>(
    `/api/admin/analytics/model-group-mappings?${query}`,
    { signal: params.signal }
  );
}

export async function listInvocationRequests(params: InvocationRequestListParams = {}): Promise<InvocationRequestPage> {
  const query = new URLSearchParams();
  appendAnalyticsRange(query, params);
  if (params.groupId) query.set('groupId', String(params.groupId));
  if (params.outcome) query.set('outcome', params.outcome);
  if (params.role) query.set('role', params.role);
  if (params.rootRequestId?.trim()) query.set('rootRequestId', params.rootRequestId.trim());
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  const response = await request<{ items: InvocationRequest[] | null; nextCursor: string | null }>(`/api/admin/analytics/requests${suffix}`);
  return {
    items: itemsOrEmpty(response.items).map(normalizeInvocationRequest),
    nextCursor: response.nextCursor ?? null
  };
}

export async function listInvocationAttempts(params: InvocationAttemptListParams = {}): Promise<InvocationAttemptPage> {
  const query = new URLSearchParams();
  appendAnalyticsRange(query, params);
  if (params.groupId) query.set('groupId', String(params.groupId));
  if (params.endpointId) query.set('endpointId', String(params.endpointId));
  if (params.outcome) query.set('outcome', params.outcome);
  if (params.rootRequestId?.trim()) query.set('rootRequestId', params.rootRequestId.trim());
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  const response = await request<{ items: InvocationAttempt[] | null; nextCursor: string | null }>(`/api/admin/analytics/attempts${suffix}`);
  return {
    items: itemsOrEmpty(response.items).map(normalizeInvocationAttempt),
    nextCursor: response.nextCursor ?? null
  };
}

function normalizeInvocationRequest(record: InvocationRequest): InvocationRequest {
  return {
    ...record,
    parentRequestId: record.parentRequestId ?? null,
    originSidecarTokenId: record.originSidecarTokenId ?? null,
    originSidecarInstanceId: record.originSidecarInstanceId ?? null,
    originSnapshotRevision: record.originSnapshotRevision ?? null,
    responseStatusCode: record.responseStatusCode ?? null,
    timeToFirstEventMs: record.timeToFirstEventMs ?? null,
    timeToFirstOutputMs: record.timeToFirstOutputMs ?? null,
    downstreamBytes: record.downstreamBytes ?? null,
    terminationReason: record.terminationReason ?? null,
    errorCode: record.errorCode ?? null
  };
}

function normalizeInvocationAttempt(record: InvocationAttempt): InvocationAttempt {
  return {
    ...record,
    originSidecarTokenId: record.originSidecarTokenId ?? null,
    originSidecarInstanceId: record.originSidecarInstanceId ?? null,
    originSnapshotRevision: record.originSnapshotRevision ?? null,
    upstreamStatusCode: record.upstreamStatusCode ?? null,
    responseStatusCode: record.responseStatusCode ?? null,
    failoverReason: record.failoverReason ?? null,
    breakerState: record.breakerState ?? null,
    breakerKey: record.breakerKey ?? null,
    timeToFirstEventMs: record.timeToFirstEventMs ?? null,
    timeToFirstOutputMs: record.timeToFirstOutputMs ?? null,
    upstreamBytes: record.upstreamBytes ?? null,
    downstreamBytes: record.downstreamBytes ?? null,
    streamEventCount: record.streamEventCount ?? null,
    terminationReason: record.terminationReason ?? null,
    inputTokens: record.inputTokens ?? null,
    outputTokens: record.outputTokens ?? null,
    cachedTokens: record.cachedTokens ?? null,
    reasoningTokens: record.reasoningTokens ?? null,
    tokensPerSecond: record.tokensPerSecond ?? null,
    endpointCostNanoUSD: record.endpointCostNanoUSD ?? null,
    usageErrorCode: record.usageErrorCode ?? null,
    errorCode: record.errorCode ?? null
  };
}

function normalizeEndpoint(endpoint: EndpointResponse): Endpoint {
  const { driverConfigJson, ...normalizedEndpoint } = endpoint;
  return {
    ...normalizedEndpoint,
    groupId: Number(endpoint.groupId ?? 0),
    driverRef: endpoint.driverRef ?? '',
    driverConfig: normalizeDriverConfig(driverConfigJson),
    baseUrl: endpoint.baseUrl ?? '',
    credentialSlots: Array.isArray(endpoint.credentialSlots) ? endpoint.credentialSlots : [],
    models: Array.isArray(endpoint.models) ? endpoint.models.map(normalizeEndpointModel) : [],
    modelGroupNames: Array.isArray(endpoint.modelGroupNames) ? endpoint.modelGroupNames : [],
    lastUsedAt: endpoint.lastUsedAt ?? null,
    uptime: normalizeUptime(endpoint.uptime)
  };
}

function normalizeDriverConfig(driverConfigJSON: unknown): Record<string, unknown> {
	if (typeof driverConfigJSON !== 'string') return {};
	try {
		const parsed: unknown = JSON.parse(driverConfigJSON);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function normalizeDriverCatalogItem(item: DriverCatalogItem): DriverCatalogItem {
  return {
    ...item,
    alias: typeof item.alias === 'string' && item.alias.trim() ? item.alias.trim() : undefined,
    manifest: normalizeDriverManifest(item.manifest)
  };
}

function normalizeDriverProfile(profile: DriverProfile): DriverProfile {
  return {
    ...profile,
    artifactSizeBytes: Number(profile.artifactSizeBytes ?? 0),
    usedByEndpoints: Number(profile.usedByEndpoints ?? 0),
    manifest: normalizeDriverManifest(profile.manifest)
  };
}

function normalizeDriverManifest(manifest: DriverCatalogItem['manifest']): DriverCatalogItem['manifest'] {
  return {
    ...manifest,
    kind: manifest?.kind,
    text: manifest?.text ? {
      protocolContracts: Array.isArray(manifest.text.protocolContracts) ? manifest.text.protocolContracts : []
    } : undefined,
    image: manifest?.image ? {
      protocolContracts: Array.isArray(manifest.image.protocolContracts) ? manifest.image.protocolContracts : []
    } : undefined,
    managementCapabilities: Array.isArray(manifest?.managementCapabilities) ? manifest.managementCapabilities : [],
    credentialSchema: {
      slots: Array.isArray(manifest?.credentialSchema?.slots) ? manifest.credentialSchema.slots : []
    },
    requestedCapabilities: Array.isArray(manifest?.requestedCapabilities) ? manifest.requestedCapabilities : [],
    configSchemaJson: typeof manifest?.configSchemaJson === 'string' ? manifest.configSchemaJson : '{}'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEndpointModel(model: Partial<EndpointModel> & { id: string }): EndpointModel {
  const contracts = Array.isArray(model.imageProtocolContracts) ? model.imageProtocolContracts : [];
  const configuredLimits = Array.isArray(model.imageProtocolLimits) ? model.imageProtocolLimits : [];
  return {
    id: model.id,
    textFeatures: Array.isArray(model.textFeatures) ? model.textFeatures : [],
    imageProtocolContracts: contracts,
    imageProtocolLimits: contracts.map((contract) => {
      const configured = configuredLimits.find((limit) => limit?.contract === contract);
      return {
        contract,
        maxImagesPerRequest: positiveIntegerOrDefault(configured?.maxImagesPerRequest, 4),
        ...(contract === 'openai.images.edits/2026-07-19'
          ? { maxReferenceImages: positiveIntegerOrDefault(configured?.maxReferenceImages, 4) }
          : {})
      };
    }),
    inputPricePerMillion: typeof model.inputPricePerMillion === 'string' ? model.inputPricePerMillion : '0',
    outputPricePerMillion: typeof model.outputPricePerMillion === 'string' ? model.outputPricePerMillion : '0',
    cachePricePerMillion: typeof model.cachePricePerMillion === 'string' ? model.cachePricePerMillion : '0'
  };
}

function positiveIntegerOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeGroup(group: ModelGroupResponse): ModelGroup {
  const sidecarConfigMode = group.sidecarConfigMode;
  if (sidecarConfigMode !== 'full' && sidecarConfigMode !== 'reference') {
    throw new Error(`unknown sidecar config mode: ${String(sidecarConfigMode)}`);
  }
  const { uptime: _legacyUptime, ...groupWithoutLegacyUptime } = group as ModelGroupResponse & { uptime?: unknown };
  return {
    ...groupWithoutLegacyUptime,
    firstResponseTimeoutSeconds: positiveIntegerOrDefault(group.firstResponseTimeoutSeconds, 0) || null,
    effectiveFirstResponseTimeoutSeconds: positiveIntegerOrDefault(
      group.effectiveFirstResponseTimeoutSeconds,
      group.kind === 'text' ? 180 : 300
    ),
    inboundProtocolContracts: Array.isArray(group.inboundProtocolContracts) ? group.inboundProtocolContracts : [],
    routingMode: group.routingMode ?? 'tiered_failover',
    sidecarConfigMode,
    mappings: normalizeGroupMappings(Array.isArray(group.mappings) ? group.mappings : []),
    endpointTotal: Number(group.endpointTotal ?? 0),
    endpointAvailable: Number(group.endpointAvailable ?? 0)
  };
}

function normalizeSidecarSnapshot(value: unknown): SidecarSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid v1 sidecar snapshot');
  }
  const snapshot = value as Record<string, unknown>;
  if (snapshot.schemaVersion !== 1 || typeof snapshot.revision !== 'string') {
    throw new Error('invalid v1 sidecar snapshot identity');
  }
  for (const field of ['profiles', 'endpoints', 'groups', 'apiKeys'] as const) {
    if (!Array.isArray(snapshot[field])) throw new Error(`invalid v1 sidecar snapshot ${field}`);
  }
  const groups = snapshot.groups;
  if (!Array.isArray(groups)) throw new Error('invalid v1 sidecar snapshot groups');
  for (const value of groups) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid v1 sidecar snapshot group');
    }
    const group = value as Record<string, unknown>;
    if (group.sidecarConfigMode !== 'full' && group.sidecarConfigMode !== 'reference') {
      throw new Error(`unknown sidecar config mode: ${String(group.sidecarConfigMode)}`);
    }
    if (!Array.isArray(group.mappings)) {
      throw new Error(`invalid mappings for sidecar group ${String(group.name ?? group.id ?? '')}`);
    }
    if (group.sidecarConfigMode === 'reference' && group.mappings.length > 0) {
      throw new Error(`reference group ${String(group.name ?? group.id ?? '')} must not contain mappings`);
    }
  }
  return value as SidecarSnapshot;
}

function normalizeAPIKey(key: APIKeyResponse): APIKey {
  return {
    ...key,
    modelGroups: Array.isArray(key.modelGroups) ? key.modelGroups : []
  };
}

function normalizeSidecarToken(token: SidecarTokenResponse): SidecarToken {
  return {
    ...token,
    instanceCount: Number(token.instanceCount ?? 0),
    onlineInstanceCount: Number(token.onlineInstanceCount ?? 0),
    offlineInstanceCount: Number(token.offlineInstanceCount ?? 0),
    lastSeenAt: token.lastSeenAt ?? null,
    versions: Array.isArray(token.versions) ? token.versions : []
  };
}

function normalizeWorkspaceAccess(item: WorkspaceAccess): WorkspaceAccess {
  return {
    ...item,
    capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
    platformAdmin: Boolean(item.platformAdmin),
    role: item.role || 'viewer'
  };
}

function itemsOrEmpty<T>(items: T[] | null | undefined): T[] {
  return Array.isArray(items) ? items : [];
}

function appendAnalyticsRange(query: URLSearchParams, params: AnalyticsRangeParams) {
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
}

function parseJSON(text: string): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function notifyUnauthorized() {
  if (!unauthorizedHandler || unauthorizedHandlerInvoked) return;
  unauthorizedHandlerInvoked = true;
  try {
    void Promise.resolve(unauthorizedHandler()).catch(() => {});
  } catch {
    // The request must keep rejecting with the original API error.
  }
}

function readStorage(key: string): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage can be denied by browser privacy settings.
  }
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim();
    const separator = cookie.indexOf('=');
    if (separator >= 0 && cookie.slice(0, separator) === name) {
      return cookie.slice(separator + 1);
    }
  }
  return '';
}
