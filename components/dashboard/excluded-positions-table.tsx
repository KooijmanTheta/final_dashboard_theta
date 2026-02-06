'use client';

import { useExcludedPositions, type ExcludedPositionCategory } from '@/hooks/use-excluded-positions';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ExcludedPositionsTableProps {
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart?: string;
  dateReportedEnd?: string;
}

// ============================================
// Formatting utilities
// ============================================

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num) || num === 0) return '$0';
  const absValue = Math.abs(num);
  if (absValue >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatCountWithPct(count: number, totalCount: number): string {
  if (totalCount === 0) return `${count} (0.0%)`;
  const pct = (count / totalCount) * 100;
  return `${count} (${pct.toFixed(1)}%)`;
}

// ============================================
// Component
// ============================================

export function ExcludedPositionsTable({
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
}: ExcludedPositionsTableProps) {
  const { data: positions, isLoading, error } = useExcludedPositions(
    vehicleId,
    portfolioDate,
    dateReportedStart,
    dateReportedEnd
  );

  // Calculate totals
  const totals = positions?.reduce(
    (acc, pos) => ({
      project_count: acc.project_count + pos.project_count,
      cost: acc.cost + pos.cost,
      unrealized_mv: acc.unrealized_mv + pos.unrealized_mv,
      realized_mv: acc.realized_mv + pos.realized_mv,
      total_mv: acc.total_mv + pos.total_mv,
    }),
    { project_count: 0, cost: 0, unrealized_mv: 0, realized_mv: 0, total_mv: 0 }
  ) || { project_count: 0, cost: 0, unrealized_mv: 0, realized_mv: 0, total_mv: 0 };

  // Don't render if no vehicle or portfolio date selected
  if (!vehicleId || !portfolioDate) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#111827]">Excluded Positions</h2>
        </div>
        <div className="flex items-center justify-center py-8 text-[#6B7280]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading excluded positions...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#111827]">Excluded Positions</h2>
        </div>
        <div className="text-center py-8 text-red-500 text-sm">
          Failed to load excluded positions
        </div>
      </div>
    );
  }

  // Empty state - hide the section entirely
  if (!positions || positions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-lg font-semibold text-[#111827]">Excluded Positions</h2>
        <p className="text-xs text-[#6B7280] mt-1">
          Positions excluded from main tables: Flows, NAV Adjustments, Other Assets, Cash
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium text-right">Projects (%)</th>
              <th className="px-4 py-3 font-medium text-right">Cost</th>
              <th className="px-4 py-3 font-medium text-right">Unrealized MV</th>
              <th className="px-4 py-3 font-medium text-right">Total MV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {positions.map((pos) => (
              <tr key={pos.category} className="hover:bg-[#F9FAFB]">
                <td className="px-6 py-3 text-sm font-medium text-[#111827]">
                  {pos.category}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCountWithPct(pos.project_count, totals.project_count)}
                </td>
                <td className={cn(
                  'px-4 py-3 text-sm text-right font-mono tabular-nums',
                  pos.cost < 0 && 'text-red-600'
                )}>
                  {formatCurrency(pos.cost)}
                </td>
                <td className={cn(
                  'px-4 py-3 text-sm text-right font-mono tabular-nums',
                  pos.unrealized_mv < 0 && 'text-red-600'
                )}>
                  {formatCurrency(pos.unrealized_mv)}
                </td>
                <td className={cn(
                  'px-4 py-3 text-sm text-right font-mono tabular-nums font-medium',
                  pos.total_mv < 0 && 'text-red-600'
                )}>
                  {formatCurrency(pos.total_mv)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#F3F4F6] font-semibold">
              <td className="px-6 py-3 text-sm text-[#111827]">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {totals.project_count}
              </td>
              <td className={cn(
                'px-4 py-3 text-sm text-right font-mono tabular-nums',
                totals.cost < 0 && 'text-red-600'
              )}>
                {formatCurrency(totals.cost)}
              </td>
              <td className={cn(
                'px-4 py-3 text-sm text-right font-mono tabular-nums',
                totals.unrealized_mv < 0 && 'text-red-600'
              )}>
                {formatCurrency(totals.unrealized_mv)}
              </td>
              <td className={cn(
                'px-4 py-3 text-sm text-right font-mono tabular-nums',
                totals.total_mv < 0 && 'text-red-600'
              )}>
                {formatCurrency(totals.total_mv)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
