// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EndpointEditor, { EndpointDetail, type EndpointEditorLabels } from './EndpointEditor';
import type { DriverCatalogItem, Endpoint, EndpointGroup } from './types';

const group: EndpointGroup = {
  id: 11,
  workspaceId: 1,
  name: 'Production',
  remark: '',
  sortOrder: 0,
  endpointCount: 1,
  createdAt: '',
  updatedAt: ''
};

const labels: EndpointEditorLabels = {
  createTitle: 'Create Endpoint',
  editTitle: 'Edit Endpoint',
  group: 'Endpoint Group',
  kind: 'Kind',
  name: 'Name',
  remark: 'Remark',
  schedule: 'Schedule',
  baseUrl: 'Base URL',
  endpointType: 'Endpoint Type',
  selectEndpointType: 'Select endpoint type',
  driver: 'Driver',
  selectDriver: 'Select driver',
  noDrivers: 'No drivers',
  credentials: 'Credentials',
  credentialConfigured: 'Configured',
  credentialOptional: 'Enter a value',
  credentialPreserve: 'Leave blank to preserve',
  credentialNotRequired: 'No credentials required',
  models: 'Models',
  imageProtocols: 'Supported image APIs',
  modelId: 'Model ID',
  addModel: 'Add model',
  syncModels: 'Sync latest models',
  syncingModels: 'Syncing',
  syncModelsFailed: 'Sync failed',
  syncModelsEmpty: 'No remote models',
  removeModel: 'Remove model',
  pricing: 'Pricing',
  pricingUnconfigured: 'Pricing not configured',
  inputPrice: 'Input price',
  outputPrice: 'Output price',
  cachePrice: 'Cache hit price',
  priceUnit: 'USD / 1M tokens',
  applyPricing: 'Apply pricing',
  invalidPrice: 'Invalid price',
  cancel: 'Cancel',
  save: 'Save',
  required: 'Required',
  invalidConfig: 'Invalid config',
  changeDriverConfirm: 'Change driver?',
  kinds: { text: 'Text', image: 'Image', video: 'Video' },
  textEndpointTypes: {
    openai_chat: 'OpenAI Chat Completions',
    openai_responses: 'OpenAI Responses',
    anthropic_messages: 'Anthropic Messages',
    custom: 'Custom'
  },
  driverConfig: 'Driver config',
  driverConfigEmpty: 'No driver configuration required',
  driverConfigAdvanced: 'Advanced',
  driverConfigUnsupported: 'Unsupported',
  invalidNumber: 'Invalid number'
};

afterEach(cleanup);

