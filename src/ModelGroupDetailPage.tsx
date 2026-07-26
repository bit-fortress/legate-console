import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, CircleAlert, Edit3, ExternalLink, GitBranch, RefreshCw, Server, X } from 'lucide-react';
import { getModelGroupMappingStatistics, LegateAPIError } from './api';
import type {
  Endpoint,
  EndpointGroup,
  ModelGroup,
  ModelGroupMapping,
  ModelGroupMappingStatistic,
  ModelGroupMappingStatistics
} from './types';
import { ModelGroupMappingVisualizer, type VisualizerSelection } from './ModelGroupMappingVisualizer';
import { ModelGroupUptimeChart } from './ModelGroupUptimeChart';
import { imageProtocolDisplayName } from './imageProtocols';
import { textProtocolDisplayName } from './textProtocols';

type RangeKey = '1h' | '24h' | '7d' | '30d';
type RuntimeState = 'loading' | 'denied' | 'error' | 'ready';
type DetailView = 'endpoints' | 'uptime' | 'routing';

const ranges: Array<{ key: RangeKey; milliseconds: number; bucket: '1m' | '30m' | '3h' | '12h' }> = [
  { key: '1h', milliseconds: 60 * 60 * 1000, bucket: '1m' },
  { key: '24h', milliseconds: 24 * 60 * 60 * 1000, bucket: '30m' },
  { key: '7d', milliseconds: 7 * 24 * 60 * 60 * 1000, bucket: '3h' },
  { key: '30d', milliseconds: 30 * 24 * 60 * 60 * 1000, bucket: '12h' }
];

interface ModelGroupDetailPageProps {
  group: ModelGroup | null;
  loading: boolean;
  staticError: 'notFound' | 'error' | '';
  endpoints: Endpoint[];
  endpointGroups: EndpointGroup[];
  workspaceSlug: string;
  canReadAnalytics: boolean;
  canReadEndpoints: boolean;
  canWriteGroups: boolean;
  t: (key: string) => string;
  onBack: () => void;
  onRetry: () => void;
  onEdit: (group: ModelGroup) => void;
  onViewEndpoint: (endpoint: Endpoint) => void;
}

