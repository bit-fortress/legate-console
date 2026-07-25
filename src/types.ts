export type ThemeName = 'system' | 'dark' | 'light';
export type Locale = 'zh' | 'en';

export type WorkspaceStatus = 'active' | 'disabled';
export type WorkspaceRole = 'admin' | 'viewer' | 'usage_viewer';
export type EndpointStatus = 'enabled' | 'disabled' | 'error';
export type ModelGroupStatus = 'normal' | 'disabled';
export type SidecarConfigMode = 'full' | 'reference';
export type ModelKind = 'text' | 'image' | 'video';
export type RoutingMode = 'tiered_failover';
export type DriverSource = 'builtin' | 'profile';
export type DriverRuntimeKind = 'builtin' | 'wasm';
export type InvocationMode = 'buffered' | 'sse';
export type TextProtocolContract =
  | 'openai.chat_completions/2026-07-18'
  | 'openai.responses/2026-07-18'
  | 'anthropic.messages/2026-07-18';
export type ImageProtocolContract =
  | 'openai.images.generations/2026-07-19'
  | 'openai.images.edits/2026-07-19';
export type InboundProtocolContract = TextProtocolContract | ImageProtocolContract;
export type StreamStatus =
  | 'completed'
  | 'failed_before_commit'
  | 'partial_failure'
  | 'client_cancelled'
  | 'timeout'
  | 'idle_timeout'
  | 'downstream_write_failed';
export type UsageStatus = 'final' | 'partial' | 'unavailable';
export type UsageProvenance = 'upstream_reported' | 'driver_accumulated';
export type InvocationOutcome =
  | 'success'
  | 'client_error'
  | 'auth_error'
  | 'routing_error'
  | 'capacity_error'
  | 'upstream_error'
  | 'timeout'
  | 'canceled'
  | 'internal_error';
export type TextFeature =
  | 'text'
  | 'image_input'
  | 'function_tools'
  | 'parallel_tool_calls'
  | 'json_schema_output'
  | 'reasoning_effort'
  | 'reasoning_summary'
  | 'reasoning_content'
  | 'reasoning_encrypted'
  | 'sse'
  | 'reasoning_budget'
  | 'stop_sequences'
  | 'stop_sequence_result'
  | 'early_input_usage';
export type APIKeyStatus = 'enabled' | 'disabled';
export type SidecarTokenStatus = 'enabled' | 'disabled';
export type AdminUserStatus = 'invited' | 'active' | 'suspended';
export type AdminInvitationStatus = '' | 'pending' | 'claimed' | 'expired' | 'cancelled';
export type AdminIdentityStatus = 'active' | 'disabled';

export interface AdminPrincipal {
  userId: number;
  email: string;
  displayName: string;
  platformAdmin: boolean;
}

