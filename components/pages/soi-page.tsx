'use client';

import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import {
  getSOIData,
  getSOIAssetBreakdown,
  type SOIRow,
  type SOIAssetRow,
  type SOISummary,
  type TopNOption,
} from '@/actions/soi';
import { getMOICColorClass } from '@/lib/moic-utils';
import { cn } from '@/lib/utils';
import { NotesSection as NotesSectionComponent } from '@/components/notes/notes-section';
import { ExcludedPositionsTableExpanded } from '@/components/dashboard/excluded-positions-table-expanded';

// Default author - in production, this would come from authentication
const DEFAULT_AUTHOR = 'Dashboard User';

interface SOIPageProps {
  vehicleId: string;
  portfolioDate: string;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const millions = value / 1e6;
  if (Math.abs(millions) >= 0.01) {
    return `$${millions.toFixed(2)}M`;
  }
  return `$${value.toLocaleString()}`;
}

function formatCurrencyWithPct(value: number, percentage: number): string {
  return `${formatCurrency(value)} (${percentage.toFixed(1)}%)`;
}

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatMOIC(moic: number | null | undefined): string {
  if (moic === null || moic === undefined) return '-';
  if (isNaN(moic) || !isFinite(moic)) return '-';
  if (moic === 0) return '0.00x';
  return `${moic.toFixed(2)}x`;
}

function formatReturnPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

// ============================================================================
// Sorting
// ============================================================================

type SortField = 'project_id' | 'cost' | 'realized_mv' | 'unrealized_mv' | 'total_mv' | 'moic' | 'first_entry' | 'weighted_valuation' | 'itd_individual' | 'qtd_individual';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

function SortableHeader({
  label,
  field,
  sortConfig,
  onSort,
  align = 'right',
}: {
  label: string;
  field: SortField;
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const isActive = sortConfig?.field === field;
  return (
    <th
      className={cn(
        'px-4 py-3 font-medium cursor-pointer select-none hover:bg-[#F0F1F3] transition-colors',
        align === 'right' ? 'text-right' : 'text-left'
      )}
      onClick={() => onSort(field)}
    >
      <div className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        <span>{label}</span>
        {isActive ? (
          sortConfig.direction === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-[#1E4B7A]" />
          ) : (
            <ArrowDown className="h-3 w-3 text-[#1E4B7A]" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-[#9CA3AF]" />
        )}
      </div>
    </th>
  );
}

function sortRows(rows: SOIRow[], sortConfig: SortConfig | null): SOIRow[] {
  if (!sortConfig) return rows;
  const { field, direction } = sortConfig;
  const sorted = [...rows].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    // Nulls always sort last
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });
  return sorted;
}

// ============================================================================
// Section Filters
// ============================================================================

function SectionFilters({
  topN,
  onTopNChange,
  showAssetBreakdown,
  onShowAssetBreakdownChange,
}: {
  topN: TopNOption;
  onTopNChange: (value: TopNOption) => void;
  showAssetBreakdown: boolean;
  onShowAssetBreakdownChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-6 mb-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#6B7280]">Top N:</span>
        <select
          value={topN}
          onChange={(e) => onTopNChange(parseInt(e.target.value) as TopNOption)}
          className="border border-[#E5E7EB] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={0}>All</option>
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showAssetBreakdown}
          onChange={(e) => onShowAssetBreakdownChange(e.target.checked)}
          className="w-4 h-4 text-[#1E4B7A] border-[#E5E7EB] rounded focus:ring-[#1E4B7A]"
        />
        <span className="text-sm text-[#6B7280]">Show Asset Class Breakdown</span>
      </label>
    </div>
  );
}

// ============================================================================
// Asset Class Summary
// ============================================================================

