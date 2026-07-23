import { useEffect, useState } from 'react';
import { Box, ChartPie, CirclePlus, GitBranch, Layers3, Server, Trash2, Zap } from 'lucide-react';
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
  layerTraffic: string;
  trafficShare: string;
  noTraffic: string;
}

interface ModelGroupMappingVisualizerProps {
  groupName: string;
  mappings: ModelGroupMapping[];
  endpoints: Endpoint[];
  labels: ModelGroupMappingVisualizerLabels;
  tierLabel: (tier: number) => string;
  modelsForEndpoint: (endpointId: number) => EndpointModel[];
  onChangeMapping: (index: number, patch: Partial<ModelGroupMapping>) => number;
  onAddMapping: (tier: number) => number;
  onRemoveMapping: (index: number) => void;
}

type VisualizerSelection =
  | { type: 'mapping'; index: number }
  | { type: 'tier'; tier: number }
  | null;

const trafficColors = ['#2563eb', '#12b76a', '#f79009', '#7f56d9', '#06b6d4', '#ef4444', '#eab308', '#ec4899'];

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
  const [selection, setSelection] = useState<VisualizerSelection>(null);
  const tiers = Array.from(new Set([0, ...mappings.map((mapping) => mapping.tier ?? 0)]))
    .sort((left, right) => left - right);
  const selectedIndex = selection?.type === 'mapping' ? selection.index : null;
  const selectedTier = selection?.type === 'tier' ? selection.tier : null;
  const selectedMapping = selectedIndex == null ? null : mappings[selectedIndex] ?? null;
  const maxTier = tiers[tiers.length - 1] ?? 0;

  useEffect(() => {
    if (selectedIndex != null && selectedIndex >= mappings.length) setSelection(null);
    if (selectedTier != null && !tiers.includes(selectedTier)) setSelection(null);
  }, [mappings.length, selectedIndex, selectedTier, tiers]);

  function addMapping(tier: number) {
    const nextIndex = onAddMapping(tier);
    setSelection({ type: 'mapping', index: nextIndex });
  }

  function changeSelectedMapping(patch: Partial<ModelGroupMapping>) {
    if (selectedIndex == null) return;
    const nextIndex = onChangeMapping(selectedIndex, patch);
    setSelection({ type: 'mapping', index: nextIndex });
  }

  function removeSelectedMapping() {
    if (selectedIndex == null) return;
    onRemoveMapping(selectedIndex);
    setSelection(null);
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
                <span>{tierIndex === 0 ? <GitBranch size={13} /> : tierLabel(tierIndex)}</span>
              </div>
              <section
                className={selectedTier === tier ? 'mapping-tier-panel selected' : 'mapping-tier-panel'}
                aria-label={`${labels.layer} ${tier + 1}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button')) return;
                  setSelection({ type: 'tier', tier });
                }}
              >
                <button
                  type="button"
                  className="mapping-tier-header"
                  aria-label={`${labels.layer} ${tier + 1} ${labels.layerTraffic}`}
                  aria-pressed={selectedTier === tier}
                  onClick={() => setSelection({ type: 'tier', tier })}
                >
                  <span className="mapping-layer-index">{labels.layer} {tier + 1}</span>
                  <strong>{tierLabel(tierIndex)}</strong>
                  <span className="mapping-layer-count">{tierMappings.length}</span>
                </button>
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
                        onClick={() => setSelection({ type: 'mapping', index })}
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

      <aside className="mapping-inspector" aria-label={selectedTier == null ? labels.modelConfiguration : labels.layerTraffic}>
        <header>
          {selectedTier == null ? <Box size={17} /> : <ChartPie size={17} />}
          <strong>{selectedTier == null ? labels.modelConfiguration : labels.layerTraffic}</strong>
        </header>
        {selectedTier != null ? (
          <LayerTrafficInspector
            mappings={mappings
              .map((mapping, index) => ({ mapping, index }))
              .filter(({ mapping }) => (mapping.tier ?? 0) === selectedTier)}
            endpoints={endpoints}
            labels={labels}
          />
        ) : selectedMapping && selectedIndex != null ? (
          <div className="mapping-inspector-form">
            <SelectField
              label={labels.provider}
              value={selectedMapping.endpointId ? String(selectedMapping.endpointId) : ''}
              placeholder={labels.provider}
              onChange={(value) => changeSelectedMapping({ endpointId: value ? Number(value) : 0, modelId: '' })}
              options={endpoints.map((endpoint) => ({ value: String(endpoint.id), label: endpoint.name }))}
            />
            <SelectField
              label={labels.model}
              value={selectedMapping.modelId}
              placeholder={labels.selectModel}
              disabled={!selectedMapping.endpointId}
              onChange={(modelId) => changeSelectedMapping({ modelId })}
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
                  onChange={(event) => changeSelectedMapping({ tier: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
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
                  onChange={(event) => changeSelectedMapping({ weight: Math.min(10000, Math.max(1, Math.floor(Number(event.target.value) || 100))) })}
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

function LayerTrafficInspector({
  mappings,
  endpoints,
  labels
}: {
  mappings: Array<{ mapping: ModelGroupMapping; index: number }>;
  endpoints: Endpoint[];
  labels: ModelGroupMappingVisualizerLabels;
}) {
  const totalWeight = mappings.reduce((total, { mapping }) => total + Math.max(0, mapping.weight ?? 100), 0);
  const rows = mappings.map(({ mapping, index }, row) => ({
    mapping,
    index,
    color: trafficColors[row % trafficColors.length],
    percentage: totalWeight > 0 ? Math.max(0, mapping.weight ?? 100) / totalWeight * 100 : 0
  }));
  let offset = 0;

  return (
    <div className="mapping-traffic-inspector">
      <div className="mapping-traffic-ring-wrap">
        <svg className="mapping-traffic-ring" viewBox="0 0 120 120" role="img" aria-label={labels.trafficShare}>
          <circle className="mapping-traffic-ring-track" cx="60" cy="60" r="45" pathLength="100" />
          {rows.map((row) => {
            const startOffset = offset;
            offset += row.percentage;
            return (
              <circle
                key={row.mapping.id ?? row.index}
                className="mapping-traffic-ring-segment"
                cx="60"
                cy="60"
                r="45"
                pathLength="100"
                stroke={row.color}
                strokeDasharray={`${row.percentage} ${100 - row.percentage}`}
                strokeDashoffset={-startOffset}
              />
            );
          })}
        </svg>
        <span className="mapping-traffic-ring-value">
          <strong>{rows.length > 0 ? '100%' : '0%'}</strong>
          <small>{labels.trafficShare}</small>
        </span>
      </div>
      {rows.length > 0 ? (
        <div className="mapping-traffic-list">
          {rows.map((row) => {
            const endpoint = endpoints.find((item) => item.id === row.mapping.endpointId);
            return (
              <div className="mapping-traffic-row" key={row.mapping.id ?? row.index}>
                <i style={{ backgroundColor: row.color }} />
                <span>
                  <strong title={row.mapping.modelId}>{row.mapping.modelId || labels.selectModel}</strong>
                  <small title={endpoint?.name}>{endpoint?.name || labels.provider}</small>
                </span>
                <b>{formatTrafficPercentage(row.percentage)}</b>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mapping-traffic-empty">{labels.noTraffic}</p>
      )}
    </div>
  );
}

function formatTrafficPercentage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (Math.abs(value - Math.round(value)) < 0.05) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
}
