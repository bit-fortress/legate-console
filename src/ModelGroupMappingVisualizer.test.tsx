// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelGroupMappingVisualizer, type ModelGroupMappingVisualizerLabels, type ModelGroupMappingVisualizerProps } from './ModelGroupMappingVisualizer';
import type { Endpoint, ModelGroupMapping } from './types';

afterEach(cleanup);

const labels: ModelGroupMappingVisualizerLabels = {
  start: 'Route entry',
  layer: 'Layer',
  model: 'Model',
  endpoint: 'Endpoint',
  tier: 'Tier',
  weight: 'Weight',
  addModel: 'Add model',
  addFallback: 'Add fallback layer',
  deleteModel: 'Delete model',
  modelConfiguration: 'Model configuration',
  noModelSelected: 'No model selected',
  selectModel: 'Select model',
  layerTraffic: 'Layer traffic distribution',
  trafficShare: 'Traffic share',
  noTraffic: 'No model traffic in this layer',
  pendingApply: 'Pending',
  endpointGroup: 'Endpoint group',
  schedulable: 'Schedulable',
  yes: 'Yes',
  no: 'No'
};

const endpoints = [
  endpoint(1, 'OpenAI', ['gpt-4o', 'gpt-4.1']),
  endpoint(2, 'Anthropic', ['claude-sonnet-4'])
];

const mappings: ModelGroupMapping[] = [
  { endpointId: 1, modelId: 'gpt-4o', tier: 0, weight: 100 },
  { endpointId: 2, modelId: 'claude-sonnet-4', tier: 1, weight: 80 }
];

describe('ModelGroupMappingVisualizer', () => {
  it('renders primary and fallback layers and adds models at the intended tier', async () => {
    const user = userEvent.setup();
    const onAddMapping = vi.fn();
    renderVisualizer({ onAddMapping });

    expect(screen.getByRole('region', { name: 'Layer 1' })).toHaveTextContent('Primary pool');
    expect(screen.getByRole('region', { name: 'Layer 2' })).toHaveTextContent('Fallback 1');

    const addModelButtons = screen.getAllByRole('button', { name: 'Add model' });
    await user.click(addModelButtons[1]);
    expect(onAddMapping).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Add fallback layer' }));
    expect(onAddMapping).toHaveBeenCalledWith(2);
  });

  it('edits the selected node through the endpoint and model controls', async () => {
    const user = userEvent.setup();
    const onChangeMapping = vi.fn((index: number) => index);
    renderVisualizer({ onChangeMapping });

    await user.click(screen.getByRole('button', { name: 'Model gpt-4o' }));
    expect(screen.getByRole('complementary', { name: 'Model configuration' })).toHaveTextContent('OpenAI');

    await user.click(screen.getByRole('button', { name: 'Endpoint' }));
    await user.click(screen.getByRole('option', { name: 'Anthropic' }));
    expect(onChangeMapping).toHaveBeenCalledWith(0, { endpointId: 2, modelId: '' }, true);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Weight' }), { target: { value: '250' } });
    expect(onChangeMapping).toHaveBeenLastCalledWith(0, { weight: 250 }, true);
  });

  it('defers tier reordering until the tier input loses focus', async () => {
    const user = userEvent.setup();
    const onChangeMapping = vi.fn((index: number) => index);
    renderVisualizer({ onChangeMapping });

    await user.click(screen.getByRole('button', { name: 'Model gpt-4o' }));
    const tierInput = screen.getByRole('spinbutton', { name: 'Tier' });
    fireEvent.change(tierInput, { target: { value: '2' } });
    expect(onChangeMapping).not.toHaveBeenCalled();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    fireEvent.blur(tierInput);
    expect(onChangeMapping).toHaveBeenLastCalledWith(0, { tier: 2 }, true);
  });

  it('deletes the selected model node', async () => {
    const user = userEvent.setup();
    const onRemoveMapping = vi.fn();
    renderVisualizer({ onRemoveMapping });

    await user.click(screen.getByRole('button', { name: 'Model claude-sonnet-4' }));
    await user.click(screen.getByRole('button', { name: 'Delete model' }));
    expect(onRemoveMapping).toHaveBeenCalledWith(1);
    expect(screen.getByRole('complementary', { name: 'Model configuration' })).toHaveTextContent('No model selected');
  });

  it('numbers fallback pools by visible order even when tier values have gaps', () => {
    renderVisualizer({
      mappings: [
        mappings[0],
        { ...mappings[1], tier: 2 },
        { ...mappings[1], endpointId: 1, modelId: 'gpt-4.1', tier: 5 }
      ]
    });

    expect(screen.getByRole('region', { name: 'Layer 1' })).toHaveTextContent('Primary pool');
    expect(screen.getByRole('region', { name: 'Layer 3' })).toHaveTextContent('Fallback 1');
    expect(screen.getByRole('region', { name: 'Layer 6' })).toHaveTextContent('Fallback 2');
  });

  it('shows a selected layer weight ring and per-model traffic percentages', async () => {
    const user = userEvent.setup();
    renderVisualizer({
      mappings: [
        { ...mappings[0], weight: 100 },
        { ...mappings[1], tier: 0, weight: 300 }
      ]
    });

    await user.click(screen.getByRole('button', { name: 'Layer 1 Layer traffic distribution' }));

    const inspector = screen.getByRole('complementary', { name: 'Layer traffic distribution' });
    expect(inspector).toHaveTextContent('gpt-4o');
    expect(inspector).toHaveTextContent('claude-sonnet-4');
    expect(inspector).toHaveTextContent('25%');
    expect(inspector).toHaveTextContent('75%');
    expect(screen.getByRole('img', { name: 'Traffic share' })).toBeInTheDocument();
  });

  it('clears model and layer selections when the canvas background is clicked', async () => {
    const user = userEvent.setup();
    renderVisualizer();
    const canvas = screen.getByTestId('mapping-canvas');

    await user.click(screen.getByRole('button', { name: 'Model gpt-4o' }));
    expect(screen.getByRole('complementary', { name: 'Model configuration' })).toHaveTextContent('OpenAI');
    await user.click(canvas);
    expect(screen.getByRole('complementary', { name: 'Model configuration' })).toHaveTextContent('No model selected');

    await user.click(screen.getByRole('button', { name: 'Layer 1 Layer traffic distribution' }));
    expect(screen.getByRole('complementary', { name: 'Layer traffic distribution' })).toBeInTheDocument();
    await user.click(canvas);
    expect(screen.getByRole('complementary', { name: 'Model configuration' })).toHaveTextContent('No model selected');
  });

  it('renders controlled readonly selection without any mutation controls', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <ModelGroupMappingVisualizer
        mode="readonly"
        groupName="chat"
        groupKind="text"
        mappings={[{ ...mappings[0], id: 41 }]}
        endpoints={endpoints}
        labels={labels}
        tierLabel={() => 'Primary pool'}
        selection={null}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.queryByRole('button', { name: 'Add model' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add fallback layer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete model' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Model gpt-4o' }));
    expect(onSelectionChange).toHaveBeenCalledWith({ type: 'mapping', mappingId: 41 });
  });

  it('uses schedule and mapped-model configuration for readonly schedulability', () => {
    render(
      <ModelGroupMappingVisualizer
        mode="readonly"
        groupName="chat"
        groupKind="text"
        mappings={[{ ...mappings[0], id: 41 }]}
        endpoints={[{ ...endpoints[0], scheduleEnabled: false }]}
        endpointGroupName={() => 'Production'}
        labels={labels}
        tierLabel={() => 'Primary pool'}
        selection={{ type: 'mapping', mappingId: 41 }}
        onSelectionChange={vi.fn()}
      />
    );

    const inspector = screen.getByRole('complementary', { name: 'Model configuration' });
    expect(inspector).toHaveTextContent('Production');
    expect(inspector).toHaveTextContent(/Schedulable\s*No/);
  });
});

