import { useEffect, useState } from 'react';
import { Box, CirclePlus, GitBranch, Layers3, Server, Trash2, Zap } from 'lucide-react';
import { SelectField } from './SelectControl';
import type { Endpoint, EndpointModel, ModelGroupMapping } from './types';

export interface ModelGroupMappingVisualizerLabels {
  start: string;
  layer: string;
  model: string;
  provider: string;
  tier: string;
  weight: string;
  addModel: string;
  addFallback: string;
  deleteModel: string;
  modelConfiguration: string;
  noModelSelected: string;
  selectModel: string;
}

interface ModelGroupMappingVisualizerProps {
  groupName: string;
  mappings: ModelGroupMapping[];
  endpoints: Endpoint[];
  labels: ModelGroupMappingVisualizerLabels;
  tierLabel: (tier: number) => string;
  modelsForEndpoint: (endpointId: number) => EndpointModel[];
  onChangeMapping: (index: number, patch: Partial<ModelGroupMapping>) => void;
  onAddMapping: (tier: number) => void;
  onRemoveMapping: (index: number) => void;
}

export function ModelGroupMappingVisualizer({
  groupName,
  mappings,
  endpoints,
  labels,
  tierLabel,
  modelsForEndpoint,
  onChangeMapping,
  onAddMapping,
  onRemoveMapping
}: ModelGroupMappingVisualizerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const tiers = Array.from(new Set([0, ...mappings.map((mapping) => mapping.tier ?? 0)]))
    .sort((left, right) => left - right);
  const selectedMapping = selectedIndex == null ? null : mappings[selectedIndex] ?? null;
  const maxTier = tiers[tiers.length - 1] ?? 0;

  useEffect(() => {
    if (selectedIndex != null && selectedIndex >= mappings.length) setSelectedIndex(null);
  }, [mappings.length, selectedIndex]);

  function addMapping(tier: number) {
    const nextIndex = mappings.length;
    onAddMapping(tier);
    setSelectedIndex(nextIndex);
  }

  function removeSelectedMapping() {
    if (selectedIndex == null) return;
    onRemoveMapping(selectedIndex);
    setSelectedIndex(null);
  }

  return (
    <div className="mapping-visualizer">
      <div className="mapping-canvas" data-testid="mapping-canvas">
        <div className="mapping-start-node">
          <span><Zap size={13} fill="currentColor" /> {labels.start}</span>
          <strong>{groupName || labels.start}</strong>
        </div>

        {tiers.map((tier, tierIndex) => {
          const tierMappings = mappings
            .map((mapping, index) => ({ mapping, index }))
            .filter(({ mapping }) => (mapping.tier ?? 0) === tier);
          return (
            <div className="mapping-tier-flow" key={tier}>
              <div className="mapping-flow-connector" aria-hidden="true">
                <span>{tierIndex === 0 ? <GitBranch size={13} /> : tierLabel(tier)}</span>
              </div>
              <section className="mapping-tier-panel" aria-label={`${labels.layer} ${tier + 1}`}>
                <header>
                  <span className="mapping-layer-index">{labels.layer} {tier + 1}</span>
                  <strong>{tierLabel(tier)}</strong>
                  <span className="mapping-layer-count">{tierMappings.length}</span>
                </header>
                <div className="mapping-node-grid">
                  {tierMappings.map(({ mapping, index }) => {
                    const endpoint = endpoints.find((item) => item.id === mapping.endpointId);
                    const selected = selectedIndex === index;
                    return (
                      <button
                        type="button"
                        className={selected ? 'mapping-model-node selected' : 'mapping-model-node'}
                        aria-pressed={selected}
                        aria-label={`${labels.model} ${mapping.modelId || index + 1}`}
                        key={mapping.id ?? index}
                        onClick={() => setSelectedIndex(index)}
                      >
                        <span className="mapping-node-label"><Box size={12} /> {labels.model}</span>
                        <span className="mapping-node-body">
                          <span className="mapping-provider-mark"><Server size={17} /></span>
                          <span className="mapping-node-copy">
                            <strong title={mapping.modelId}>{mapping.modelId || labels.selectModel}</strong>
                            <small title={endpoint?.name}>{endpoint?.name || labels.provider}</small>
                          </span>
                        </span>
                        <span className="mapping-node-meta">
                          <span>{labels.weight} {mapping.weight ?? 100}</span>
                          {endpoint && <i className={endpoint.status === 'enabled' ? 'available' : ''} />}
                        </span>
                      </button>
                    );
                  })}
                  <button type="button" className="mapping-add-node" onClick={() => addMapping(tier)}>
                    <CirclePlus size={18} />
                    <span>{labels.addModel}</span>
                  </button>
                </div>
              </section>
            </div>
          );
        })}

        <div className="mapping-flow-connector mapping-add-fallback-connector" aria-hidden="true" />
        <button type="button" className="mapping-add-fallback" onClick={() => addMapping(maxTier + 1)}>
          <Layers3 size={16} /> {labels.addFallback}
        </button>
      </div>

      <aside className="mapping-inspector" aria-label={labels.modelConfiguration}>
        <header>
          <Box size={17} />
          <strong>{labels.modelConfiguration}</strong>
        </header>
        {selectedMapping && selectedIndex != null ? (
          <div className="mapping-inspector-form">
            <SelectField
              label={labels.provider}
              value={selectedMapping.endpointId ? String(selectedMapping.endpointId) : ''}
              placeholder={labels.provider}
              onChange={(value) => onChangeMapping(selectedIndex, { endpointId: value ? Number(value) : 0, modelId: '' })}
              options={endpoints.map((endpoint) => ({ value: String(endpoint.id), label: endpoint.name }))}
            />
            <SelectField
              label={labels.model}
              value={selectedMapping.modelId}
              placeholder={labels.selectModel}
              disabled={!selectedMapping.endpointId}
              onChange={(modelId) => onChangeMapping(selectedIndex, { modelId })}
              options={modelsForEndpoint(selectedMapping.endpointId).map((model) => ({ value: model.id, label: model.id }))}
            />
            <div className="mapping-inspector-numbers">
              <label className="field">
                <span>{labels.tier}</span>
                <input
                  aria-label={labels.tier}
                  type="number"
                  min="0"
                  value={selectedMapping.tier ?? 0}
                  onChange={(event) => onChangeMapping(selectedIndex, { tier: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
                />
              </label>
              <label className="field">
                <span>{labels.weight}</span>
                <input
                  aria-label={labels.weight}
                  type="number"
                  min="1"
                  max="10000"
                  value={selectedMapping.weight ?? 100}
                  onChange={(event) => onChangeMapping(selectedIndex, { weight: Math.min(10000, Math.max(1, Math.floor(Number(event.target.value) || 100))) })}
                />
              </label>
            </div>
            <button type="button" className="btn danger mapping-inspector-delete" onClick={removeSelectedMapping}>
              <Trash2 size={15} /> {labels.deleteModel}
            </button>
          </div>
        ) : (
          <div className="mapping-inspector-empty">
            <Box size={25} />
            <span>{labels.noModelSelected}</span>
          </div>
        )}
      </aside>
    </div>
  );
}
