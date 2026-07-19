// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AnalyticsAttemptTable,
  AnalyticsCompletenessBanner,
  AnalyticsRequestTable,
  AnalyticsSummaryView,
  formatNanoUSD
} from './AnalyticsViews';
import { createTranslator } from './i18n';
import type {
  InvocationAnalyticsCompleteness,
  InvocationAnalyticsSummary,
  InvocationAttempt,
  InvocationOutcome,
  InvocationRequest,
  StreamStatus
} from './types';

const t = createTranslator('en');

describe('analytics views', () => {
  afterEach(cleanup);

  it('renders request and attempt summary axes without treating attempts as requests', () => {
    render(<AnalyticsSummaryView summary={summaryFixture()} t={t} />);

    expect(metric('Total requests')).toHaveTextContent('3');
    expect(metric('Successful requests')).toHaveTextContent('2');
    expect(metric('Total attempts')).toHaveTextContent('5');
    expect(metric('Available attempts')).toHaveTextContent('80% (4/5)');
    expect(metric('Input tokens')).toHaveTextContent('-');
    expect(metric('Output tokens')).toHaveTextContent('0');
    expect(metric('Average TTFE')).toHaveTextContent('-');
    expect(metric('Average TTFO')).toHaveTextContent('0ms');
    expect(metric('Known cost')).toHaveTextContent('$9,007,199.254740993');
    expect(metric('Unknown-cost attempts')).toHaveTextContent('2');
  });

  it('does not render a completeness warning for complete telemetry', () => {
    render(<AnalyticsCompletenessBanner completeness={completeCompleteness()} t={t} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders all material incomplete telemetry facts', () => {
    const completeness = completeCompleteness();
    completeness.complete = false;
    completeness.knownLossSourceCount = 1;
    completeness.unknownLossSourceCount = 2;
    completeness.staleSourceCount = 1;
    completeness.coverageGapSourceCount = 1;
    completeness.pendingQueueSourceCount = 1;
    completeness.pendingInFlightSourceCount = 1;
    completeness.saturatedSourceCount = 1;
    completeness.knownDroppedEventCount = 17;

    render(<AnalyticsCompletenessBanner completeness={completeness} t={t} />);

    const warning = screen.getByRole('status', { name: 'Telemetry is incomplete' });
    expect(warning).toHaveTextContent('Known loss: 1');
    expect(warning).toHaveTextContent('Unknown loss: 2');
    expect(warning).toHaveTextContent('Stale sources: 1');
    expect(warning).toHaveTextContent('Coverage gaps: 1');
    expect(warning).toHaveTextContent('Queued telemetry: 1');
    expect(warning).toHaveTextContent('In-flight telemetry: 1');
    expect(warning).toHaveTextContent('Saturated counters: 1');
    expect(warning).toHaveTextContent('Known dropped events: 17');
  });

  it('renders origin requests independently from attempts', () => {
    render(<AnalyticsRequestTable requests={[requestFixture()]} t={t} />);

    const row = screen.getByText('chat').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Origin request');
    expect(row).toHaveTextContent('openai · responses');
    expect(row).toHaveTextContent('central → central');
    expect(row).toHaveTextContent('Response HTTP 200');
  });

  it('shows nullable usage, timing, I/O, and Driver identity without arithmetic', () => {
    render(<AnalyticsAttemptTable attempts={[attemptFixture('partial_failure')]} t={t} />);

    const row = screen.getByText('Endpoint A').closest('tr');
    const scoped = within(row as HTMLTableRowElement);
    expect(scoped.getByText('SSE')).toBeInTheDocument();
    expect(scoped.getByText('Response committed')).toBeInTheDocument();
    expect(scoped.getByText('Transport: Partial failure')).toBeInTheDocument();
    expect(scoped.getByText('Upstream error')).toBeInTheDocument();
    expect(scoped.getByText('Partial usage')).toBeInTheDocument();
    expect(scoped.getByText('Driver accumulated')).toBeInTheDocument();
    expect(scoped.getByText('WASM')).toBeInTheDocument();
    expect(row).toHaveTextContent('TTFE 0ms');
    expect(row).toHaveTextContent('TTFO -');
    expect(row).toHaveTextContent('Input 0 · Output -');
    expect(row).toHaveTextContent('Upstream 0 B');
    expect(row).toHaveTextContent('Downstream -');
    expect(row).toHaveTextContent('Response HTTP 502 · Upstream HTTP 503');
  });

  it('keeps a completed raw HTTP 200 failure visually failed and preserves a missing raw status', () => {
    const projectedFailure: InvocationAttempt = {
      ...attemptFixture('completed'),
      upstreamStatusCode: 200,
      responseStatusCode: 502,
      outcome: 'upstream_error',
      available: false,
      terminationReason: 'response.failed'
    };
    const missingRaw: InvocationAttempt = {
      ...attemptFixture('failed_before_commit', 'event-2'),
      endpointName: 'Endpoint B',
      upstreamStatusCode: null,
      responseStatusCode: null,
      outcome: 'routing_error'
    };

    render(<AnalyticsAttemptTable attempts={[projectedFailure, missingRaw]} t={t} />);

    const failedRow = screen.getByText('Endpoint A').closest('tr');
    expect(within(failedRow as HTMLTableRowElement).getByText('Upstream error')).toHaveClass('status-badge', 'danger');
    expect(failedRow).toHaveTextContent('Response HTTP 502 · Upstream HTTP 200');
    expect(screen.getByText('Endpoint B').closest('tr')).toHaveTextContent('Response HTTP - · Upstream HTTP -');
  });

  it('renders every invocation outcome with a stable label and tone', () => {
    const cases: Array<[InvocationOutcome, string, string]> = [
      ['success', 'Success', 'good'],
      ['client_error', 'Client error', 'muted'],
      ['auth_error', 'Authentication error', 'blue'],
      ['routing_error', 'Routing error', 'purple'],
      ['capacity_error', 'Capacity error', 'purple'],
      ['upstream_error', 'Upstream error', 'danger'],
      ['timeout', 'Timeout', 'danger'],
      ['canceled', 'Canceled', 'muted'],
      ['internal_error', 'Internal error', 'danger']
    ];
    const attempts = cases.map(([outcome], index) => ({
      ...attemptFixture('completed', `event-${index}`),
      endpointName: `Endpoint ${index}`,
      outcome
    }));

    render(<AnalyticsAttemptTable attempts={attempts} t={t} />);
    for (const [, label, tone] of cases) {
      expect(screen.getByText(label)).toHaveClass('status-badge', tone);
    }
  });

  it('formats nano-USD strings without passing through JavaScript number', () => {
    expect(formatNanoUSD('9007199254740993')).toBe('$9,007,199.254740993');
    expect(formatNanoUSD('0')).toBe('$0');
    expect(formatNanoUSD(null)).toBe('-');
  });
});

function metric(label: string): HTMLElement {
  const element = screen.getByText(label).closest('.analytics-summary-metric');
  if (!element) throw new Error(`metric ${label} was not rendered`);
  return element as HTMLElement;
}

export function completeCompleteness(): InvocationAnalyticsCompleteness {
  return {
    complete: true,
    coverageStartedAt: '2026-07-17T00:00:00Z',
    coveredThrough: '2026-07-17T01:00:00Z',
    expectedSourceCount: 1,
    reportingSourceCount: 1,
    completeSourceCount: 1,
    missingCurrentSessionSourceCount: 0,
    inactiveSourceCount: 0,
    staleSourceCount: 0,
    coverageGapSourceCount: 0,
    watermarkMissingSourceCount: 0,
    pendingQueueSourceCount: 0,
    pendingInFlightSourceCount: 0,
    knownLossSourceCount: 0,
    unknownLossSourceCount: 0,
    saturatedSourceCount: 0,
    knownDroppedEventCount: 0,
    dropCounterSaturated: false,
    knownDroppedEventCountSaturated: false,
    sources: []
  };
}

export function summaryFixture(): InvocationAnalyticsSummary {
  const outcomes = {
    success: 2,
    clientError: 1,
    authError: 0,
    routingError: 0,
    capacityError: 0,
    upstreamError: 0,
    timeout: 0,
    canceled: 0,
    internalError: 0
  };
  return {
    window: { from: '2026-07-17T00:00:00Z', to: '2026-07-17T01:00:00Z' },
    requests: { count: 3, successfulCount: 2, failedCount: 1, outcomes, averageDurationMs: 12 },
    attempts: {
      count: 5,
      successfulCount: 3,
      failedCount: 2,
      outcomes: { ...outcomes, success: 3, upstreamError: 1 },
      availableCount: 4,
      unavailableCount: 1,
      retryableCount: 1,
      retriedCount: 1,
      finalCount: 3,
      committedCount: 3,
      usage: {
        knownInputTokens: null,
        knownOutputTokens: 0,
        knownCachedTokens: 0,
        knownReasoningTokens: null,
        finalAttemptCount: 1,
        partialAttemptCount: 1,
        unavailableAttemptCount: 3
      },
      cost: {
        knownEndpointCostNanoUSD: '9007199254740993',
        knownAttemptCount: 3,
        unknownAttemptCount: 2
      },
      averageDurationMs: 10,
      averageTimeToFirstEventMs: null,
      averageTimeToFirstOutputMs: 0
    },
    completeness: completeCompleteness()
  };
}

function requestFixture(): InvocationRequest {
  return {
    eventId: 'request-event',
    rootRequestId: 'root-request',
    requestId: 'request-1',
    parentRequestId: null,
    workspaceId: 1,
    apiKeyId: 2,
    groupId: 3,
    groupName: 'chat',
    kind: 'text',
    invocation: { protocol: 'openai', operation: 'responses' },
    mode: 'buffered',
    requestPath: '/v1/responses',
    role: 'origin',
    entryLocation: 'central',
    executionLocation: 'central',
    originSidecarTokenId: null,
    originSidecarInstanceId: null,
    originSnapshotRevision: null,
    startedAt: '2026-07-17T00:00:00Z',
    durationMs: 10,
    responseStatusCode: 200,
    outcome: 'success',
    streamStatus: 'completed',
    responseCommitted: true,
    timeToFirstEventMs: null,
    timeToFirstOutputMs: 10,
    downstreamBytes: 128,
    terminationReason: 'completed',
    errorCode: null
  };
}

function attemptFixture(streamStatus: StreamStatus, eventId = 'event-1'): InvocationAttempt {
  return {
    eventId,
    rootRequestId: 'root-request',
    requestId: 'request-1',
    workspaceId: 1,
    apiKeyId: 2,
    groupId: 3,
    groupName: 'Group A',
    kind: 'text',
    invocation: { protocol: 'openai', operation: 'responses' },
    mode: 'sse',
    requestPath: '/v1/responses',
    executionLocation: 'central',
    originSidecarTokenId: null,
    originSidecarInstanceId: null,
    originSnapshotRevision: null,
    startedAt: '2026-07-17T00:00:00Z',
    durationMs: 0,
    endpointId: 7,
    endpointName: 'Endpoint A',
    upstreamModelId: 'upstream-model',
    upstreamStatusCode: 503,
    responseStatusCode: 502,
    outcome: streamStatus === 'completed' ? 'success' : 'upstream_error',
    available: streamStatus === 'completed',
    retryable: streamStatus !== 'completed',
    final: true,
    routingMode: 'tiered_failover',
    routingTier: 0,
    mappingWeight: 100,
    attemptIndex: 1,
    failoverReason: null,
    breakerState: 'closed',
    breakerKey: 'workspace:1:endpoint:7',
    streamStatus,
    responseCommitted: true,
    timeToFirstEventMs: 0,
    timeToFirstOutputMs: null,
    upstreamBytes: 0,
    downstreamBytes: null,
    streamEventCount: 0,
    terminationReason: streamStatus === 'completed' ? null : streamStatus,
    usageStatus: 'partial',
    inputTokens: 0,
    outputTokens: null,
    cachedTokens: 0,
    reasoningTokens: null,
    tokensPerSecond: null,
    endpointCostNanoUSD: null,
    usageProvenance: 'driver_accumulated',
    usageErrorCode: null,
    driverRef: 'profile://stream-driver@1',
    driverRuntimeKind: 'wasm',
    errorCode: null
  };
}