function renderVisualizer(overrides: Partial<Extract<ModelGroupMappingVisualizerProps, { mode: 'edit' }>> = {}) {
  return render(
    <ModelGroupMappingVisualizer
      mode="edit"
      groupName="chat"
      groupKind="text"
      mappings={mappings}
      endpoints={endpoints}
      labels={labels}
      tierLabel={(tier) => tier === 0 ? 'Primary pool' : `Fallback ${tier}`}
      modelsForEndpoint={(endpointId) => endpoints.find((item) => item.id === endpointId)?.models ?? []}
      onChangeMapping={vi.fn((index: number) => index)}
      onAddMapping={vi.fn(() => mappings.length)}
      onRemoveMapping={vi.fn()}
      {...overrides}
    />
  );
}

function endpoint(id: number, name: string, modelIds: string[]): Endpoint {
  return {
    id,
    workspaceId: 1,
    groupId: 1,
    name,
    remark: '',
    kind: 'text',
    status: 'enabled',
    scheduleEnabled: true,
    driverRef: 'builtin:test',
    driverConfig: {},
    baseUrl: 'https://example.com',
    credentialSlots: [],
    models: modelIds.map((modelId) => ({
      id: modelId,
      textFeatures: [],
      imageProtocolContracts: [],
      imageProtocolLimits: [],
      inputPricePerMillion: '0',
      outputPricePerMillion: '0',
      cachePricePerMillion: '0'
    })),
    modelGroupNames: [],
    uptime: { available: 0, total: 0, percentage: 100 },
    lastUsedAt: null,
    createdAt: '',
    updatedAt: ''
  };
}
