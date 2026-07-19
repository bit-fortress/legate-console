import type {
  InvocationAnalyticsCompleteness,
  InvocationAnalyticsSummary,
  InvocationAttempt,
  InvocationOutcome,
  InvocationRequest,
  StreamStatus,
  UsageStatus
} from './types';

type Translator = (key: string) => string;

export function AnalyticsCompletenessBanner({
  completeness,
  t
}: {
  completeness: InvocationAnalyticsCompleteness;
  t: Translator;
}) {
  if (completeness.complete) return null;

  const facts = completenessFacts(completeness, t);
  return (
    <section className="analytics-completeness-warning" role="status" aria-label={t('analytics.completenessWarning')}>
      <div>
        <strong>{t('analytics.completenessWarning')}</strong>
        <span>{t('analytics.completenessWindow')}</span>
      </div>
      <ul>
        {facts.map((fact) => <li key={fact}>{fact}</li>)}
      </ul>
    </section>
  );
}

export function AnalyticsSummaryView({
  summary,
  t
}: {
  summary: InvocationAnalyticsSummary;
  t: Translator;
}) {
  const availability = summary.attempts.count === 0
    ? 0
    : (summary.attempts.availableCount * 100) / summary.attempts.count;
  const costLabel = summary.attempts.cost.unknownAttemptCount > 0
    ? t('analytics.knownCost')
    : t('analytics.cost');

  return (
    <>
      <AnalyticsCompletenessBanner completeness={summary.completeness} t={t} />
      <section className="analytics-summary-grid" aria-label={t('analytics.summary')}>
        <SummaryGroup title={t('analytics.requestOutcomes')}>
          <SummaryMetric label={t('analytics.totalRequests')} value={formatInteger(summary.requests.count)} />
          <SummaryMetric label={t('analytics.successfulRequests')} value={formatInteger(summary.requests.successfulCount)} />
          <SummaryMetric label={t('analytics.failedRequests')} value={formatInteger(summary.requests.failedCount)} />
          <SummaryMetric label={t('analytics.averageLatency')} value={formatOptionalLatency(summary.requests.averageDurationMs)} />
        </SummaryGroup>

        <SummaryGroup title={t('analytics.attemptHealth')}>
          <SummaryMetric label={t('analytics.totalAttempts')} value={formatInteger(summary.attempts.count)} />
          <SummaryMetric label={t('analytics.successfulAttempts')} value={formatInteger(summary.attempts.successfulCount)} />
          <SummaryMetric label={t('analytics.failedAttempts')} value={formatInteger(summary.attempts.failedCount)} />
          <SummaryMetric
            label={t('analytics.availableAttempts')}
            value={`${formatPercent(availability)} (${summary.attempts.availableCount}/${summary.attempts.count})`}
          />
          <SummaryMetric label={t('analytics.retryableAttempts')} value={formatInteger(summary.attempts.retryableCount)} />
          <SummaryMetric label={t('analytics.retriedAttempts')} value={formatInteger(summary.attempts.retriedCount)} />
          <SummaryMetric label={t('analytics.committedAttempts')} value={formatInteger(summary.attempts.committedCount)} />
        </SummaryGroup>

        <SummaryGroup title={t('analytics.usageCoverage')}>
          <SummaryMetric label={t('analytics.usageFinal')} value={formatInteger(summary.attempts.usage.finalAttemptCount)} />
          <SummaryMetric label={t('analytics.usagePartial')} value={formatInteger(summary.attempts.usage.partialAttemptCount)} />
          <SummaryMetric label={t('analytics.usageUnavailable')} value={formatInteger(summary.attempts.usage.unavailableAttemptCount)} />
          <SummaryMetric label={t('analytics.inputTokens')} value={formatOptionalInteger(summary.attempts.usage.knownInputTokens)} />
          <SummaryMetric label={t('analytics.outputTokens')} value={formatOptionalInteger(summary.attempts.usage.knownOutputTokens)} />
          <SummaryMetric label={t('analytics.cachedTokens')} value={formatOptionalInteger(summary.attempts.usage.knownCachedTokens)} />
          <SummaryMetric label={t('analytics.reasoningTokens')} value={formatOptionalInteger(summary.attempts.usage.knownReasoningTokens)} />
          <SummaryMetric label={costLabel} value={formatNanoUSD(summary.attempts.cost.knownEndpointCostNanoUSD)} />
          {summary.attempts.cost.unknownAttemptCount > 0 && (
            <SummaryMetric label={t('analytics.unknownCostAttempts')} value={formatInteger(summary.attempts.cost.unknownAttemptCount)} />
          )}
          <SummaryMetric label={t('analytics.averageTTFE')} value={formatOptionalLatency(summary.attempts.averageTimeToFirstEventMs)} />
          <SummaryMetric label={t('analytics.averageTTFO')} value={formatOptionalLatency(summary.attempts.averageTimeToFirstOutputMs)} />
        </SummaryGroup>
      </section>
    </>
  );
}

