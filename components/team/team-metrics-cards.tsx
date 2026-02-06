'use client';

import { cn } from '@/lib/utils';
import type { TeamMetrics } from '@/actions/team';

interface TeamMetricsCardsProps {
  metrics: TeamMetrics | null;
  isLoading?: boolean;
}

function MetricCard({
  label,
  value,
  suffix,
  isPositive,
  isNegative,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  isPositive?: boolean;
  isNegative?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
      <p className="text-xs text-[#6B7280] uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          'text-2xl font-semibold mt-1 font-mono tabular-nums',
          isPositive && 'text-green-600',
          isNegative && 'text-red-600',
          !isPositive && !isNegative && 'text-[#111827]'
        )}
      >
        {value}
        {suffix && <span className="text-sm ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

export function TeamMetricsCards({ metrics, isLoading }: TeamMetricsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-[#E5E7EB] p-4 animate-pulse">
            <div className="h-3 bg-[#E5E7EB] rounded w-20 mb-2"></div>
            <div className="h-8 bg-[#E5E7EB] rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Departures" value="-" />
        <MetricCard label="Additions" value="-" />
        <MetricCard label="Net Change" value="-" />
        <MetricCard label="Turnover Rate" value="-" />
        <MetricCard label="Avg Team Size" value="-" />
      </div>
    );
  }

  const netChange = metrics.net_change;
  const netChangeDisplay = netChange > 0 ? `+${netChange}` : `${netChange}`;

  return (
    <div className="grid grid-cols-5 gap-4">
      <MetricCard
        label="Departures"
        value={metrics.total_departures}
        isNegative={metrics.total_departures > 0}
      />
      <MetricCard
        label="Additions"
        value={metrics.total_additions}
        isPositive={metrics.total_additions > 0}
      />
      <MetricCard
        label="Net Change"
        value={netChangeDisplay}
        isPositive={netChange > 0}
        isNegative={netChange < 0}
      />
      <MetricCard
        label="Turnover Rate"
        value={metrics.turnover_rate}
        suffix="%"
        isNegative={metrics.turnover_rate > 20}
      />
      <MetricCard
        label="Avg Team Size"
        value={metrics.average_team_size}
      />
    </div>
  );
}
