import type { ModelGroupMappingStatisticsBucket } from './types';

interface ModelGroupUptimeChartProps {
  buckets: ModelGroupMappingStatisticsBucket[];
  label: string;
  noSampleLabel: string;
  formatTime: (value: string) => string;
}

const chartWidth = 760;
const chartHeight = 220;
const chartTop = 18;
const chartBottom = 196;

export function ModelGroupUptimeChart({ buckets, label, noSampleLabel, formatTime }: ModelGroupUptimeChartProps) {
  const sampled = buckets.filter((bucket) => bucket.uptimePercentage != null);
  const minimum = sampled.reduce((value, bucket) => Math.min(value, bucket.uptimePercentage ?? value), 100);
  const floor = minimum >= 99 ? 98 : minimum >= 95 ? 90 : minimum >= 90 ? 85 : 0;
  const gridValues = Array.from({ length: 4 }, (_, index) => 100 - (100 - floor) * index / 3);
  const x = (index: number) => buckets.length <= 1 ? chartWidth / 2 : index * chartWidth / (buckets.length - 1);
  const y = (percentage: number) => chartTop + (100 - percentage) * (chartBottom - chartTop) / (100 - floor);
  const segments: string[] = [];
  let current: string[] = [];

  buckets.forEach((bucket, index) => {
    if (bucket.uptimePercentage == null) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${x(index)},${y(bucket.uptimePercentage)}`);
  });
  if (current.length > 0) segments.push(current.join(' '));

  return (
    <div className="group-uptime-chart-wrap">
      <div className="group-uptime-y-axis" aria-hidden="true">
        {gridValues.map((value) => <span key={value}>{formatAxisValue(value)}</span>)}
      </div>
      <svg className="group-uptime-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {gridValues.map((value) => (
          <line key={value} className="group-uptime-grid-line" x1="0" x2={chartWidth} y1={y(value)} y2={y(value)} />
        ))}
        {sampled.length === 0 && (
          <line className="group-uptime-empty-line" x1="0" x2={chartWidth} y1={y(100)} y2={y(100)} />
        )}
        {segments.map((points, index) => (
          <polyline key={`${index}:${points}`} className="group-uptime-chart-line" points={points} />
        ))}
        {buckets.map((bucket, index) => bucket.uptimePercentage == null ? null : (
          <circle
            key={bucket.from}
            className="group-uptime-chart-point"
            cx={x(index)}
            cy={y(bucket.uptimePercentage)}
            r="3"
          >
            <title>{`${formatTime(bucket.from)} - ${formatTime(bucket.to)}: ${bucket.availableAttemptCount}/${bucket.attemptCount}, ${bucket.uptimePercentage.toFixed(2)}%`}</title>
          </circle>
        ))}
      </svg>
      {sampled.length === 0 && <div className="group-uptime-chart-empty">{noSampleLabel}</div>}
    </div>
  );
}

function formatAxisValue(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}