export function AnalyticsRequestTable({
  requests,
  t
}: {
  requests: InvocationRequest[];
  t: Translator;
}) {
  return (
    <div className="analytics-table-scroll">
      <table className="data-table analytics-request-table">
        <thead>
          <tr>
            <th>{t('analytics.request')}</th>
            <th>{t('analytics.route')}</th>
            <th>{t('analytics.mode')}</th>
            <th>{t('analytics.outcome')}</th>
            <th>{t('analytics.timing')}</th>
            <th>{t('analytics.io')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.eventId}>
              <td>
                <div className="analytics-cell-stack">
                  <strong>{request.groupName}</strong>
                  <code title={request.requestId}>{shortID(request.requestId)}</code>
                  <span>{request.role === 'origin' ? t('analytics.originRequest') : t('analytics.internalForward')}</span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack">
                  <code title={request.requestPath}>{request.requestPath}</code>
                  <span>{request.invocation.protocol} · {request.invocation.operation}</span>
                  <span>{request.entryLocation} → {request.executionLocation}</span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack">
                  <StatusBadge label={request.mode === 'sse' ? 'SSE' : t('analytics.buffered')} tone={request.mode === 'sse' ? 'purple' : 'blue'} />
                  <span>{request.responseCommitted ? t('analytics.committed') : t('analytics.notCommitted')}</span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack">
                  <StatusBadge label={outcomeLabel(request.outcome, t)} tone={outcomeTone(request.outcome)} />
                  <span>{t('analytics.transportStatus')} {streamStatusLabel(request.streamStatus, t)}</span>
                  <span>{t('analytics.responseStatus')} {formatHTTPStatus(request.responseStatusCode)}</span>
                  {requestReason(request) && <code className="analytics-reason">{requestReason(request)}</code>}
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-measurements">
                  <span>{t('analytics.duration')} <strong>{formatOptionalLatency(request.durationMs)}</strong></span>
                  <span>TTFE <strong>{formatOptionalLatency(request.timeToFirstEventMs)}</strong></span>
                  <span>TTFO <strong>{formatOptionalLatency(request.timeToFirstOutputMs)}</strong></span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-measurements">
                  <span>{t('analytics.downstreamShort')} <strong>{formatOptionalBytes(request.downstreamBytes)}</strong></span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <div className="empty-state">{t('overview.noTraffic')}</div>}
    </div>
  );
}