function AssetClassSummary({ summary }: { summary: SOISummary }) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 mb-6">
      <h3 className="text-sm font-semibold text-[#111827] mb-3">Asset Class Distribution</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-xs text-[#6B7280] mb-1">Equity</div>
          <div className="text-sm font-medium text-[#111827]">
            {formatCurrency(summary.equity_cost)}
          </div>
          <div className="text-xs text-[#6B7280]">
            {summary.equity_cost_percentage.toFixed(1)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-[#6B7280] mb-1">Tokens</div>
          <div className="text-sm font-medium text-[#111827]">
            {formatCurrency(summary.tokens_cost)}
          </div>
          <div className="text-xs text-[#6B7280]">
            {summary.tokens_cost_percentage.toFixed(1)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-[#6B7280] mb-1">Others</div>
          <div className="text-sm font-medium text-[#111827]">
            {formatCurrency(summary.others_cost)}
          </div>
          <div className="text-xs text-[#6B7280]">
            {summary.others_cost_percentage.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Expandable Row with Asset Breakdown
// ============================================================================

function ExpandableRow({
  row,
  showAssetBreakdown,
  vehicleId,
  portfolioDate,
}: {
  row: SOIRow;
  showAssetBreakdown: boolean;
  vehicleId: string;
  portfolioDate: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [assetData, setAssetData] = useState<SOIAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const canExpand = showAssetBreakdown && row.has_asset_breakdown && !row.is_long_tail;

  const handleToggle = async () => {
    if (!canExpand) return;

    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    if (newExpanded && assetData.length === 0) {
      setIsLoading(true);
      try {
        const data = await getSOIAssetBreakdown(vehicleId, row.project_id, portfolioDate);
        setAssetData(data);
      } catch (error) {
        console.error('Error fetching asset breakdown:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Fragment>
      <tr
        className={cn(
          'hover:bg-[#F9FAFB]',
          canExpand && 'cursor-pointer',
          row.is_long_tail && 'bg-[#F3F4F6] font-medium',
          row.is_high_moic_exception && 'bg-emerald-50'
        )}
        onClick={handleToggle}
      >
        <td className="px-4 py-3 w-8">
          {canExpand && (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-[#6B7280]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#6B7280]" />
            )
          )}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-[#111827]">
          {row.project_id}
          {row.is_high_moic_exception && !row.is_long_tail && (
            <span className="ml-2 text-xs text-emerald-600">(High MOIC)</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {formatCurrencyWithPct(row.cost, row.cost_percentage)}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {formatCurrencyWithPct(row.realized_mv, row.realized_mv_percentage)}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {formatCurrencyWithPct(row.unrealized_mv, row.unrealized_mv_percentage)}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {formatCurrency(row.total_mv)}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          <span className={cn('px-2 py-1 rounded text-xs font-medium', getMOICColorClass(row.moic))}>
            {formatMOIC(row.moic)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {row.first_entry ? formatCurrency(row.first_entry) : '-'}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {row.weighted_valuation ? formatCurrency(row.weighted_valuation) : '-'}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {formatReturnPct(row.itd_individual)}
        </td>
        <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
          {formatReturnPct(row.qtd_individual)}
        </td>
      </tr>

      {/* Asset class breakdown rows */}
      {isExpanded && isLoading && (
        <tr className="bg-[#FAFAFA]">
          <td colSpan={11} className="px-6 py-2 text-sm text-[#6B7280] text-center">
            Loading asset breakdown...
          </td>
        </tr>
      )}
      {isExpanded && !isLoading && assetData.length === 0 && (
        <tr className="bg-[#FAFAFA]">
          <td colSpan={11} className="px-6 py-2 text-sm text-[#6B7280] text-center">
            No asset breakdown available
          </td>
        </tr>
      )}
      {isExpanded && !isLoading && assetData.map((asset) => (
        <tr key={`${row.project_id}-${asset.asset_class}`} className="bg-[#FAFAFA]">
          <td className="px-4 py-2"></td>
          <td className="px-4 py-2 text-sm text-[#6B7280] pl-8">
            {asset.asset_class}
          </td>
          <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
            {formatCurrencyWithPct(asset.cost, asset.cost_percentage)}
          </td>
          <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
            {formatCurrency(asset.realized_mv)}
          </td>
          <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
            {formatCurrency(asset.unrealized_mv)}
          </td>
          <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
            {formatCurrency(asset.total_mv)}
          </td>
          <td className="px-4 py-2 text-sm text-right">
            <span className={cn('px-2 py-1 rounded text-xs font-medium', getMOICColorClass(asset.moic))}>
              {formatMOIC(asset.moic)}
            </span>
          </td>
          <td className="px-4 py-2"></td>
          <td className="px-4 py-2"></td>
          <td className="px-4 py-2"></td>
          <td className="px-4 py-2"></td>
        </tr>
      ))}
    </Fragment>
  );
}

// ============================================================================
// SOI Table
// ============================================================================

function SOITable({
  rows,
  longTail,
  summary,
  showAssetBreakdown,
  vehicleId,
  portfolioDate,
  sortConfig,
  onSort,
}: {
  rows: SOIRow[];
  longTail: SOIRow | null;
  summary: SOISummary;
  showAssetBreakdown: boolean;
  vehicleId: string;
  portfolioDate: string;
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-lg font-semibold text-[#111827]">Schedule of Investments</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-4 py-3 font-medium w-8"></th>
              <SortableHeader label="Project" field="project_id" sortConfig={sortConfig} onSort={onSort} align="left" />
              <SortableHeader label="Cost $M (%)" field="cost" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="Realized MV (%)" field="realized_mv" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="Unrealized MV (%)" field="unrealized_mv" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="Total MV" field="total_mv" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="MOIC" field="moic" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="First Entry" field="first_entry" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="Wtd. Val." field="weighted_valuation" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="ITD Perf." field="itd_individual" sortConfig={sortConfig} onSort={onSort} />
              <SortableHeader label="QTD Perf." field="qtd_individual" sortConfig={sortConfig} onSort={onSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-8 text-center text-[#6B7280]">
                  No positions found
                </td>
              </tr>
            ) : (
              <>
                {rows.map((row) => (
                  <ExpandableRow
                    key={row.project_id}
                    row={row}
                    showAssetBreakdown={showAssetBreakdown}
                    vehicleId={vehicleId}
                    portfolioDate={portfolioDate}
                  />
                ))}
                {longTail && (
                  <ExpandableRow
                    key="long-tail"
                    row={longTail}
                    showAssetBreakdown={false}
                    vehicleId={vehicleId}
                    portfolioDate={portfolioDate}
                  />
                )}
              </>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-[#1E4B7A] text-white font-semibold">
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-sm">
                TOTAL ({summary.total_positions} positions)
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatCurrency(summary.total_cost)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatCurrency(summary.total_realized_mv)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatCurrency(summary.total_unrealized_mv)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatCurrency(summary.total_mv)}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                <span className="px-2 py-1 rounded text-xs font-medium bg-white/20">
                  {formatMOIC(summary.portfolio_moic)}
                </span>
              </td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatPercentage(summary.portfolio_itd)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {summary.portfolio_qtd !== null ? formatPercentage(summary.portfolio_qtd) : '-'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Integrated Notes Section using new Notes System
// ============================================================================

function SOINotesSection({ vehicleId, portfolioDate }: { vehicleId: string; portfolioDate: string }) {
  return (
    <NotesSectionComponent
      sectionCode="schedule_of_investments"
      sectionTitle="Notes on Schedule of Investments"
      vehicleId={vehicleId}
      dateOfReview={portfolioDate}
      author={DEFAULT_AUTHOR}
      showPreviousReviews={true}
      defaultExpanded={true}
      maxHeight="350px"
    />
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export function SOIPage({ vehicleId, portfolioDate }: SOIPageProps) {
  const [topN, setTopN] = useState<TopNOption>(50);
  const [showAssetBreakdown, setShowAssetBreakdown] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const handleSort = (field: SortField) => {
    setSortConfig((prev) => {
      if (prev?.field === field) {
        // Toggle direction, then clear on third click
        if (prev.direction === 'desc') return { field, direction: 'asc' };
        return null;
      }
      return { field, direction: 'desc' };
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['soiData', vehicleId, portfolioDate, topN],
    queryFn: () => getSOIData(vehicleId, portfolioDate, topN),
    enabled: !!vehicleId && !!portfolioDate,
  });

  const { rows = [], longTail = null, summary } = data || {
    rows: [],
    longTail: null,
    summary: {
      total_positions: 0,
      total_cost: 0,
      total_realized_mv: 0,
      total_unrealized_mv: 0,
      total_mv: 0,
      portfolio_moic: 0,
      portfolio_itd: 0,
      portfolio_qtd: null,
      equity_cost: 0,
      equity_cost_percentage: 0,
      tokens_cost: 0,
      tokens_cost_percentage: 0,
      others_cost: 0,
      others_cost_percentage: 0,
    },
  };

  const sortedRows = useMemo(() => sortRows(rows, sortConfig), [rows, sortConfig]);

  if (!vehicleId || !portfolioDate) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">
          <p className="text-lg">Select a Fund Manager and Investment to view Schedule of Investments</p>
          <p className="text-sm mt-2">Use the filters above to get started</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">Loading Schedule of Investments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionFilters
        topN={topN}
        onTopNChange={setTopN}
        showAssetBreakdown={showAssetBreakdown}
        onShowAssetBreakdownChange={setShowAssetBreakdown}
      />

      <SOITable
        rows={sortedRows}
        longTail={longTail}
        summary={summary}
        showAssetBreakdown={showAssetBreakdown}
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        sortConfig={sortConfig}
        onSort={handleSort}
      />

      <AssetClassSummary summary={summary} />

      {/* Excluded Positions (Expandable) */}
      <ExcludedPositionsTableExpanded
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
      />

      {vehicleId && (
        <SOINotesSection vehicleId={vehicleId} portfolioDate={portfolioDate} />
      )}
    </div>
  );
}
