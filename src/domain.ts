import type {
  DriverCatalogItem,
  Endpoint,
  EndpointModel,
  ImageProtocolContract,
  InvocationAttempt,
  Locale,
  ModelGroup,
  ModelGroupMapping,
  ModelKind,
  TextFeature,
  Uptime,
  WorkspaceAccess,
  WorkspaceCapability
} from './types';
import { IMAGE_PROTOCOL_CONTRACTS } from './imageProtocols';

export function normalizeGroupMappings(mappings: ModelGroupMapping[]): ModelGroupMapping[] {
  return mappings.map((mapping, index) => {
    const tier = Number(mapping.tier);
    const weight = Number(mapping.weight);
    return {
      ...mapping,
      tier: Number.isFinite(tier) && tier >= 0 ? Math.floor(tier) : 0,
      weight: Number.isFinite(weight) && weight > 0 ? Math.min(10000, Math.floor(weight)) : 100,
      sortOrder: index + 1
    };
  });
}

export function routingTierLabel(tier: number, locale: Locale): string {
  if (tier <= 0) return locale === 'zh' ? '主用池' : 'Primary pool';
  if (locale === 'zh') {
    if (tier === 1) return '一级备选池';
    if (tier === 2) return '二级备选池';
    return `${tier}级备选池`;
  }
  if (tier === 1) return 'Backup pool';
  return `Backup tier ${tier}`;
}

export function hasWorkspaceCapability(
  access: Pick<WorkspaceAccess, 'capabilities' | 'platformAdmin'> | null | undefined,
  capability: WorkspaceCapability
): boolean {
  if (!access) return false;
  if (access.platformAdmin) return true;
  return Array.isArray(access.capabilities) && access.capabilities.includes(capability);
}

export function canManageWorkspaceMembers(
  access: Pick<WorkspaceAccess, 'capabilities' | 'platformAdmin'> | null | undefined
): boolean {
  return hasWorkspaceCapability(access, 'workspace_members:read')
    || hasWorkspaceCapability(access, 'workspace_members:write');
}

export function canWriteWorkspaceMembers(
  access: Pick<WorkspaceAccess, 'capabilities' | 'platformAdmin'> | null | undefined
): boolean {
  return hasWorkspaceCapability(access, 'workspace_members:write');
}

export function mergeEndpointModels(current: EndpointModel[], incoming: EndpointModel[]): EndpointModel[] {
  const existing = new Set(current.map((model) => model.id));
  return [...current, ...incoming.filter((model) => !existing.has(model.id))];
}

export function addEndpointModel(models: EndpointModel[], rawId: string, kind: ModelKind): EndpointModel[] {
  const id = rawId.trim();
  if (!id || models.some((model) => model.id === id)) return models;
  return [
    ...models,
    {
      id,
      textFeatures: kind === 'text' ? ['text'] : [],
      imageProtocolContracts: kind === 'image' ? [...IMAGE_PROTOCOL_CONTRACTS] : [],
      inputPricePerMillion: '0',
      outputPricePerMillion: '0',
      cachePricePerMillion: '0'
    }
  ];
}

export function endpointModelHasPricing(
  model: Pick<EndpointModel, 'inputPricePerMillion' | 'outputPricePerMillion' | 'cachePricePerMillion'>
): boolean {
  return [model.inputPricePerMillion, model.outputPricePerMillion, model.cachePricePerMillion]
    .some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

export function updateEndpointModel(
  models: EndpointModel[],
  id: string,
  patch: Partial<Omit<EndpointModel, 'id'>>
): EndpointModel[] {
  let changed = false;
  const next = models.map((model) => {
    if (model.id !== id) return model;
    const updated = {
      ...model,
      ...patch,
      id: model.id,
      inputPricePerMillion: String(patch.inputPricePerMillion ?? model.inputPricePerMillion),
      outputPricePerMillion: String(patch.outputPricePerMillion ?? model.outputPricePerMillion),
      cachePricePerMillion: String(patch.cachePricePerMillion ?? model.cachePricePerMillion)
    };
    if (
      updated.textFeatures === model.textFeatures
      && updated.imageProtocolContracts === model.imageProtocolContracts
      && updated.inputPricePerMillion === model.inputPricePerMillion
      && updated.outputPricePerMillion === model.outputPricePerMillion
      && updated.cachePricePerMillion === model.cachePricePerMillion
    ) {
      return model;
    }
    changed = true;
    return {
      ...updated,
      inputPricePerMillion: positivePriceOrZero(updated.inputPricePerMillion),
      outputPricePerMillion: positivePriceOrZero(updated.outputPricePerMillion),
      cachePricePerMillion: positivePriceOrZero(updated.cachePricePerMillion)
    };
  });
  return changed ? next : models;
}

export function removeEndpointModel(models: EndpointModel[], id: string): EndpointModel[] {
  return models.filter((model) => model.id !== id);
}

function positivePriceOrZero(value: string): string {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? value : '0';
}

export function filterDriversByKind(catalog: DriverCatalogItem[], kind: ModelKind): DriverCatalogItem[] {
  return catalog.filter((driver) => driver.manifest.kind === kind);
}

export interface EndpointKindDependentDraft {
  kind: ModelKind;
  driverRef: string;
  driverConfig: Record<string, unknown>;
  driverConfigText: string;
  credentials: Record<string, string>;
  models: EndpointModel[];
}

export function changeEndpointDraftKind<T extends EndpointKindDependentDraft>(draft: T, kind: ModelKind): T {
  if (draft.kind === kind) return draft;
  return {
    ...draft,
    kind,
    driverRef: '',
    driverConfig: {},
    driverConfigText: '{}',
    credentials: {},
    models: []
  };
}

export function driverConfigDefaults(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
  const properties = (schema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  const defaults: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'default' in value) {
      defaults[name] = (value as { default?: unknown }).default;
    }
  }
  return defaults;
}