export function AnalyticsAttemptTable({
  attempts,
  t
}: {
  attempts: InvocationAttempt[];
  t: Translator;
}) {
  return (
    <div className="analytics-table-scroll">
      <table className="data-table analytics-attempt-table">
        <thead>
          <tr>
            <th>{t('analytics.endpoint')}</th>
            <th>{t('analytics.route')}</th>
            <th>{t('analytics.driver')}</th>
            <th>{t('analytics.mode')}</th>
            <th>{t('analytics.outcome')}</th>
            <th>{t('analytics.timing')}</th>
            <th>{t('analytics.usage')}</th>
            <th>{t('analytics.io')}</th>
            <th>{t('analytics.costAndRate')}</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => (
            <tr key={attempt.eventId}>
              <td>
                <div className="analytics-cell-stack">
                  <strong>{attempt.endpointName}</strong>
                  <code title={attempt.requestPath}>{attempt.requestPath}</code>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack">
                  <strong>{attempt.groupName}</strong>
                  <code title={attempt.upstreamModelId}>{attempt.upstreamModelId}</code>
                  <span>{t('analytics.attempt')} {attempt.attemptIndex} · {t('analytics.tier')} {attempt.routingTier}</span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-driver-cell">
                  <StatusBadge
                    label={driverRuntimeLabel(attempt.driverRuntimeKind, t)}
                    tone={attempt.driverRuntimeKind === 'wasm' ? 'purple' : 'blue'}
                  />
                  <code title={attempt.driverRef}>{attempt.driverRef}</code>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack">
                  <StatusBadge label={attempt.mode === 'sse' ? 'SSE' : t('analytics.buffered')} tone={attempt.mode === 'sse' ? 'purple' : 'blue'} />
                  <span>{attempt.responseCommitted ? t('analytics.committed') : t('analytics.notCommitted')}</span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack">
                  <StatusBadge label={outcomeLabel(attempt.outcome, t)} tone={outcomeTone(attempt.outcome)} />
                  <span>{t('analytics.transportStatus')} {streamStatusLabel(attempt.streamStatus, t)}</span>
                  <span>{attempt.available ? t('status.available') : t('status.unavailable')} · {attempt.final ? t('status.final') : t('status.retry')}</span>
                  <span>{t('analytics.responseStatus')} {formatHTTPStatus(attempt.responseStatusCode)} · {t('analytics.upstreamStatus')} {formatHTTPStatus(attempt.upstreamStatusCode)}</span>
                  {attemptReason(attempt) && <code className="analytics-reason" title={attemptReason(attempt)}>{attemptReason(attempt)}</code>}
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-measurements">
                  <span>{t('analytics.duration')} <strong>{formatOptionalLatency(attempt.durationMs)}</strong></span>
                  <span>TTFE <strong>{formatOptionalLatency(attempt.timeToFirstEventMs)}</strong></span>
                  <span>TTFO <strong>{formatOptionalLatency(attempt.timeToFirstOutputMs)}</strong></span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-usage-cell">
                  <StatusBadge label={usageStatusLabel(attempt.usageStatus, t)} tone={usageStatusTone(attempt.usageStatus)} />
                  <span>{t('analytics.inputShort')} <strong>{formatOptionalInteger(attempt.inputTokens)}</strong> · {t('analytics.outputShort')} <strong>{formatOptionalInteger(attempt.outputTokens)}</strong></span>
                  <span>{t('analytics.cachedShort')} <strong>{formatOptionalInteger(attempt.cachedTokens)}</strong> · {t('analytics.reasoningShort')} <strong>{formatOptionalInteger(attempt.reasoningTokens)}</strong></span>
                  <span>{usageProvenanceLabel(attempt.usageProvenance, t)}</span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-measurements">
                  <span>{t('analytics.upstreamShort')} <strong>{formatOptionalBytes(attempt.upstreamBytes)}</strong></span>
                  <span>{t('analytics.downstreamShort')} <strong>{formatOptionalBytes(attempt.downstreamBytes)}</strong></span>
                  <span>{t('analytics.eventsShort')} <strong>{formatOptionalInteger(attempt.streamEventCount)}</strong></span>
                </div>
              </td>
              <td>
                <div className="analytics-cell-stack analytics-measurements">
                  <strong>{formatNanoUSD(attempt.endpointCostNanoUSD)}</strong>
                  <span>TPS <strong>{formatOptionalDecimal(attempt.tokensPerSecond)}</strong></span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {attempts.length === 0 && <div className="empty-state">{t('overview.noTraffic')}</div>}
    </div>
  );
}

function SummaryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="analytics-summary-group"><h3>{title}</h3><dl>{children}</dl></div>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="analytics-summary-metric"><dt>{label}</dt><dd>{value}</dd></div>;
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function completenessFacts(value: InvocationAnalyticsCompleteness, t: Translator): string[] {
  const facts: string[] = [];
  const add = (count: number, key: string) => { if (count > 0) facts.push(`${t(key)}: ${formatInteger(count)}`); };
  add(value.knownLossSourceCount, 'analytics.completenessKnownLoss');
  add(value.unknownLossSourceCount, 'analytics.completenessUnknownLoss');
  add(value.staleSourceCount, 'analytics.completenessStale');
  add(value.coverageGapSourceCount, 'analytics.completenessCoverageGap');
  add(value.watermarkMissingSourceCount, 'analytics.completenessWatermarkMissing');
  add(value.missingCurrentSessionSourceCount, 'analytics.completenessMissingSession');
  add(value.inactiveSourceCount, 'analytics.completenessInactive');
  add(value.pendingQueueSourceCount, 'analytics.completenessPendingQueue');
  add(value.pendingInFlightSourceCount, 'analytics.completenessPendingInFlight');
  add(value.saturatedSourceCount, 'analytics.completenessSaturated');
  if (value.knownDroppedEventCount > 0) facts.push(`${t('analytics.completenessDropped')}: ${formatInteger(value.knownDroppedEventCount)}`);
  if (value.dropCounterSaturated || value.knownDroppedEventCountSaturated) facts.push(t('analytics.completenessCounterSaturated'));
  if (facts.length === 0) facts.push(t('analytics.completenessCoveragePending'));
  return facts;
}

function streamStatusLabel(status: StreamStatus, t: Translator): string {
  return t(`analytics.streamStatus.${status}`);
}

function outcomeLabel(outcome: InvocationOutcome, t: Translator): string {
  return t(`analytics.outcome.${outcome}`);
}

function outcomeTone(outcome: InvocationOutcome): string {
  switch (outcome) {
    case 'success': return 'good';
    case 'client_error':
    case 'canceled': return 'muted';
    case 'auth_error': return 'blue';
    case 'routing_error':
    case 'capacity_error': return 'purple';
    default: return 'danger';
  }
}

function usageStatusLabel(status: UsageStatus, t: Translator): string {
  return t(`analytics.usageStatus.${status}`);
}

function usageStatusTone(status: UsageStatus): string {
  if (status === 'final') return 'good';
  if (status === 'partial') return 'blue';
  return 'muted';
}

function usageProvenanceLabel(provenance: InvocationAttempt['usageProvenance'], t: Translator): string {
  return t(`analytics.usageProvenance.${provenance}`);
}

function driverRuntimeLabel(kind: InvocationAttempt['driverRuntimeKind'], t: Translator): string {
  return kind === 'wasm' ? 'WASM' : t('analytics.builtinDriver');
}

function requestReason(request: InvocationRequest): string {
  return request.errorCode || nonSuccessTermination(request.terminationReason);
}

function attemptReason(attempt: InvocationAttempt): string {
  return attempt.errorCode || attempt.usageErrorCode || attempt.failoverReason || nonSuccessTermination(attempt.terminationReason);
}

function nonSuccessTermination(reason: string | null): string {
  return reason === 'completed' ? '' : reason || '';
}

function shortID(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 17)}...`;
}

function formatHTTPStatus(value: number | null): string {
  return value === null || value === 0 ? '-' : String(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatOptionalInteger(value: number | null): string {
  return value === null ? '-' : formatInteger(value);
}

function formatOptionalDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatNanoUSD(value: string | null): string {
  if (value === null || !/^(0|[1-9][0-9]*)$/.test(value)) return '-';
  const padded = value.padStart(10, '0');
  const whole = padded.slice(0, -9).replace(/^0+(?=\d)/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = padded.slice(-9).replace(/0+$/, '');
  return `$${grouped}${fraction ? `.${fraction}` : ''}`;
}

function formatOptionalLatency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatOptionalBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  if (value < 1024) return `${formatInteger(value)} B`;
  if (value < 1024 * 1024) return `${formatOptionalDecimal(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${formatOptionalDecimal(value / (1024 * 1024))} MB`;
  return `${formatOptionalDecimal(value / (1024 * 1024 * 1024))} GB`;
}