describe('EndpointEditor', () => {
  it('places the endpoint name above the group and kind fields', () => {
    renderEditor();

    const name = screen.getByLabelText('Name *');
    const group = screen.getByRole('button', { name: 'Endpoint Group' });
    const kind = screen.getByRole('button', { name: 'Kind' });
    const identity = name.closest('.endpoint-editor-identity');
    expect(identity).not.toBeNull();
    expect(identity?.children[0]).toContainElement(name);
    expect(identity?.children[1]).toContainElement(group);
    expect(identity?.children[2]).toContainElement(kind);
  });

  it('always keeps Base URL and credentials together before selecting an endpoint type', async () => {
    const user = userEvent.setup();
    renderEditor();

    const baseUrl = screen.getByLabelText('Base URL *');
    const credential = screen.getByLabelText('api_key');
    const connectionGrid = baseUrl.closest('.endpoint-editor-connection-grid');
    expect(connectionGrid).not.toBeNull();
    expect(connectionGrid).toContainElement(credential);
    expect(screen.queryByRole('region', { name: 'Credentials' })).not.toBeInTheDocument();

    await user.type(credential, 'preselected-secret');
    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Chat Completions' }));
    expect(screen.getByLabelText('api_key *')).toHaveValue('preselected-secret');
  });

  it('shows all text endpoint types with their product marks', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole('button', { name: 'Endpoint Group' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Endpoint Group' })).toHaveTextContent('Production');

    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    const openAIChat = screen.getByRole('option', { name: 'OpenAI Chat Completions' });
    const openAIResponses = screen.getByRole('option', { name: 'OpenAI Responses' });
    const anthropic = screen.getByRole('option', { name: 'Anthropic Messages' });
    const custom = screen.getByRole('option', { name: 'Custom' });
    expect(openAIChat.querySelector('img')).toBeInTheDocument();
    expect(openAIResponses.querySelector('img')).toBeInTheDocument();
    expect(anthropic.querySelector('img')).toBeInTheDocument();
    expect(custom.querySelector('svg')).toBeInTheDocument();
  });

  it.each([
    ['OpenAI Chat Completions', 'builtin://openai-chat-compatible@1', 'OpenAI Chat Driver'],
    ['OpenAI Responses', 'builtin://openai-responses-compatible@1', 'OpenAI Responses Driver'],
    ['Anthropic Messages', 'builtin://anthropic@1', 'Anthropic Messages Driver']
  ])('locks %s to its builtin driver', async (endpointType, driverRef, driverName) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderEditor({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: endpointType }));
    const driver = screen.getByRole('button', { name: 'Driver' });
    expect(driver).toBeDisabled();
    expect(driver).toHaveTextContent(driverName);

    await user.type(screen.getByLabelText('Name *'), 'Builtin Endpoint');
    await user.type(screen.getByLabelText('Base URL *'), 'https://example.test/v1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ driverRef }));
  });

  it('shows an informative driver configuration section when no parameters are required', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Chat Completions' }));

    const section = screen.getByRole('region', { name: 'Driver config' });
    expect(section).toHaveTextContent('No driver configuration required');
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
  });

  it('merges synchronized models and configures pricing from the model row', async () => {
    const user = userEvent.setup();
    const onDiscoverModels = vi.fn().mockResolvedValue(['gpt-5', 'gpt-4.1']);
    const onSubmit = vi.fn();
    renderEditor({ endpoint: endpointFixture(), onDiscoverModels, onSubmit });

    await user.click(screen.getByRole('button', { name: 'Sync latest models' }));
    expect(onDiscoverModels).toHaveBeenCalledWith(expect.objectContaining({
      endpointId: 101,
      baseUrl: 'https://example.test/v1',
      credentials: {}
    }));
    expect(await screen.findByText('gpt-4.1')).toBeInTheDocument();
    expect(screen.getAllByText('Pricing not configured')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Pricing: gpt-4.1' }));
    const inputPrice = screen.getByRole('textbox', { name: 'Input price' });
    const priceInputGroup = inputPrice.closest('.endpoint-model-price-input');
    expect(priceInputGroup).not.toBeNull();
    expect(priceInputGroup).toContainElement(screen.getAllByText('USD / 1M tokens')[0]);
    expect(screen.getAllByText('USD / 1M tokens')[0]).toHaveAttribute('aria-hidden', 'true');
    await user.clear(inputPrice);
    await user.type(inputPrice, '1.25');
    await user.clear(screen.getByRole('textbox', { name: /Output price/ }));
    await user.type(screen.getByRole('textbox', { name: /Output price/ }), '5');
    await user.click(screen.getByRole('button', { name: 'Apply pricing' }));
    expect(screen.getAllByText('Pricing not configured')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      models: expect.arrayContaining([expect.objectContaining({
        id: 'gpt-4.1',
        inputPricePerMillion: '1.25',
        outputPricePerMillion: '5'
      })])
    }));
  });

  it('reports model discovery failures through toast', async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    renderEditor({
      endpoint: endpointFixture(),
      onDiscoverModels: vi.fn().mockRejectedValue(new Error('models API unavailable')),
      onToast
    });

    await user.click(screen.getByRole('button', { name: 'Sync latest models' }));

    expect(onToast).toHaveBeenCalledWith('error', 'Sync failed');
    expect(screen.queryByText('Sync failed')).not.toBeInTheDocument();
  });

  it('only offers uploaded text WASM drivers for a custom text endpoint', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('button', { name: 'Driver' }));
    expect(screen.getByRole('option', { name: 'Workspace Text Driver' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'OpenAI Chat Driver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Workspace Image Driver' })).not.toBeInTheDocument();
  });

  it('renders and submits custom driver configuration from its JSON schema', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderEditor({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('button', { name: 'Driver' }));
    await user.click(screen.getByRole('option', { name: 'Workspace Text Driver' }));
    await user.type(screen.getByLabelText('Organization *'), 'acme');
    await user.type(screen.getByLabelText('Name *'), 'Custom Text');
    await user.type(screen.getByLabelText('Base URL *'), 'https://example.test/v1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      driverRef: 'profile://workspace/text@sha256:abc',
      driverConfig: { organization: 'acme' }
    }));
  });

  it('clears the endpoint type and driver when the model kind changes', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Chat Completions' }));

    await user.click(screen.getByRole('button', { name: 'Kind' }));
    await user.click(screen.getByRole('option', { name: 'Image' }));
    expect(screen.queryByRole('button', { name: 'Endpoint Type' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Driver' })).toHaveTextContent('Select driver');

    await user.click(screen.getByRole('button', { name: 'Driver' }));
    expect(screen.getByRole('option', { name: 'Workspace Image Driver' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Workspace Image Driver' }));
    await user.click(screen.getByRole('button', { name: 'Kind' }));
    await user.click(screen.getByRole('option', { name: 'Text' }));
    expect(screen.getByRole('button', { name: 'Endpoint Type' })).toHaveTextContent('Select endpoint type');
    expect(screen.getByRole('button', { name: 'Driver' })).toBeDisabled();
  });

  it('keeps kind read-only while editing and represents configured secrets without returning them', () => {
    renderEditor({ endpoint: endpointFixture() });

    expect(screen.queryByRole('button', { name: 'Kind' })).not.toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    const credential = screen.getByPlaceholderText('Leave blank to preserve');
    expect(credential).toHaveValue('');
    expect(credential).toHaveAttribute('placeholder', 'Leave blank to preserve');
    expect(screen.getByText('Configured')).toBeInTheDocument();
  });

  it('infers the builtin type while editing and confirms before changing it', async () => {
    const user = userEvent.setup();
    const confirmDriverChange = vi.fn(() => false);
    renderEditor({
      endpoint: endpointFixture(),
      confirmDriverChange
    });

    expect(screen.getByRole('button', { name: 'Endpoint Type' })).toHaveTextContent('OpenAI Chat Completions');
    expect(screen.getByRole('button', { name: 'Driver' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Responses' }));

    expect(confirmDriverChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Endpoint Type' })).toHaveTextContent('OpenAI Chat Completions');
    expect(screen.getByRole('button', { name: 'Driver' })).toHaveTextContent('OpenAI Chat Driver');
  });

  it('submits the locked group and selected kind', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderEditor({ onSubmit });

    await user.type(screen.getByLabelText('Name *'), 'New Text');
    await user.type(screen.getByLabelText('Base URL *'), 'https://example.test/v1');
    await user.click(screen.getByRole('button', { name: 'Endpoint Type' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Chat Completions' }));
    await user.type(screen.getByLabelText('api_key *'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 11,
      kind: 'text',
      driverRef: 'builtin://openai-chat-compatible@1',
      credentials: { api_key: 'secret' },
      baseUrl: 'https://example.test/v1'
    }));
  });

  it('shows the complete relaxed detail content', () => {
    const endpoint = endpointFixture();
    render(
      <EndpointDetail
        endpoint={endpoint}
        group={group}
        driver={drivers[0]}
        labels={{
          group: 'Group',
          kind: 'Kind',
          status: 'Status',
          baseUrl: 'Base URL',
          driver: 'Driver',
          credentials: 'Credentials',
          credentialConfigured: 'Configured',
          credentialMissing: 'Missing',
          models: 'Models',
          updatedAt: 'Updated',
          empty: '-',
          kinds: { text: 'Text', image: 'Image', video: 'Video' },
          statuses: { enabled: 'Enabled', disabled: 'Disabled', error: 'Error' },
          formatDate: (value) => value
        }}
      />
    );
    const detail = screen.getByText('Base URL').closest('.endpoint-detail');
    expect(detail).not.toBeNull();
    expect(within(detail as HTMLElement).getByText('Production')).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText('https://example.test/v1')).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText('api_key: Configured')).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText('gpt-5')).toBeInTheDocument();
  });
});

const drivers: DriverCatalogItem[] = [
  driverFixture('text', 'builtin://openai-chat-compatible@1', 'OpenAI Chat Driver'),
  driverFixture('text', 'builtin://openai-responses-compatible@1', 'OpenAI Responses Driver'),
  driverFixture('text', 'builtin://anthropic@1', 'Anthropic Messages Driver'),
  driverFixture('text', 'profile://workspace/text@sha256:abc', 'Workspace Text Driver', 'wasm'),
  driverFixture('image', 'profile://workspace/image@sha256:def', 'Workspace Image Driver', 'wasm')
];

function renderEditor(overrides: Partial<React.ComponentProps<typeof EndpointEditor>> = {}) {
  return render(
    <EndpointEditor
      group={group}
      groups={[group]}
      drivers={drivers}
      labels={labels}
      onCancel={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />
  );
}

function driverFixture(
  kind: 'text' | 'image',
  ref: string,
  displayName: string,
  runtimeKind: 'builtin' | 'wasm' = 'builtin'
): DriverCatalogItem {
  return {
    ref,
    source: runtimeKind === 'wasm' ? 'profile' : 'builtin',
    runtimeKind,
    manifest: {
      id: ref,
      displayName,
      version: '1',
      kind,
      text: kind === 'text' ? {
        protocolContracts: ['openai.chat_completions/2026-07-18']
      } : undefined,
      image: kind === 'image' ? {
        protocolContracts: ['openai.images.generations/2026-07-19']
      } : undefined,
      managementCapabilities: [],
      configSchemaJson: runtimeKind === 'wasm' && kind === 'text'
        ? '{"type":"object","required":["organization"],"properties":{"organization":{"type":"string","title":"Organization"}}}'
        : '{"type":"object"}',
      credentialSchema: { slots: [{ name: 'api_key', required: true }] },
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
    driverRef: 'builtin://openai-chat-compatible@1',
    driverConfig: {},
    baseUrl: 'https://example.test/v1',
    credentialSlots: [{ name: 'api_key', configured: true }],
    models: [{
      id: 'gpt-5',
      textFeatures: ['text'],
      imageProtocolContracts: [],
      inputPricePerMillion: '0',
      outputPricePerMillion: '0',
      cachePricePerMillion: '0'
    }],
    modelGroupNames: [],
    uptime: { available: 0, total: 0, percentage: 0 },
    lastUsedAt: null,
    createdAt: '',
    updatedAt: '2026-07-16T01:00:00Z'
  };
}