export interface AdminUser {
  userId: number;
  email: string;
  displayName: string;
  status: AdminUserStatus;
  invitationStatus?: AdminInvitationStatus;
  platformAdmin: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInvitation {
  invitationId: number;
  providerId: string;
  status: Exclude<AdminInvitationStatus, ''>;
  expiresAt: string;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
  invitations: AdminInvitation[];
}

export interface AdminIdentity {
  identityId: number;
  providerId: string;
  issuer: string;
  subject: string;
  emailAtLink: string;
  status: AdminIdentityStatus;
  lastLoginAt?: string | null;
}

export type WorkspaceCapability =
  | 'workspace:read'
  | 'workspace_members:read'
  | 'workspace_members:write'
  | 'endpoints:read'
  | 'endpoints:write'
  | 'endpoint_drivers:read'
  | 'endpoint_drivers:write'
  | 'model_groups:read'
  | 'model_groups:write'
  | 'api_keys:read'
  | 'api_keys:write'
  | 'sidecar_tokens:read'
  | 'sidecar_tokens:write'
  | 'analytics:read'
  | string;

export interface Workspace {
  id: number;
  slug: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceAccess {
  id: number;
  slug: string;
  name: string;
  status: WorkspaceStatus;
  role: WorkspaceRole;
  platformAdmin: boolean;
  capabilities: WorkspaceCapability[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: number;
  userId: number;
  email: string;
  displayName: string;
  userStatus: AdminUserStatus;
  role: WorkspaceRole;
  invitationStatus: AdminInvitationStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberResolution {
  userId: number;
  email: string;
  displayName: string;
  status: AdminUserStatus;
}

export interface EndpointModel {
  id: string;
  textFeatures: TextFeature[];
  imageProtocolContracts: ImageProtocolContract[];
  imageProtocolLimits: ImageProtocolLimit[];
  inputPricePerMillion: string;
  outputPricePerMillion: string;
  cachePricePerMillion: string;
}

export interface ImageProtocolLimit {
  contract: ImageProtocolContract;
  maxImagesPerRequest: number;
  maxReferenceImages?: number;
}

export interface DriverCredentialSlot {
  name: string;
  required: boolean;
}

export interface DriverTextCapabilities {
  protocolContracts: TextProtocolContract[];
}

export interface DriverImageCapabilities {
  protocolContracts: ImageProtocolContract[];
}

export interface DriverManifest {
  id: string;
  displayName: string;
  version: string;
  kind: ModelKind;
  text?: DriverTextCapabilities;
  image?: DriverImageCapabilities;
  managementCapabilities: string[];
  configSchemaJson: string;
  credentialSchema: {
    slots: DriverCredentialSlot[];
  };
  requestedCapabilities: string[];
  artifactDigest?: string;
  wireAbiVersion?: string;
}

export interface DriverUploadManifest {
  id: string;
  displayName: string;
  version: string;
  kind: ModelKind;
  wireAbiVersion: string;
  text?: DriverTextCapabilities;
  image?: DriverImageCapabilities;
  managementCapabilities: string[];
  configSchema: unknown;
  credentialSchema: {
    slots: DriverCredentialSlot[];
  };
  requestedCapabilities: string[];
}

export interface DriverCatalogItem {
  ref: string;
  alias?: string;
  source: DriverSource;
  runtimeKind: DriverRuntimeKind;
  manifest: DriverManifest;
  profileId?: number;
  artifactSizeBytes?: number;
  createdAt?: string;
  uploadedBy?: DriverUploader;
}

export interface DriverUploader {
  userId: number;
  displayName: string;
}

export interface DriverProfile {
  id: number;
  ref: string;
  name: string;
  artifactDigest: string;
  artifactSizeBytes: number;
  manifest: DriverManifest;
  usedByEndpoints: number;
  createdAt: string;
  uploadedBy: DriverUploader;
}

export interface EndpointCredentialSlotStatus {
  name: string;
  configured: boolean;
}

export interface Uptime {
  available: number;
  total: number;
  percentage: number;
}

export interface EndpointGroup {
  id: number;
  workspaceId: number;
  name: string;
  remark: string;
  sortOrder: number;
  endpointCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Endpoint {
  id: number;
  workspaceId: number;
  groupId: number;
  name: string;
  remark: string;
  kind: ModelKind;
  status: EndpointStatus;
  scheduleEnabled: boolean;
  driverRef: string;
  driverConfig: Record<string, unknown>;
  baseUrl: string;
  credentialSlots: EndpointCredentialSlotStatus[];
  models: EndpointModel[];
  modelGroupNames: string[];
  uptime: Uptime;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelGroupMapping {
  id?: number;
  groupId?: number;
  endpointId: number;
  modelId: string;
  tier?: number;
  weight?: number;
  sortOrder?: number;
}

export interface ModelGroup {
  id: number;
  workspaceId?: number;
  name: string;
  kind: ModelKind;
  description: string;
  status: ModelGroupStatus;
  firstResponseTimeoutSeconds: number | null;
  effectiveFirstResponseTimeoutSeconds: number;
  routingMode: RoutingMode;
  sidecarConfigMode: SidecarConfigMode;
  inboundProtocolContracts: InboundProtocolContract[];
  mappings: ModelGroupMapping[];
  endpointTotal: number;
  endpointAvailable: number;
  uptime: Uptime;
  createdAt: string;
  updatedAt: string;
}

export interface APIKeyModelGroup {
  groupId: number;
  groupName: string;
  kind: ModelKind;
}

export interface APIKey {
  id: number;
  workspaceId?: number;
  name: string;
  remark: string;
  status: APIKeyStatus;
  prefix: string;
  suffix: string;
  key?: string;
  modelGroups: APIKeyModelGroup[];
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface APIKeyCreateResult extends APIKey {
  key: string;
}

export interface SidecarToken {
  id: number;
  workspaceId?: number;
  name: string;
  remark: string;
  status: SidecarTokenStatus;
  prefix: string;
  suffix: string;
  key?: string;
  instanceCount: number;
  onlineInstanceCount: number;
  offlineInstanceCount: number;
  lastSeenAt: string | null;
  versions: SidecarVersionSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface SidecarVersionSummary {
  version: string;
  instanceCount: number;
  onlineInstanceCount: number;
}

export interface SidecarInstance {
  id: number;
  tokenId: number;
  tokenName: string;
  instanceId: string;
  hostname: string;
  sidecarVersion: string;
  syncIntervalSeconds: number;
  online: boolean;
  lastSeenAt: string;
  lastPullAt: string | null;
  lastPullSuccess: boolean | null;
  lastPullError: string;
  appliedSnapshotSchemaVersion: number;
  appliedSnapshotRevision: string;
  createdAt: string;
  updatedAt: string;
}

export interface SidecarInstanceTelemetry {
  incarnation: number;
  sessionId: string;
  generation: number;
  sessionStartedAt: string;
  lastReportedAt: string | null;
  coveredThrough: string | null;
  queueDepth: number | null;
  oldestQueuedAt: string | null;
  droppedEventCount: number | null;
  dropCounterSaturated: boolean | null;
}

export interface SidecarInstanceDetail extends SidecarInstance {
  telemetry: SidecarInstanceTelemetry | null;
}

export interface SidecarInstanceQuery {
  tokenId?: number;
  online?: boolean;
  version?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface SidecarInstancePage {
  items: SidecarInstance[];
  total: number;
  limit: number;
  offset: number;
}

export interface SidecarTokenCreateResult extends SidecarToken {
  key: string;
}

export type InvocationRequestRole = 'origin' | 'internal_forward';
export type InvocationExecutionLocation = 'central' | 'sidecar';
export type TelemetrySourceKind = 'central' | 'sidecar';
export type InvocationProtocol = 'openai' | 'anthropic';
export type InvocationOperation = 'chat.completions' | 'responses' | 'messages' | 'images.generate' | 'images.edit';

export interface InvocationKind {
  protocol: InvocationProtocol;
  operation: InvocationOperation;
}

export interface InvocationRequest {
  eventId: string;
  rootRequestId: string;
  requestId: string;
  parentRequestId: string | null;
  workspaceId: number;
  apiKeyId: number;
  groupId: number;
  groupName: string;
  kind: ModelKind;
  invocation: InvocationKind;
  mode: InvocationMode;
  requestPath: string;
  role: InvocationRequestRole;
  entryLocation: InvocationExecutionLocation;
  executionLocation: InvocationExecutionLocation;
  originSidecarTokenId: number | null;
  originSidecarInstanceId: string | null;
  originSnapshotRevision: string | null;
  startedAt: string;
  durationMs: number;
  responseStatusCode: number | null;
  outcome: InvocationOutcome;
  streamStatus: StreamStatus;
  responseCommitted: boolean;
  timeToFirstEventMs: number | null;
  timeToFirstOutputMs: number | null;
  downstreamBytes: number | null;
  terminationReason: string | null;
  errorCode: string | null;
}

export interface InvocationAttempt {
  eventId: string;
  rootRequestId: string;
  requestId: string;
  workspaceId: number;
  apiKeyId: number;
  groupId: number;
  groupName: string;
  kind: ModelKind;
  invocation: InvocationKind;
  mode: InvocationMode;
  requestPath: string;
  executionLocation: InvocationExecutionLocation;
  originSidecarTokenId: number | null;
  originSidecarInstanceId: string | null;
  originSnapshotRevision: string | null;
  startedAt: string;
  durationMs: number;
  endpointId: number;
  endpointName: string;
  upstreamModelId: string;
  upstreamStatusCode: number | null;
  responseStatusCode: number | null;
  outcome: InvocationOutcome;
  available: boolean;
  retryable: boolean;
  final: boolean;
  routingMode: RoutingMode;
  routingTier: number;
  mappingWeight: number;
  attemptIndex: number;
  failoverReason: string | null;
  breakerState: string | null;
  breakerKey: string | null;
  streamStatus: StreamStatus;
  responseCommitted: boolean;
  timeToFirstEventMs: number | null;
  timeToFirstOutputMs: number | null;
  upstreamBytes: number | null;
  downstreamBytes: number | null;
  streamEventCount: number | null;
  terminationReason: string | null;
  usageStatus: UsageStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  tokensPerSecond: number | null;
  endpointCostNanoUSD: string | null;
  usageProvenance: UsageProvenance;
  usageErrorCode: string | null;
  driverRef: string;
  driverRuntimeKind: DriverRuntimeKind;
  errorCode: string | null;
}

export interface InvocationOutcomeCounts {
  success: number;
  clientError: number;
  authError: number;
  routingError: number;
  capacityError: number;
  upstreamError: number;
  timeout: number;
  canceled: number;
  internalError: number;
}

export interface InvocationAnalyticsCoverageTrack {
  reporting: boolean;
  coverageStartedAt: string | null;
  coveredThrough: string | null;
  coverageGap: boolean;
  watermarkMissing: boolean;
  windowClosed: boolean;
  pendingQueue: boolean;
  pendingInFlight: boolean;
  knownLoss: boolean;
  knownDroppedEventCount: number;
  dropCounterSaturated: boolean;
  knownDroppedEventCountSaturated: boolean;
}

export interface InvocationAnalyticsSourceIdentity {
  kind: TelemetrySourceKind;
  centralInstanceId: string | null;
  sidecarTokenId: number | null;
  sidecarInstanceId: string | null;
}

export interface InvocationAnalyticsSourceCompleteness {
  source: InvocationAnalyticsSourceIdentity;
  expected: boolean;
  active: boolean;
  stale: boolean;
  currentSessionPresent: boolean;
  workspaceTrack: InvocationAnalyticsCoverageTrack;
  sourceGlobalTrack: InvocationAnalyticsCoverageTrack | null;
  coverageStartedAt: string | null;
  coveredThrough: string | null;
  knownLoss: boolean;
  unknownLoss: boolean;
  knownDroppedEventCount: number;
  dropCounterSaturated: boolean;
  knownDroppedEventCountSaturated: boolean;
  complete: boolean;
}

export interface InvocationAnalyticsCompleteness {
  complete: boolean;
  coverageStartedAt: string | null;
  coveredThrough: string | null;
  expectedSourceCount: number;
  reportingSourceCount: number;
  completeSourceCount: number;
  missingCurrentSessionSourceCount: number;
  inactiveSourceCount: number;
  staleSourceCount: number;
  coverageGapSourceCount: number;
  watermarkMissingSourceCount: number;
  pendingQueueSourceCount: number;
  pendingInFlightSourceCount: number;
  knownLossSourceCount: number;
  unknownLossSourceCount: number;
  saturatedSourceCount: number;
  knownDroppedEventCount: number;
  dropCounterSaturated: boolean;
  knownDroppedEventCountSaturated: boolean;
  sources: InvocationAnalyticsSourceCompleteness[];
}

export interface InvocationAnalyticsSummary {
  window: { from: string; to: string };
  requests: {
    count: number;
    successfulCount: number;
    failedCount: number;
    outcomes: InvocationOutcomeCounts;
    averageDurationMs: number | null;
  };
  attempts: {
    count: number;
    successfulCount: number;
    failedCount: number;
    outcomes: InvocationOutcomeCounts;
    availableCount: number;
    unavailableCount: number;
    retryableCount: number;
    retriedCount: number;
    finalCount: number;
    committedCount: number;
    usage: {
      knownInputTokens: number | null;
      knownOutputTokens: number | null;
      knownCachedTokens: number | null;
      knownReasoningTokens: number | null;
      finalAttemptCount: number;
      partialAttemptCount: number;
      unavailableAttemptCount: number;
    };
    cost: {
      knownEndpointCostNanoUSD: string;
      knownAttemptCount: number;
      unknownAttemptCount: number;
    };
    averageDurationMs: number | null;
    averageTimeToFirstEventMs: number | null;
    averageTimeToFirstOutputMs: number | null;
  };
  completeness: InvocationAnalyticsCompleteness;
}

export interface InvocationRequestPage {
  items: InvocationRequest[];
  nextCursor: string | null;
}

export interface InvocationAttemptPage {
  items: InvocationAttempt[];
  nextCursor: string | null;
}

export interface SidecarSnapshot {
  schemaVersion: number;
  revision: string;
  profiles: SidecarSnapshotProfile[];
  endpoints: SidecarSnapshotEndpoint[];
  groups: SidecarSnapshotModelGroup[];
  apiKeys: unknown[];
}

export interface SidecarSnapshotProfile {
  ref: string;
  manifest: {
    displayName: string;
    runtimeKind: string;
  };
  artifact: {
    digest: string;
    mediaType: string;
    sizeBytes: number;
  };
}

export interface SidecarSnapshotEndpoint {
  id: number;
  name: string;
  kind: ModelKind;
  status: EndpointStatus;
  driverRef: string;
  driverConfig: Record<string, unknown>;
  scheduleEnabled: boolean;
  baseUrl: string;
  credentials: Record<string, string>;
  models: EndpointModel[];
}

export interface SidecarSnapshotModelGroup {
  id: number;
  name: string;
  sidecarConfigMode: SidecarConfigMode;
  mappings: ModelGroupMapping[];
}