export default function ModelGroupDetailPage({
  group,
  loading,
  staticError,
  endpoints,
  endpointGroups,
  workspaceSlug,
  canReadAnalytics,
  canReadEndpoints,
  canWriteGroups,
  t,
  onBack,
  onRetry,
  onEdit,
  onViewEndpoint
}: ModelGroupDetailPageProps) {
  const [range, setRange] = useState<RangeKey>('1h');
  const [statistics, setStatistics] = useState<ModelGroupMappingStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [statisticsError, setStatisticsError] = useState('');
  const [statisticsRefresh, setStatisticsRefresh] = useState(0);
  const [selection, setSelection] = useState<VisualizerSelection>(null);
  const [view, setView] = useState<DetailView>('endpoints');
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  const mappingRows = useMemo(() => group ? [...group.mappings].sort(compareMappings) : [], [group]);
  const selectedMappingIndex = selection?.type === 'mapping'
    ? mappingRows.findIndex((mapping, index) => selectionID(mapping, index) === selection.mappingId)
    : -1;
  const selectedMapping = selectedMappingIndex >= 0 ? mappingRows[selectedMappingIndex] : null;

  useEffect(() => {
    setRange('1h');
    setView('endpoints');
    setSelection(null);
    setStatistics(null);
    setStatisticsError('');
  }, [group?.id, workspaceSlug]);

  useEffect(() => {
    if (!group || !canReadAnalytics) {
      setStatistics(null);
      setStatisticsLoading(false);
      setStatisticsError('');
      return;
    }
    const controller = new AbortController();
    const selectedRange = ranges.find((item) => item.key === range) ?? ranges[0];
    const to = new Date();
    const from = new Date(to.getTime() - selectedRange.milliseconds);
    setStatistics(null);
    setStatisticsLoading(true);
    setStatisticsError('');
    void getModelGroupMappingStatistics({
      groupId: group.id,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: selectedRange.bucket,
      signal: controller.signal
    }).then((value) => {
      setStatistics(value);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setStatisticsError(statisticsErrorMessage(error, t));
    }).finally(() => {
      if (!controller.signal.aborted) setStatisticsLoading(false);
    });
    return () => controller.abort();
  }, [group?.id, group?.updatedAt, range, workspaceSlug, canReadAnalytics, statisticsRefresh, t]);

  useEffect(() => {
    if (selection?.type !== 'mapping') return;
    selectedRowRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selection]);

  useEffect(() => {
    if (!selectedMapping) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedMapping]);

  if (!group) {
    if (loading) return <div className="group-detail-loading" role="status">{t('app.loading')}</div>;
    return (
      <section className="group-detail-not-found">
        <CircleAlert size={28} />
        <h1>{staticError === 'error' ? t('groupDetail.loadError') : t('groupDetail.notFound')}</h1>
        {staticError === 'error' && <button type="button" className="btn" onClick={onRetry}><RefreshCw size={16} /> {t('actions.refresh')}</button>}
        <button type="button" className="btn" onClick={onBack}><ArrowLeft size={16} /> {t('groupDetail.back')}</button>
      </section>
    );
  }

  const statisticByIdentity = new Map(
    (statistics?.mappings ?? []).map((item) => [identityKey(item.endpointId, item.upstreamModelId), item])
  );
  const runtimeState: RuntimeState = !canReadAnalytics ? 'denied' : statisticsError ? 'error' : statistics ? 'ready' : 'loading';
  const selectedEndpoint = selectedMapping ? endpoints.find((item) => item.id === selectedMapping.endpointId) : undefined;
  const selectedEndpointModel = selectedMapping ? selectedEndpoint?.models.find((model) => model.id === selectedMapping.modelId) : undefined;
  const selectedStatistic = selectedMapping
    ? statisticByIdentity.get(identityKey(selectedMapping.endpointId, selectedMapping.modelId))
    : undefined;

  return (
    <div className="group-detail-page">
      <header className="group-detail-header">
        <div className="group-detail-heading">
          <button type="button" className="icon-button group-detail-back" onClick={onBack} title={t('groupDetail.back')} aria-label={t('groupDetail.back')}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{group.name}</h1>
            {group.description && <p>{group.description}</p>}
            <div className="group-detail-tags">
              <span>{group.status === 'normal' ? t('status.normal') : t('status.disabled')}</span>
              <span>{t(`kind.${group.kind}`)}</span>
              <span>{t('groupDetail.tieredFailover')}</span>
              {group.inboundProtocolContracts.map((contract) => (
                <span key={contract}>{group.kind === 'text' ? textProtocolDisplayName(contract as never) : imageProtocolDisplayName(contract as never)}</span>
              ))}
            </div>
            <div className="group-detail-meta">
              <span>{t('groupDetail.firstResponseTimeout')}: {group.effectiveFirstResponseTimeoutSeconds}s</span>
              <span>{t('groupDetail.sidecarMode')}: {group.sidecarConfigMode === 'full' ? t('groups.sidecarConfigFull') : t('groups.sidecarConfigReference')}</span>
            </div>
          </div>
        </div>
        <div className="group-detail-actions">
          <div className="segmented group-detail-range" role="group" aria-label={t('groupDetail.timeRange')}>
            {ranges.map((item) => (
              <button key={item.key} type="button" className={range === item.key ? 'active' : ''} aria-pressed={range === item.key} onClick={() => setRange(item.key)}>
                {t(`groupDetail.range.${item.key}`)}
              </button>
            ))}
          </div>
          {canWriteGroups && <button type="button" className="btn" onClick={() => onEdit(group)}><Edit3 size={16} /> {t('groupDetail.edit')}</button>}
        </div>
      </header>

      {!canReadAnalytics ? (
        <div className="notice group-detail-permission"><CircleAlert size={17} /> {t('groupDetail.analyticsDenied')}</div>
      ) : statisticsError ? (
        <div className="notice error group-detail-statistics-error">
          <CircleAlert size={17} /><span>{statisticsError}</span>
          <button type="button" className="btn compact" onClick={() => setStatisticsRefresh((value) => value + 1)}><RefreshCw size={14} /> {t('actions.refresh')}</button>
        </div>
      ) : null}

      <section className={`group-detail-metrics${statisticsLoading ? ' loading' : ''}`} aria-busy={statisticsLoading}>
        <Metric label={t('groupDetail.groupUptime')} value={runtimePercentage(runtimeState, statistics?.group.uptimePercentage, t)} />
        <Metric label={t('groupDetail.attempts')} value={runtimeCount(runtimeState, statistics?.group.attemptCount, t)} />
        <Metric label={t('groupDetail.schedulableEndpoints')} value={`${group.endpointAvailable} / ${group.endpointTotal}`} />
      </section>

      {statistics && !statistics.completeness.complete && (
        <div className="notice warning group-detail-completeness"><CircleAlert size={17} /> {t('groupDetail.incomplete')}</div>
      )}
      {(statistics?.group.historicalOnlyAttemptCount ?? 0) > 0 && (
        <div className="group-detail-history-note">{t('groupDetail.historicalOnly').replace('{count}', String(statistics?.group.historicalOnlyAttemptCount ?? 0))}</div>
      )}

      <section className="group-detail-workspace">
        <nav className="group-detail-nav" aria-label={t('groupDetail.sections')}>
          <button type="button" className={view === 'endpoints' ? 'active' : ''} aria-current={view === 'endpoints' ? 'page' : undefined} onClick={() => setView('endpoints')}>
            <Server size={17} /> {t('groupDetail.endpoints')}
          </button>
          <button type="button" className={view === 'uptime' ? 'active' : ''} aria-current={view === 'uptime' ? 'page' : undefined} onClick={() => setView('uptime')}>
            <Activity size={17} /> {t('groupDetail.uptime')}
          </button>
          <button type="button" className={view === 'routing' ? 'active' : ''} aria-current={view === 'routing' ? 'page' : undefined} onClick={() => setView('routing')}>
            <GitBranch size={17} /> {t('groupDetail.routing')}
          </button>
        </nav>

        <div className="group-detail-content">
          {view === 'endpoints' && (
            <section className="group-detail-section">
              <div className="group-detail-section-title"><h2>{t('groupDetail.endpoints')}</h2><span>{mappingRows.length}</span></div>
              {mappingRows.length === 0 ? <div className="group-detail-empty">{t('groupDetail.noMappings')}</div> : (
                <div className="group-endpoint-table-scroll">
                  <table className="data-table group-endpoint-table">
                    <thead><tr>
                      <th>{t('groupDetail.endpoints')}</th><th>{t('groups.model')}</th><th>{t('groupDetail.price')}</th>
                      <th>{t('groupDetail.p50TTFO')}</th><th>{t('groupDetail.p50TPS')}</th>
                      <th>{t('groupDetail.attempts')}</th><th>{t('groups.uptime')}</th>
                    </tr></thead>
                    <tbody>{mappingRows.map((mapping, index) => {
                      const endpoint = endpoints.find((item) => item.id === mapping.endpointId);
                      const endpointGroup = endpointGroups.find((item) => item.id === endpoint?.groupId);
                      const endpointModel = endpoint?.models.find((item) => item.id === mapping.modelId);
                      const statistic = statisticByIdentity.get(identityKey(mapping.endpointId, mapping.modelId));
                      const selected = selectedMappingIndex === index;
                      return (
                        <tr
                          key={mapping.id ?? `${mapping.endpointId}:${mapping.modelId}:${index}`}
                          ref={selected ? selectedRowRef : undefined}
                          className={selected ? 'selected' : ''}
                          tabIndex={0}
                          aria-selected={selected}
                          onClick={() => setSelection({ type: 'mapping', mappingId: selectionID(mapping, index) })}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelection({ type: 'mapping', mappingId: selectionID(mapping, index) }); } }}
                        >
                          <td><strong title={endpoint?.name}>{endpoint?.name ?? `#${mapping.endpointId}`}</strong><small title={endpointGroup?.name}>{endpointGroup?.name ?? t('groupDetail.endpointRestricted')}</small></td>
                          <td><code title={mapping.modelId}>{mapping.modelId}</code><small>{t('groups.tier')} {(mapping.tier ?? 0) + 1} · {t('groups.weight')} {mapping.weight ?? 100}</small></td>
                          <td>{!canReadEndpoints ? t('groupDetail.endpointRestricted') : endpointModel ? `${formatPrice(endpointModel.inputPricePerMillion)} / ${formatPrice(endpointModel.outputPricePerMillion)}` : t('groupDetail.configUnavailable')}</td>
                          <td>{runtimeMetric(runtimeState, statistic?.p50TimeToFirstOutputMs, ' ms', t)}</td>
                          <td>{runtimeMetric(runtimeState, statistic?.p50TokensPerSecond, ' tok/s', t)}</td>
                          <td>{runtimeCount(runtimeState, statistic?.attemptCount, t)}</td>
                          <td><UptimeCell statistic={statistic} state={runtimeState} t={t} /></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}

            </section>
          )}

          {view === 'uptime' && (
            <section className="group-detail-section">
              <div className="group-detail-section-title"><h2>{t('groupDetail.groupUptime')}</h2><span>{runtimePercentage(runtimeState, statistics?.group.uptimePercentage, t)}</span></div>
              <div className="group-uptime-panel">
                <header>
                  <div><span>{t('groupDetail.timeRange')}</span><strong>{formatWindow(statistics, t)}</strong></div>
                  <div><span>{t('groupDetail.attempts')}</span><strong>{runtimeCount(runtimeState, statistics?.group.attemptCount, t)}</strong></div>
                </header>
                <ModelGroupUptimeChart
                  buckets={runtimeState === 'ready' ? statistics?.group.buckets ?? [] : []}
                  label={t('groupDetail.groupUptimeTrend')}
                  noSampleLabel={runtimeLabelForChart(runtimeState, t)}
                  formatTime={formatBucketTime}
                />
                <div className="group-uptime-axis">{windowAxis(statistics, t).map((label, axisIndex) => <span key={`${label}:${axisIndex}`}>{label}</span>)}</div>
              </div>
            </section>
          )}

          {view === 'routing' && (
            <section className="group-detail-section">
              <div className="group-detail-section-title"><h2>{t('groupDetail.routing')}</h2><span>{t('groupDetail.readonly')}</span></div>
              <ModelGroupMappingVisualizer
                mode="readonly"
                groupName={group.name}
                groupKind={group.kind}
                mappings={mappingRows}
                endpoints={endpoints}
                labels={visualizerLabels(t)}
                tierLabel={(tier) => tier === 0 ? t('groups.primaryTier') : `${t('groups.backupTier')} ${tier}`}
                endpointGroupName={(groupId) => endpointGroups.find((item) => item.id === groupId)?.name}
                selection={selection}
                onSelectionChange={setSelection}
              />
            </section>
          )}
        </div>
      </section>

      {selectedMapping && (
        <EndpointDetailDrawer
          endpoint={selectedEndpoint}
          endpointGroup={selectedEndpoint ? endpointGroups.find((item) => item.id === selectedEndpoint.groupId) : undefined}
          endpointModel={selectedEndpointModel}
          mapping={selectedMapping}
          statistic={selectedStatistic}
          statistics={statistics}
          state={runtimeState}
          canReadEndpoints={canReadEndpoints}
          t={t}
          onClose={() => setSelection(null)}
          onViewEndpoint={onViewEndpoint}
        />
      )}
    </div>
  );
}

interface EndpointDetailDrawerProps {
  endpoint?: Endpoint;
  endpointGroup?: EndpointGroup;
  endpointModel?: Endpoint['models'][number];
  mapping: ModelGroupMapping;
  statistic?: ModelGroupMappingStatistic;
  statistics: ModelGroupMappingStatistics | null;
  state: RuntimeState;
  canReadEndpoints: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onViewEndpoint: (endpoint: Endpoint) => void;
}

function EndpointDetailDrawer({
  endpoint,
  endpointGroup,
  endpointModel,
  mapping,
  statistic,
  statistics,
  state,
  canReadEndpoints,
  t,
  onClose,
  onViewEndpoint
}: EndpointDetailDrawerProps) {
  const endpointName = endpoint?.name ?? `#${mapping.endpointId}`;
  return (
    <aside className="group-endpoint-drawer" aria-label={endpointName}>
      <header className="group-endpoint-drawer-header">
        <div><h2>{endpointName}</h2><code>{mapping.modelId}</code></div>
        <button type="button" className="icon-button" onClick={onClose} title={t('groupDetail.closeEndpointDetails')} aria-label={t('groupDetail.closeEndpointDetails')}>
          <X size={17} />
        </button>
      </header>
      <div className="group-endpoint-drawer-body">
        <div className="group-endpoint-detail-metrics">
          <Metric label={t('groupDetail.p50TTFO')} value={runtimeMetric(state, statistic?.p50TimeToFirstOutputMs, ' ms', t)} />
          <Metric label={t('groupDetail.p50TPS')} value={runtimeMetric(state, statistic?.p50TokensPerSecond, ' tok/s', t)} />
          <Metric label={t('groups.uptime')} value={runtimePercentage(state, statistic?.uptimePercentage, t)} />
        </div>

        <section className="group-endpoint-drawer-section">
          <div className="group-endpoint-drawer-section-title">
            <h3>{t('groupDetail.recentUptime')}</h3>
            <strong>{runtimePercentage(state, statistic?.uptimePercentage, t)}</strong>
          </div>
          <div className="group-uptime-range">{formatWindow(statistics, t)}</div>
          <UptimeBand statistic={statistic} state={state} t={t} />
          <div className="group-uptime-axis">{windowAxis(statistics, t).map((label, index) => <span key={`${label}:${index}`}>{label}</span>)}</div>
        </section>

        <section className="group-endpoint-drawer-section">
          <div className="group-endpoint-drawer-section-title">
            <h3>{t('groupDetail.specifications')}</h3>
            {canReadEndpoints && endpoint && (
              <button type="button" className="btn compact" onClick={() => onViewEndpoint(endpoint)}><ExternalLink size={14} /> {t('groupDetail.viewEndpoint')}</button>
            )}
          </div>
          <dl className="group-endpoint-detail-grid">
            <Detail label={t('groupDetail.attempts')} value={runtimeCount(state, statistic?.attemptCount, t)} />
            <Detail label={t('groups.model')} value={mapping.modelId} code />
            {canReadEndpoints && endpoint && <>
              <Detail label={t('endpoints.group')} value={endpointGroup?.name ?? `#${endpoint.groupId}`} />
              <Detail label={t('endpoints.kind')} value={t(`kind.${endpoint.kind}`)} />
              <Detail label={t('endpoints.status')} value={endpoint.status === 'enabled' ? t('status.enabled') : endpoint.status === 'disabled' ? t('status.disabled') : t('status.error')} />
              <Detail label={t('endpoints.schedule')} value={endpoint.scheduleEnabled ? t('status.enabled') : t('status.disabled')} />
              <Detail label={t('groupDetail.price')} value={endpointModel ? `${formatPrice(endpointModel.inputPricePerMillion)} / ${formatPrice(endpointModel.outputPricePerMillion)}` : t('groupDetail.configUnavailable')} />
              <Detail label={t('endpoints.baseUrl')} value={endpoint.baseUrl} code />
              <Detail label={t('endpoints.driver')} value={endpoint.driverRef} code />
            </>}
          </dl>
          {canReadEndpoints && !endpoint && <div className="notice warning">{t('groupDetail.configUnavailable')}</div>}
        </section>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="group-detail-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Detail({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return <div><dt>{label}</dt><dd title={value}>{code ? <code>{value}</code> : value}</dd></div>;
}

function UptimeCell({ statistic, state, t }: { statistic?: ModelGroupMappingStatistic; state: RuntimeState; t: (key: string) => string }) {
  return (
    <div className={`mapping-uptime-cell${state === 'loading' ? ' loading' : ''}`}>
      <UptimeBand statistic={statistic} state={state} t={t} compact />
      <strong>{runtimePercentage(state, statistic?.uptimePercentage, t)}</strong>
    </div>
  );
}

function UptimeBand({ statistic, state, t, compact = false }: { statistic?: ModelGroupMappingStatistic; state: RuntimeState; t: (key: string) => string; compact?: boolean }) {
  const buckets = statistic?.buckets ?? [];
  const showBuckets = state === 'ready' && buckets.length > 0;
  return (
    <div className={`mapping-uptime-buckets${compact ? ' compact' : ''}${state === 'loading' ? ' loading' : ''}`} aria-label={t('groupDetail.uptimeBuckets')}>
      {showBuckets && buckets.map((bucket) => {
        const label = `${formatBucketTime(bucket.from)} - ${formatBucketTime(bucket.to)}: ${bucket.availableAttemptCount}/${bucket.attemptCount}, ${formatPercentage(bucket.uptimePercentage, t)}`;
        return <span key={bucket.from} tabIndex={0} className={bucketTone(bucket.uptimePercentage)} title={label} aria-label={label} />;
      })}
      {!showBuckets && Array.from({ length: 48 }, (_, index) => <span key={index} className="empty" />)}
    </div>
  );
}

function compareMappings(left: ModelGroupMapping, right: ModelGroupMapping): number {
  return (left.tier ?? 0) - (right.tier ?? 0) || (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || (left.id ?? 0) - (right.id ?? 0);
}

function selectionID(mapping: ModelGroupMapping, index: number): number { return mapping.id ?? -(index + 1); }
function identityKey(endpointId: number, modelId: string): string { return `${endpointId}\u0000${modelId}`; }
function formatPrice(value: string): string { return `$${value}`; }
function formatPercentage(value: number | null | undefined, t: (key: string) => string): string { return value == null ? t('groupDetail.noSample') : `${value.toFixed(2).replace(/\.00$/, '')}%`; }
function formatMetric(value: number | null | undefined, suffix: string, t: (key: string) => string): string { return value == null ? t('groupDetail.noSample') : `${value.toFixed(1).replace(/\.0$/, '')}${suffix}`; }
function runtimeLabel(state: Exclude<RuntimeState, 'ready'>, t: (key: string) => string): string {
  if (state === 'loading') return t('groupDetail.runtimeLoading');
  if (state === 'denied') return t('groupDetail.noPermission');
  return t('groupDetail.runtimeError');
}
function runtimePercentage(state: RuntimeState, value: number | null | undefined, t: (key: string) => string): string {
  return state === 'ready' ? formatPercentage(value, t) : runtimeLabel(state, t);
}
function runtimeMetric(state: RuntimeState, value: number | null | undefined, suffix: string, t: (key: string) => string): string {
  return state === 'ready' ? formatMetric(value, suffix, t) : runtimeLabel(state, t);
}
function runtimeCount(state: RuntimeState, value: number | undefined, t: (key: string) => string): string {
  return state === 'ready' ? String(value ?? 0) : runtimeLabel(state, t);
}
function runtimeLabelForChart(state: RuntimeState, t: (key: string) => string): string {
  return state === 'ready' ? t('groupDetail.noSample') : runtimeLabel(state, t);
}
function formatBucketTime(value: string): string { return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatWindow(statistics: ModelGroupMappingStatistics | null, t: (key: string) => string): string {
  if (!statistics) return t('groupDetail.runtimeLoading');
  return `${formatBucketTime(statistics.window.from)} - ${formatBucketTime(statistics.window.to)}`;
}
function windowAxis(statistics: ModelGroupMappingStatistics | null, t: (key: string) => string): string[] {
  if (!statistics) return [t('groupDetail.runtimeLoading'), '', ''];
  const from = new Date(statistics.window.from);
  const to = new Date(statistics.window.to);
  const middle = new Date((from.getTime() + to.getTime()) / 2);
  return [formatBucketTime(from.toISOString()), formatBucketTime(middle.toISOString()), t('groupDetail.now')];
}
function bucketTone(value: number | null): string { return value == null ? 'empty' : value >= 99 ? 'good' : value >= 95 ? 'warning' : 'bad'; }
function statisticsErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof LegateAPIError && error.status === 403) return t('groupDetail.analyticsDenied');
  return t('groupDetail.statisticsError');
}

function visualizerLabels(t: (key: string) => string) {
  return {
    start: t('groups.routeStart'), layer: t('groups.layer'), model: t('groups.model'), endpoint: t('groups.endpoint'),
    tier: t('groups.tier'), weight: t('groups.weight'), addModel: t('groups.addModel'), addFallback: t('groups.addFallback'),
    deleteModel: t('groups.deleteModel'), modelConfiguration: t('groups.modelConfiguration'), noModelSelected: t('groups.noModelSelected'),
    selectModel: t('groups.selectModel'), layerTraffic: t('groups.layerTraffic'), trafficShare: t('groups.trafficShare'),
    noTraffic: t('groups.noTraffic'), pendingApply: t('groups.pendingApply'), endpointGroup: t('endpoints.group'),
    schedulable: t('groupDetail.schedulable'), yes: t('groupDetail.yes'), no: t('groupDetail.no')
  };
}