export function parseDriverConfigSchema(schemaJSON: string): unknown {
  try {
    return JSON.parse(schemaJSON || '{}');
  } catch {
    return {};
  }
}

export interface EndpointCompatibility {
  compatible: boolean;
  driverFound: boolean;
  reasons: Array<'driver_missing' | 'driver_kind' | 'driver_protocol' | 'invocation'>;
}

export function endpointModelCompatibility(
  endpoint: Endpoint,
  model: EndpointModel,
  group: Pick<ModelGroup, 'kind' | 'inboundProtocolContracts'>,
  catalog: DriverCatalogItem[]
): EndpointCompatibility {
  const driver = catalog.find((item) => item.ref === endpoint.driverRef);
  if (!driver) return { compatible: false, driverFound: false, reasons: ['driver_missing'] };
  const reasons: EndpointCompatibility['reasons'] = [];
  if (endpoint.kind !== group.kind || driver.manifest.kind !== endpoint.kind) reasons.push('driver_kind');
  if (group.kind === 'text') {
    const supported = driver.manifest.text?.protocolContracts ?? [];
    if ((group.inboundProtocolContracts as import('./types').TextProtocolContract[])
      .some((contract) => !supported.includes(contract))) reasons.push('driver_protocol');
  } else if (group.kind === 'image') {
    const required = group.inboundProtocolContracts as ImageProtocolContract[];
    const driverContracts = driver.manifest.image?.protocolContracts ?? [];
    if (required.some((contract) => !driverContracts.includes(contract))
      || required.some((contract) => !model.imageProtocolContracts.includes(contract))) {
      reasons.push('invocation');
    }
  }
  return { compatible: reasons.length === 0, driverFound: true, reasons };
}

export function modelUsageGroups(endpointId: number, modelId: string, groups: ModelGroup[], kind?: ModelKind): string[] {
  return groups
    .filter((group) =>
      (kind == null || group.kind === kind)
      && group.mappings.some((mapping) => mapping.endpointId === endpointId && mapping.modelId === modelId)
    )
    .map((group) => group.name);
}

export type UptimeTone = 'good' | 'warning' | 'danger';

export function uptimeTone(percentage: number): UptimeTone {
  if (percentage >= 98) return 'good';
  if (percentage >= 95) return 'warning';
  return 'danger';
}

export function uptimePercentage(available: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(available) || available <= 0) return 0;
  return Math.min(100, Math.max(0, (available * 100) / total));
}

export function normalizeUptime(uptime?: Partial<Uptime> | null): Uptime {
  const available = Number(uptime?.available ?? 0);
  const total = Number(uptime?.total ?? 0);
  return {
    available,
    total,
    percentage: uptimePercentage(available, total)
  };
}

export interface EndpointInsightRow {
  endpointId: number;
  endpointName: string;
  kind: ModelKind;
  modelId: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachePricePerMillion: number;
  averageLatencyMS: number | null;
  averageTPS: number | null;
  callCount: number;
  uptime: Uptime;
}

export function endpointInsightRows(endpoints: Endpoint[], records: InvocationAttempt[], kind: ModelKind): EndpointInsightRow[] {
  return endpoints
    .filter((endpoint) => endpoint.kind === kind)
    .map((endpoint) => {
      const model = endpoint.models[0];
      if (!model) return null;
      const endpointRecords = records.filter((record) => record.endpointId === endpoint.id && record.kind === kind);
      const available = endpointRecords.filter((record) => record.available).length;
      const total = endpointRecords.length;
      return {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        kind,
        modelId: model.id,
        inputPricePerMillion: Number(model.inputPricePerMillion ?? '0'),
        outputPricePerMillion: Number(model.outputPricePerMillion ?? '0'),
        cachePricePerMillion: Number(model.cachePricePerMillion ?? '0'),
        averageLatencyMS: averageKnown(endpointRecords.map((record) => record.durationMs)),
        averageTPS: averageKnown(endpointRecords.map((record) => record.tokensPerSecond)),
        callCount: endpointRecords.length,
        uptime: { available, total, percentage: uptimePercentage(available, total) }
      };
    })
    .filter((row): row is EndpointInsightRow => row != null)
    .sort((left, right) => right.uptime.percentage - left.uptime.percentage || left.endpointName.localeCompare(right.endpointName));
}

function averageKnown(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}
