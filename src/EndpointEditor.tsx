import { useMemo, useState } from 'react';
import { CircleAlert, Code2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { CreateEndpointPayload, DiscoverEndpointModelsPayload } from './api';
import anthropicMark from './assets/anthropic-mark.svg';
import openAIMark from './assets/openai-mark.svg';
import type {
  DriverCatalogItem,
  Endpoint,
  EndpointGroup,
  EndpointModel,
  ImageProtocolContract,
  ModelKind
} from './types';
import ImageProtocolSelector from './ImageProtocolSelector';
import {
  addEndpointModel,
  changeEndpointDraftKind,
  driverConfigDefaults,
	endpointModelHasPricing,
  filterDriversByKind,
	mergeEndpointModels,
  parseDriverConfigSchema,
	removeEndpointModel,
	updateEndpointModel
} from './domain';
import { DriverConfigForm } from './DriverConfigForm';
import { SelectField } from './SelectControl';
import { validateDriverConfigAgainstSchema, type DriverConfigValidationIssue } from './driverConfigSchema';

export type TextEndpointType = '' | 'openai_chat' | 'openai_responses' | 'anthropic_messages' | 'custom';

const BUILTIN_TEXT_DRIVER_REFS: Record<Exclude<TextEndpointType, '' | 'custom'>, string> = {
  openai_chat: 'builtin://openai-chat-compatible@1',
  openai_responses: 'builtin://openai-responses-compatible@1',
  anthropic_messages: 'builtin://anthropic@1'
};

const DEFAULT_CREDENTIAL_SLOTS = [{ name: 'api_key', required: false }] as const;

export interface EndpointEditorLabels {
  createTitle: string;
  editTitle: string;
  group: string;
  kind: string;
  name: string;
  remark: string;
  schedule: string;
  baseUrl: string;
  endpointType: string;
  selectEndpointType: string;
  driver: string;
  selectDriver: string;
  noDrivers: string;
  credentials: string;
  credentialConfigured: string;
  credentialOptional: string;
  credentialPreserve: string;
  credentialNotRequired: string;
  models: string;
  imageProtocols: string;
  modelId: string;
  addModel: string;
  syncModels: string;
  syncingModels: string;
  syncModelsFailed: string;
  syncModelsEmpty: string;
  removeModel: string;
  pricing: string;
  pricingUnconfigured: string;
  inputPrice: string;
  outputPrice: string;
  cachePrice: string;
  priceUnit: string;
  applyPricing: string;
  invalidPrice: string;
  cancel: string;
  save: string;
  required: string;
  invalidConfig: string;
  changeDriverConfirm: string;
  kinds: Record<ModelKind, string>;
  textEndpointTypes: Record<Exclude<TextEndpointType, ''>, string>;
  driverConfig: string;
  driverConfigEmpty: string;
  driverConfigAdvanced: string;
  driverConfigUnsupported: string;
  invalidNumber: string;
}

export interface EndpointEditorSubmission extends CreateEndpointPayload {
  id?: number;
}

export interface EndpointDetailLabels {
  group: string;
  kind: string;
  status: string;
  baseUrl: string;
  driver: string;
  credentials: string;
  credentialConfigured: string;
  credentialMissing: string;
  models: string;
  updatedAt: string;
  empty: string;
  kinds: Record<ModelKind, string>;
  statuses: Record<Endpoint['status'], string>;
  formatDate: (value: string) => string;
}

export function EndpointDetail({
  endpoint,
  group,
  driver,
  labels
}: {
  endpoint: Endpoint;
  group?: EndpointGroup;
  driver?: DriverCatalogItem;
  labels: EndpointDetailLabels;
}) {
  return (
    <div className="endpoint-detail">
      <dl className="endpoint-detail-grid">
        <DetailField label={labels.group} value={group?.name ?? labels.empty} />
        <DetailField label={labels.kind} value={labels.kinds[endpoint.kind]} />
        <DetailField label={labels.status} value={labels.statuses[endpoint.status]} />
        <DetailField label={labels.baseUrl} value={endpoint.baseUrl || labels.empty} code wide />
        <DetailField
          label={labels.driver}
          value={driver?.alias || driver?.manifest.displayName || endpoint.driverRef || labels.empty}
          secondary={endpoint.driverRef}
          code
          wide
        />
        <div className="endpoint-detail-field endpoint-detail-wide">
          <dt>{labels.credentials}</dt>
          <dd className="endpoint-detail-tags">
            {endpoint.credentialSlots.length === 0 && <span>{labels.empty}</span>}
            {endpoint.credentialSlots.map((slot) => (
              <span key={slot.name} data-configured={slot.configured}>
                {slot.name}: {slot.configured ? labels.credentialConfigured : labels.credentialMissing}
              </span>
            ))}
          </dd>
        </div>
        <div className="endpoint-detail-field endpoint-detail-wide">
          <dt>{labels.models}</dt>
          <dd className="endpoint-detail-models">
            {endpoint.models.length === 0 && <span>{labels.empty}</span>}
            {endpoint.models.map((model) => <code key={model.id}>{model.id}</code>)}
          </dd>
        </div>
        <DetailField label={labels.updatedAt} value={labels.formatDate(endpoint.updatedAt)} wide />
      </dl>
    </div>
  );
}

interface EndpointEditorProps {
  group: EndpointGroup;
  groups: readonly EndpointGroup[];
  drivers: readonly DriverCatalogItem[];
  endpoint?: Endpoint;
  labels: EndpointEditorLabels;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (submission: EndpointEditorSubmission) => void | Promise<void>;
  onDiscoverModels?: (payload: DiscoverEndpointModelsPayload) => Promise<string[]>;
  onToast?: (tone: 'success' | 'error' | 'info', message: string) => void;
  confirmDriverChange?: () => boolean;
}

interface EndpointEditorDraft extends CreateEndpointPayload {
  id?: number;
  textEndpointType: TextEndpointType;
  driverConfigText: string;
}

export default function EndpointEditor({
  group,
  groups,
  drivers,
  endpoint,
  labels,
  busy = false,
  onCancel,
  onSubmit,
  onDiscoverModels = async () => [],
  onToast = () => undefined,
  confirmDriverChange = () => window.confirm(labels.changeDriverConfirm)
}: EndpointEditorProps) {
  const editing = Boolean(endpoint);
  const [draft, setDraft] = useState<EndpointEditorDraft>(() => draftFromEndpoint(group, endpoint));
  const [modelInput, setModelInput] = useState('');
  const [validationIssue, setValidationIssue] = useState<DriverConfigValidationIssue | null>(null);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [modelDiscoveryMessage, setModelDiscoveryMessage] = useState('');
  const [pricingModelID, setPricingModelID] = useState<string | null>(null);
  const [pricingDraft, setPricingDraft] = useState({ input: '', output: '', cache: '' });
  const [pricingError, setPricingError] = useState('');
  const compatibleDrivers = useMemo(
    () => draft.kind === 'text'
      ? drivers.filter((driver) => driver.manifest.kind === 'text' && driver.runtimeKind === 'wasm')
      : filterDriversByKind([...drivers], draft.kind),
    [drivers, draft.kind]
  );
  const selectedDriver = drivers.find((driver) => driver.ref === draft.driverRef);
  const configSchema = parseDriverConfigSchema(selectedDriver?.manifest.configSchemaJson ?? '{}');
  const credentialSlots = selectedDriver
    ? selectedDriver.manifest.credentialSchema.slots
    : endpoint?.credentialSlots.length
      ? endpoint.credentialSlots.map((slot) => ({ name: slot.name, required: false }))
      : DEFAULT_CREDENTIAL_SLOTS;

  function setKind(kind: ModelKind) {
    if (editing) return;
    setDraft((current) => ({
      ...changeEndpointDraftKind(current, kind),
      textEndpointType: '',
      credentials: current.credentials
    }));
    setValidationIssue(null);
  }

  function setTextEndpointType(textEndpointType: TextEndpointType) {
    if (!textEndpointType || textEndpointType === draft.textEndpointType) return;
    const driverRef = textEndpointType === 'custom' ? '' : BUILTIN_TEXT_DRIVER_REFS[textEndpointType];
    if (
      driverRef !== draft.driverRef
      && draft.driverRef
      && (editing || endpointDraftHasDriverState(draft))
      && !confirmDriverChange()
    ) return;
    const driver = drivers.find((item) => item.ref === driverRef);
    const driverConfig = driverConfigDefaults(parseDriverConfigSchema(driver?.manifest.configSchemaJson ?? '{}'));
    setDraft((current) => ({
      ...current,
      textEndpointType,
      driverRef,
      driverConfig,
      driverConfigText: JSON.stringify(driverConfig, null, 2),
      credentials: retainCredentialValues(current.credentials, driver?.manifest.credentialSchema.slots)
    }));
    setValidationIssue(null);
  }

  function setDriver(driverRef: string) {
    if (driverRef === draft.driverRef) return;
    if (draft.driverRef && (editing || endpointDraftHasDriverState(draft)) && !confirmDriverChange()) return;
    const driver = compatibleDrivers.find((item) => item.ref === driverRef);
    const driverConfig = driverConfigDefaults(parseDriverConfigSchema(driver?.manifest.configSchemaJson ?? '{}'));
    setDraft((current) => ({
      ...current,
      driverRef,
      driverConfig,
      driverConfigText: JSON.stringify(driverConfig, null, 2),
      credentials: retainCredentialValues(current.credentials, driver?.manifest.credentialSchema.slots)
    }));
    setValidationIssue(null);
  }

  function addModel() {
    const next = addEndpointModel(draft.models, modelInput, draft.kind);
    if (next === draft.models) return;
    setDraft((current) => ({ ...current, models: next }));
    setModelInput('');
  }

  async function syncModels() {
    if (!draft.baseUrl.trim() || !draft.driverRef || discoveringModels) return;
    setDiscoveringModels(true);
    setModelDiscoveryMessage('');
    try {
      const ids = await onDiscoverModels({
        endpointId: draft.id,
        kind: draft.kind,
        driverRef: draft.driverRef,
        driverConfig: draft.driverConfig,
        baseUrl: draft.baseUrl.trim(),
        credentials: draft.credentials
      });
      const discovered = ids.reduce<EndpointModel[]>(
        (models, id) => addEndpointModel(models, id, draft.kind),
        []
      );
      setDraft((current) => ({ ...current, models: mergeEndpointModels(current.models, discovered) }));
      if (ids.length === 0) setModelDiscoveryMessage(labels.syncModelsEmpty);
    } catch {
      onToast('error', labels.syncModelsFailed);
    } finally {
      setDiscoveringModels(false);
    }
  }

  function openPricing(model: EndpointModel) {
    setPricingModelID((current) => current === model.id ? null : model.id);
    setPricingDraft({
      input: model.inputPricePerMillion,
      output: model.outputPricePerMillion,
      cache: model.cachePricePerMillion
    });
    setPricingError('');
  }

  function applyPricing() {
    if (!pricingModelID) return;
    const values = [pricingDraft.input, pricingDraft.output, pricingDraft.cache];
    if (!values.every(validPrice)) {
      setPricingError(labels.invalidPrice);
      return;
    }
    setDraft((current) => ({
      ...current,
      models: updateEndpointModel(current.models, pricingModelID, {
        inputPricePerMillion: pricingDraft.input,
        outputPricePerMillion: pricingDraft.output,
        cachePricePerMillion: pricingDraft.cache
      })
    }));
    setPricingModelID(null);
    setPricingError('');
  }

  async function submit() {
    if (!draft.name.trim() || !draft.baseUrl.trim() || !draft.driverRef) return;
    const issue = validateDriverConfigAgainstSchema(configSchema, draft.driverConfig);
    setValidationIssue(issue);
    if (issue) return;
    await onSubmit({
      id: draft.id,
      groupId: draft.groupId,
      kind: draft.kind,
      name: draft.name.trim(),
      remark: draft.remark.trim(),
      scheduleEnabled: draft.scheduleEnabled,
      driverRef: draft.driverRef,
      driverConfig: draft.driverConfig,
      baseUrl: draft.baseUrl.trim(),
      credentials: draft.credentials,
      models: draft.models
    });
  }

  return (
    <form className="endpoint-editor" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="endpoint-editor-scroll">
        <div className="endpoint-editor-grid endpoint-editor-identity">
          <TextField
            label={labels.name}
            className="endpoint-editor-name"
            value={draft.name}
            required
            onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
          />
          <SelectField
            label={labels.group}
            value={String(draft.groupId)}
            disabled={!editing}
            onChange={(value) => setDraft((current) => ({ ...current, groupId: Number(value) }))}
            options={(editing ? groups : [group]).map((item) => ({ value: String(item.id), label: item.name }))}
          />
          {editing ? (
            <ReadOnlyField label={labels.kind} value={labels.kinds[draft.kind]} />
          ) : (
            <SelectField
              label={labels.kind}
              value={draft.kind}
              onChange={(value) => setKind(value as ModelKind)}
              options={(['text', 'image', 'video'] as ModelKind[]).map((kind) => ({
                value: kind,
                label: labels.kinds[kind]
              }))}
            />
          )}
        </div>

        <label className="field endpoint-editor-remark">
          <span>{labels.remark}</span>
          <textarea
            rows={2}
            value={draft.remark}
            onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))}
          />
        </label>

        <label className="endpoint-editor-switch">
          <span>{labels.schedule}</span>
          <button
            type="button"
            role="switch"
            aria-label={labels.schedule}
            aria-checked={draft.scheduleEnabled}
            className={draft.scheduleEnabled ? 'switch on' : 'switch'}
            onClick={() => setDraft((current) => ({ ...current, scheduleEnabled: !current.scheduleEnabled }))}
          >
            <span />
          </button>
        </label>

        <section className="endpoint-editor-section endpoint-editor-connection">
          <div className="endpoint-editor-grid endpoint-editor-connection-grid">
            <TextField
              label={labels.baseUrl}
              value={draft.baseUrl}
              required
              inputMode="url"
              onChange={(value) => setDraft((current) => ({ ...current, baseUrl: value }))}
            />
            <CredentialFields
              slots={credentialSlots}
              values={draft.credentials}
              configuredSlots={endpoint?.credentialSlots ?? []}
              labels={labels}
              onChange={(name, value) => setDraft((current) => ({
                ...current,
                credentials: { ...current.credentials, [name]: value }
              }))}
            />
          </div>
        </section>

        <section className="endpoint-editor-section">
          <div className="endpoint-editor-grid endpoint-editor-driver-grid">
            {draft.kind === 'text' && (
              <SelectField
                label={labels.endpointType}
                className="endpoint-type-select"
                value={draft.textEndpointType}
                placeholder={labels.selectEndpointType}
                onChange={(value) => setTextEndpointType(value as TextEndpointType)}
                options={(Object.keys(labels.textEndpointTypes) as Exclude<TextEndpointType, ''>[]).map((type) => ({
                  value: type,
                  label: <TextEndpointTypeLabel type={type} label={labels.textEndpointTypes[type]} />,
                  textLabel: labels.textEndpointTypes[type],
                  className: 'endpoint-type-select-option'
                }))}
              />
            )}
            <SelectField
              label={labels.driver}
              value={draft.driverRef}
              placeholder={draft.kind === 'text' && !draft.textEndpointType
                ? labels.selectEndpointType
                : compatibleDrivers.length
                  ? labels.selectDriver
                  : labels.noDrivers}
              disabled={draft.kind === 'text' && draft.textEndpointType !== 'custom'}
              onChange={setDriver}
              options={draft.kind === 'text' && draft.textEndpointType && draft.textEndpointType !== 'custom'
                ? [{
                    value: draft.driverRef,
                    label: selectedDriver?.alias || selectedDriver?.manifest.displayName || labels.textEndpointTypes[draft.textEndpointType],
                    textLabel: selectedDriver?.alias || selectedDriver?.manifest.displayName || labels.textEndpointTypes[draft.textEndpointType]
                  }]
                : compatibleDrivers.map((driver) => ({
                    value: driver.ref,
                    label: driver.alias || driver.manifest.displayName,
                    textLabel: driver.alias
                      ? `${driver.alias}, ${driver.manifest.displayName}`
                      : driver.manifest.displayName
                  }))}
            />
          </div>
          {selectedDriver && (
            <code className="endpoint-editor-driver-ref">{selectedDriver.ref}</code>
          )}
        </section>

        {selectedDriver && (
          <DriverConfigForm
            schema={configSchema}
            value={draft.driverConfig}
            rawValue={draft.driverConfigText}
            labels={{
              title: labels.driverConfig,
              empty: labels.driverConfigEmpty,
              advanced: labels.driverConfigAdvanced,
              unsupported: labels.driverConfigUnsupported,
              invalidNumber: labels.invalidNumber
            }}
            onChange={(driverConfig) => {
              setDraft((current) => ({
                ...current,
                driverConfig,
                driverConfigText: JSON.stringify(driverConfig, null, 2)
              }));
              setValidationIssue(null);
            }}
            onRawChange={(driverConfigText) => {
              setDraft((current) => {
                try {
                  const parsed: unknown = JSON.parse(driverConfigText);
                  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...current, driverConfigText };
                  return { ...current, driverConfig: parsed as Record<string, unknown>, driverConfigText };
                } catch {
                  return { ...current, driverConfigText };
                }
              });
              setValidationIssue(null);
            }}
          />
        )}
        {validationIssue && (
          <p className="field-error" role="alert">{labels.invalidConfig}</p>
        )}

        <section className="endpoint-editor-section endpoint-editor-models" aria-label={labels.models}>
          <div className="endpoint-editor-section-head">
            <h3>{labels.models}</h3>
            <button
              type="button"
              className="btn secondary endpoint-model-sync"
              onClick={() => void syncModels()}
              disabled={discoveringModels || !draft.baseUrl.trim() || !draft.driverRef}
            >
              <RefreshCw size={15} aria-hidden="true" className={discoveringModels ? 'spin' : undefined} />
              {discoveringModels ? labels.syncingModels : labels.syncModels}
            </button>
          </div>
          {modelDiscoveryMessage && <p className="endpoint-model-sync-message" role="status">{modelDiscoveryMessage}</p>}
          <div className="endpoint-model-add">
            <label className="field">
              <span>{labels.modelId}</span>
              <input
                value={modelInput}
                onChange={(event) => setModelInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addModel();
                }}
              />
            </label>
            <button type="button" className="btn secondary" onClick={addModel} disabled={!modelInput.trim()}>
              <Plus size={15} aria-hidden="true" />
              {labels.addModel}
            </button>
          </div>
          <ul className="endpoint-model-list">
            {draft.models.map((model) => (
              <li key={model.id} className={pricingModelID === model.id ? 'pricing-open' : undefined}>
                <div className="endpoint-model-row">
                  <button
                    type="button"
                    className="endpoint-model-pricing-trigger"
                    aria-expanded={pricingModelID === model.id}
                    aria-label={`${labels.pricing}: ${model.id}`}
                    onClick={() => openPricing(model)}
                  >
                    <code>{model.id}</code>
                    {!endpointModelHasPricing(model) && (
                      <span className="endpoint-model-unpriced" title={labels.pricingUnconfigured}>
                        <CircleAlert size={15} aria-hidden="true" />
                        <span>{labels.pricingUnconfigured}</span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="icon-button subtle"
                    aria-label={`${labels.removeModel}: ${model.id}`}
                    title={labels.removeModel}
                    onClick={() => setDraft((current) => ({
                      ...current,
                      models: removeEndpointModel(current.models, model.id)
                    }))}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                {draft.kind === 'image' && (
                  <ImageProtocolSelector
                    label={labels.imageProtocols}
                    values={model.imageProtocolContracts}
                    disabledContracts={new Set<ImageProtocolContract>()}
                    onChange={(imageProtocolContracts) => setDraft((current) => ({
                      ...current,
                      models: updateEndpointModel(current.models, model.id, { imageProtocolContracts })
                    }))}
                  />
                )}
                {pricingModelID === model.id && (
                  <div className="endpoint-model-pricing-panel">
                    <div className="endpoint-model-pricing-grid">
                      <PriceField label={labels.inputPrice} unit={labels.priceUnit} value={pricingDraft.input} onChange={(input) => setPricingDraft((current) => ({ ...current, input }))} />
                      <PriceField label={labels.outputPrice} unit={labels.priceUnit} value={pricingDraft.output} onChange={(output) => setPricingDraft((current) => ({ ...current, output }))} />
                      <PriceField label={labels.cachePrice} unit={labels.priceUnit} value={pricingDraft.cache} onChange={(cache) => setPricingDraft((current) => ({ ...current, cache }))} />
                    </div>
                    {pricingError && <p className="field-error" role="alert">{pricingError}</p>}
                    <div className="endpoint-model-pricing-actions">
                      <button type="button" className="btn secondary" onClick={() => setPricingModelID(null)}>{labels.cancel}</button>
                      <button type="button" className="btn primary" onClick={applyPricing}>{labels.applyPricing}</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="modal-actions endpoint-editor-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>{labels.cancel}</button>
        <button
          type="submit"
          className="btn primary"
          disabled={busy || !draft.name.trim() || !draft.baseUrl.trim() || !draft.driverRef}
        >
          {labels.save}
        </button>
      </div>
    </form>
  );
}

function PriceField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field endpoint-model-price-field">
      <span>{label}</span>
      <div className="endpoint-model-price-input">
        <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
        <span aria-hidden="true">{unit}</span>
      </div>
    </label>
  );
}

function validPrice(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value.trim());
}

function draftFromEndpoint(group: EndpointGroup, endpoint?: Endpoint): EndpointEditorDraft {
  if (!endpoint) {
    return {
      groupId: group.id,
      kind: 'text',
      textEndpointType: '',
      name: '',
      remark: '',
      scheduleEnabled: true,
      driverRef: '',
      driverConfig: {},
      driverConfigText: '{}',
      baseUrl: '',
      credentials: {},
      models: []
    };
  }
  return {
    id: endpoint.id,
    groupId: endpoint.groupId,
    kind: endpoint.kind,
    textEndpointType: inferTextEndpointType(endpoint),
    name: endpoint.name,
    remark: endpoint.remark,
    scheduleEnabled: endpoint.scheduleEnabled,
    driverRef: endpoint.driverRef,
    driverConfig: endpoint.driverConfig,
    driverConfigText: JSON.stringify(endpoint.driverConfig, null, 2),
    baseUrl: endpoint.baseUrl,
    credentials: {},
    models: endpoint.models
  };
}

function inferTextEndpointType(endpoint: Endpoint): TextEndpointType {
  if (endpoint.kind !== 'text') return '';
  for (const [type, ref] of Object.entries(BUILTIN_TEXT_DRIVER_REFS)) {
    if (endpoint.driverRef === ref) return type as Exclude<TextEndpointType, '' | 'custom'>;
  }
  return 'custom';
}

function TextEndpointTypeLabel({
  type,
  label
}: {
  type: Exclude<TextEndpointType, ''>;
  label: string;
}) {
  return (
    <span className="endpoint-type-option">
      {type === 'anthropic_messages' ? (
        <img src={anthropicMark} alt="" aria-hidden="true" />
      ) : type === 'custom' ? (
        <Code2 size={16} aria-hidden="true" />
      ) : (
        <img src={openAIMark} alt="" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

function endpointDraftHasDriverState(draft: EndpointEditorDraft): boolean {
  return Object.keys(draft.driverConfig).length > 0
    || Object.values(draft.credentials).some((value) => value.trim() !== '');
}

function retainCredentialValues(
  credentials: Record<string, string>,
  slots?: readonly { name: string }[]
): Record<string, string> {
  if (!slots) return credentials;
  const allowed = new Set(slots.map((slot) => slot.name));
  return Object.fromEntries(Object.entries(credentials).filter(([name]) => allowed.has(name)));
}

function CredentialFields({
  slots,
  values,
  configuredSlots,
  labels,
  onChange
}: {
  slots: readonly { name: string; required: boolean }[];
  values: Record<string, string>;
  configuredSlots: readonly { name: string; configured: boolean }[];
  labels: EndpointEditorLabels;
  onChange: (name: string, value: string) => void;
}) {
  const multiple = slots.length > 1;

  return (
    <div className="field endpoint-editor-credential-field">
      <span>{labels.credentials}{slots.length === 1 && slots[0].required ? ' *' : ''}</span>
      {slots.length === 0 ? (
        <input
          aria-label={labels.credentials}
          type="password"
          disabled
          placeholder={labels.credentialNotRequired}
        />
      ) : (
        <div className={multiple ? 'endpoint-credential-inputs multiple' : 'endpoint-credential-inputs'}>
          {slots.map((slot) => {
            const configured = configuredSlots.some((item) => item.name === slot.name && item.configured);
            const slotLabel = `${slot.name}${slot.required ? ' *' : ''}`;
            return (
              <label className="endpoint-credential-input" key={slot.name}>
                {multiple && <small>{slotLabel}</small>}
                <input
                  aria-label={slotLabel}
                  type="password"
                  autoComplete="new-password"
                  value={values[slot.name] ?? ''}
                  placeholder={configured ? labels.credentialPreserve : labels.credentialOptional}
                  onChange={(event) => onChange(slot.name, event.target.value)}
                />
                {configured && <small>{labels.credentialConfigured}</small>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  required = false,
  inputMode,
  className,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={className ? `field ${className}` : 'field'}>
      <span>{label}{required ? ' *' : ''}</span>
      <input value={value} required={required} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="field endpoint-readonly-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailField({
  label,
  value,
  secondary,
  code = false,
  wide = false
}: {
  label: string;
  value: string;
  secondary?: string;
  code?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'endpoint-detail-field endpoint-detail-wide' : 'endpoint-detail-field'}>
      <dt>{label}</dt>
      <dd>
        {code ? <code>{value}</code> : <span>{value}</span>}
        {secondary && secondary !== value && <code className="endpoint-detail-secondary">{secondary}</code>}
      </dd>
    </div>
  );
}
