'use client';

import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  getProjectCategorySummary,
  getMOICBuckets,
  getMOICBucketProjects,
  getAssetTypeBreakdown,
  getValuationBreakdown,
  getOverviewNotes,
  getCategoryProjects,
  getAssetTypeProjects,
  getValuationStageProjects,
  type ProjectCategorySummaryRow,
  type MOICBucketRow,
  type MOICBucketProjectRow,
  type AssetTypeRow,
  type AssetTypeProjectRow,
  type ValuationStageRow,
  type ValuationProjectRow,
  type CategorySelection,
  type CategoryProjectRow,
} from '@/actions/overview';
import { cn } from '@/lib/utils';
import { calculateMOIC } from '@/lib/moic-utils';
import { NotesSection as NotesSectionComponent } from '@/components/notes/notes-section';
import { ExcludedPositionsTable } from '@/components/dashboard/excluded-positions-table';

// Default author - in production, this would come from authentication
const DEFAULT_AUTHOR = 'Dashboard User';

interface OverviewPageProps {
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick: (projectId: string) => void;
}

// Formatting utilities - convert to number to handle string values from DB
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
}

function formatCurrency(value: unknown): string {
  const num = toNumber(value);
  if (num === 0) return '$0';
  const absValue = Math.abs(num);
  if (absValue >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatMOIC(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = toNumber(value);
  return `${num.toFixed(2)}x`;
}

function formatCountWithPct(count: unknown, percentage: unknown): string {
  const c = toNumber(count);
  const p = toNumber(percentage);
  return `${c} (${p.toFixed(1)}%)`;
}

function formatPercentage(value: unknown, decimals: number = 1): string {
  if (value === null || value === undefined) return '-';
  const num = toNumber(value);
  if (num === 0) return '-';
  return `${(num * 100).toFixed(decimals)}%`;
}

function formatWithBreakdown(
  total: unknown,
  equity: unknown,
  tokens: unknown,
  others: unknown,
  showBreakdown: boolean
): string {
  const totalStr = formatCurrency(total);
  if (!showBreakdown) return totalStr;
  return `${totalStr} (${formatCurrency(equity)}|${formatCurrency(tokens)}|${formatCurrency(others)})`;
}

// MOIC bucket colors
const BUCKET_COLORS: Record<string, string> = {
  'Grand Slams': 'bg-emerald-900 text-emerald-50',
  'Home Run': 'bg-emerald-700 text-emerald-50',
  'Doubles/Triples': 'bg-green-500 text-white',
  'Base Hit': 'bg-green-300 text-green-900',
  'Cost': 'bg-gray-100 text-gray-700',
  'Loss': 'bg-red-100 text-red-800',
  'Write Off': 'bg-red-700 text-red-50',
  'Fully Divested / No Cost Basis': 'bg-yellow-100 text-yellow-800',
  'Write Offs': 'bg-yellow-100 text-yellow-800',
};

// Category Summary Table with Expandable Rows
function CategorySummaryTable({
  data,
  categorySelection,
  onCategoryChange,
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: {
  data: ProjectCategorySummaryRow[];
  categorySelection: CategorySelection;
  onCategoryChange: (category: CategorySelection) => void;
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick: (projectId: string) => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [categoryProjects, setCategoryProjects] = useState<Record<string, CategoryProjectRow[]>>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = async (category: string) => {
    console.log(`[CategorySummaryTable] toggleCategory called for: "${category}"`);
    const isExpanded = expandedCategories[category];
    setExpandedCategories((prev) => ({ ...prev, [category]: !isExpanded }));

    // Fetch projects if expanding and not already fetched
    if (!isExpanded && !categoryProjects[category]) {
      console.log(`[CategorySummaryTable] Fetching projects for: "${category}"`);
      setLoadingCategories((prev) => ({ ...prev, [category]: true }));
      try {
        const projects = await getCategoryProjects(vehicleId, portfolioDate, category, categorySelection, dateReportedStart, dateReportedEnd);
        console.log(`[CategorySummaryTable] Received ${projects.length} projects for: "${category}"`);
        setCategoryProjects((prev) => ({ ...prev, [category]: projects }));
      } catch (error) {
        console.error(`[CategorySummaryTable] Error fetching projects for: "${category}"`, error);
      } finally {
        setLoadingCategories((prev) => ({ ...prev, [category]: false }));
      }
    }
  };

  // Calculate totals
  const totals = useMemo(() => data.reduce(
    (acc, row) => ({
      project_count: acc.project_count + toNumber(row.project_count),
      cost: acc.cost + toNumber(row.cost),
      realized_mv: acc.realized_mv + toNumber(row.realized_mv),
      unrealized_mv: acc.unrealized_mv + toNumber(row.unrealized_mv),
    }),
    { project_count: 0, cost: 0, realized_mv: 0, unrealized_mv: 0 }
  ), [data]);
  const totalMV = totals.realized_mv + totals.unrealized_mv;
  const totalMOIC = calculateMOIC(totalMV, totals.cost);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#111827]">Project Category Summary</h2>
        <select
          value={categorySelection}
          onChange={(e) => onCategoryChange(e.target.value as CategorySelection)}
          className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
        >
          <option value="project_stack">Stack</option>
          <option value="project_tag">Tag</option>
          <option value="project_sub_tag">Sub-Tag</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium text-right">Projects (%)</th>
              <th className="px-4 py-3 font-medium text-right">Ownership (avg/med)</th>
              <th className="px-4 py-3 font-medium text-right">Cost ($M)</th>
              <th className="px-4 py-3 font-medium text-right">Realized MV</th>
              <th className="px-4 py-3 font-medium text-right">Unrealized MV</th>
              <th className="px-4 py-3 font-medium text-right">MOIC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.map((row, idx) => {
              const cost = toNumber(row.cost);
              const realizedMv = toNumber(row.realized_mv);
              const unrealizedMv = toNumber(row.unrealized_mv);
              const rowTotalMV = realizedMv + unrealizedMv;
              const rowMOIC = calculateMOIC(rowTotalMV, cost);
              const costPct = toNumber(row.cost_percentage);
              const isExpanded = expandedCategories[row.category];
              const projects = categoryProjects[row.category] || [];

              return (
                <Fragment key={idx}>
                  <tr
                    className="hover:bg-[#F9FAFB] cursor-pointer"
                    onClick={() => toggleCategory(row.category)}
                  >
                    <td className="px-6 py-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[#111827]">{row.category}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCountWithPct(row.project_count, row.project_percentage)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatPercentage(row.avg_ownership)}, {formatPercentage(row.median_ownership)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(cost)} ({costPct.toFixed(1)}%)
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(realizedMv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(unrealizedMv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums font-medium">
                      {formatMOIC(rowMOIC)}
                    </td>
                  </tr>

                  {/* Expanded Projects */}
                  {isExpanded && loadingCategories[row.category] && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        Loading projects...
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingCategories[row.category] && projects.length === 0 && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        No projects found for this category
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingCategories[row.category] && projects.map((project) => (
                    <tr key={`${row.category}-${project.project_id}`} className="bg-[#FAFAFA]">
                      <td className="px-6 py-2"></td>
                      <td className="px-4 py-2 text-sm pl-4">
                        <button
                          onClick={() => onProjectClick(project.project_id)}
                          className="text-[#1E4B7A] hover:underline font-medium"
                        >
                          {project.project_id}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">-</td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatPercentage(project.ownership)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.cost)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.realized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.unrealized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatMOIC(project.moic)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#F3F4F6] font-semibold">
              <td className="px-6 py-3"></td>
              <td className="px-4 py-3 text-sm text-[#111827]">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">{totals.project_count}</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">-</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">{formatCurrency(totals.cost)}</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">{formatCurrency(totals.realized_mv)}</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">{formatCurrency(totals.unrealized_mv)}</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">{formatMOIC(totalMOIC)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// MOIC Buckets Table with Expandable Rows
function MOICBucketsTable({
  data,
  showAssetBreakdown,
  onToggleAssetBreakdown,
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: {
  data: MOICBucketRow[];
  showAssetBreakdown: boolean;
  onToggleAssetBreakdown: (show: boolean) => void;
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick: (projectId: string) => void;
}) {
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
  const [bucketProjects, setBucketProjects] = useState<Record<string, MOICBucketProjectRow[]>>({});
  const [loadingBuckets, setLoadingBuckets] = useState<Record<string, boolean>>({});

  const toggleBucket = async (bucket: string) => {
    console.log(`[MOICBucketsTable] toggleBucket called for: "${bucket}"`);
    const isExpanded = expandedBuckets[bucket];
    setExpandedBuckets((prev) => ({ ...prev, [bucket]: !isExpanded }));

    // Fetch projects if expanding and not already fetched
    if (!isExpanded && !bucketProjects[bucket]) {
      console.log(`[MOICBucketsTable] Fetching projects for: "${bucket}"`);
      setLoadingBuckets((prev) => ({ ...prev, [bucket]: true }));
      try {
        const projects = await getMOICBucketProjects(vehicleId, portfolioDate, bucket, dateReportedStart, dateReportedEnd);
        console.log(`[MOICBucketsTable] Received ${projects.length} projects for: "${bucket}"`);
        setBucketProjects((prev) => ({ ...prev, [bucket]: projects }));
      } catch (error) {
        console.error(`[MOICBucketsTable] Error fetching projects for: "${bucket}"`, error);
      } finally {
        setLoadingBuckets((prev) => ({ ...prev, [bucket]: false }));
      }
    }
  };

  // Calculate totals
  const totals = useMemo(() => data.reduce(
    (acc, row) => ({
      project_count: acc.project_count + toNumber(row.project_count),
      cost_total: acc.cost_total + toNumber(row.cost_total),
      unrealized_total: acc.unrealized_total + toNumber(row.unrealized_total),
      realized_total: acc.realized_total + toNumber(row.realized_total),
      cost_equity: acc.cost_equity + toNumber(row.cost_equity),
      cost_tokens: acc.cost_tokens + toNumber(row.cost_tokens),
      cost_others: acc.cost_others + toNumber(row.cost_others),
      unrealized_equity: acc.unrealized_equity + toNumber(row.unrealized_equity),
      unrealized_tokens: acc.unrealized_tokens + toNumber(row.unrealized_tokens),
      unrealized_others: acc.unrealized_others + toNumber(row.unrealized_others),
      realized_equity: acc.realized_equity + toNumber(row.realized_equity),
      realized_tokens: acc.realized_tokens + toNumber(row.realized_tokens),
      realized_others: acc.realized_others + toNumber(row.realized_others),
    }),
    {
      project_count: 0, cost_total: 0, unrealized_total: 0, realized_total: 0,
      cost_equity: 0, cost_tokens: 0, cost_others: 0,
      unrealized_equity: 0, unrealized_tokens: 0, unrealized_others: 0,
      realized_equity: 0, realized_tokens: 0, realized_others: 0,
    }
  ), [data]);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#111827]">Performance Buckets (MOIC)</h2>
        <label className="flex items-center gap-2 text-sm text-[#6B7280] cursor-pointer">
          <input
            type="checkbox"
            checked={showAssetBreakdown}
            onChange={(e) => onToggleAssetBreakdown(e.target.checked)}
            className="h-4 w-4 rounded border-[#D1D5DB] text-[#1E4B7A] focus:ring-[#1E4B7A]"
          />
          Show Asset Class Breakdown (E|T|O)
        </label>
      </div>

      {/* Summary Cards - Compact */}
      <div className="px-6 py-3 flex flex-wrap gap-2">
        {data.slice(0, 7).map((bucket) => (
          <div
            key={bucket.bucket}
            className={cn(
              'rounded px-3 py-1.5 text-center cursor-pointer transition-opacity hover:opacity-90 flex items-center gap-2',
              BUCKET_COLORS[bucket.bucket] || 'bg-gray-100 text-gray-700'
            )}
            onClick={() => toggleBucket(bucket.bucket)}
          >
            <span className="text-xs font-medium">{bucket.bucket}</span>
            <span className="text-sm font-bold">{bucket.project_count}</span>
          </div>
        ))}
      </div>

      {/* Detailed Table */}
      <div className="overflow-x-auto border-t border-[#E5E7EB]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Bucket</th>
              <th className="px-4 py-3 font-medium text-right">Projects (%)</th>
              <th className="px-4 py-3 font-medium text-right">Cost</th>
              <th className="px-4 py-3 font-medium text-right">Unrealized MV</th>
              <th className="px-4 py-3 font-medium text-right">Realized MV</th>
              <th className="px-4 py-3 font-medium text-right">Total MV</th>
              <th className="px-4 py-3 font-medium text-right">MOIC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.map((row) => {
              const isExpanded = expandedBuckets[row.bucket];
              const projects = bucketProjects[row.bucket] || [];

              return (
                <Fragment key={row.bucket}>
                  <tr
                    className="hover:bg-[#F9FAFB] cursor-pointer"
                    onClick={() => toggleBucket(row.bucket)}
                  >
                    <td className="px-6 py-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-block px-2 py-1 rounded text-xs font-medium',
                        BUCKET_COLORS[row.bucket] || 'bg-gray-100 text-gray-700'
                      )}>
                        {row.bucket}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCountWithPct(row.project_count, row.project_percentage)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {showAssetBreakdown
                        ? formatWithBreakdown(row.cost_total, row.cost_equity, row.cost_tokens, row.cost_others, true)
                        : formatCurrency(row.cost_total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {showAssetBreakdown
                        ? formatWithBreakdown(row.unrealized_total, row.unrealized_equity, row.unrealized_tokens, row.unrealized_others, true)
                        : formatCurrency(row.unrealized_total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {showAssetBreakdown
                        ? formatWithBreakdown(row.realized_total, row.realized_equity, row.realized_tokens, row.realized_others, true)
                        : formatCurrency(row.realized_total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums font-medium">
                      {formatCurrency(row.total_mv_total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums font-medium">
                      {formatMOIC(row.moic)}
                    </td>
                  </tr>

                  {/* Expanded Projects */}
                  {isExpanded && loadingBuckets[row.bucket] && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        Loading projects...
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingBuckets[row.bucket] && projects.length === 0 && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        No projects found for this bucket
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingBuckets[row.bucket] && projects.map((project) => (
                    <tr key={`${row.bucket}-${project.project_id}`} className="bg-[#FAFAFA]">
                      <td className="px-6 py-2"></td>
                      <td className="px-4 py-2 text-sm pl-8">
                        <button
                          onClick={() => onProjectClick(project.project_id)}
                          className="text-[#1E4B7A] hover:underline font-medium"
                        >
                          {project.project_id}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">-</td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.cost)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.unrealized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.realized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(toNumber(project.unrealized_mv) + toNumber(project.realized_mv))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatMOIC(project.moic)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#F3F4F6] font-semibold">
              <td className="px-6 py-3"></td>
              <td className="px-4 py-3 text-sm text-[#111827]">TOTAL</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">{totals.project_count}</td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {showAssetBreakdown
                  ? formatWithBreakdown(totals.cost_total, totals.cost_equity, totals.cost_tokens, totals.cost_others, true)
                  : formatCurrency(totals.cost_total)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {showAssetBreakdown
                  ? formatWithBreakdown(totals.unrealized_total, totals.unrealized_equity, totals.unrealized_tokens, totals.unrealized_others, true)
                  : formatCurrency(totals.unrealized_total)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {showAssetBreakdown
                  ? formatWithBreakdown(totals.realized_total, totals.realized_equity, totals.realized_tokens, totals.realized_others, true)
                  : formatCurrency(totals.realized_total)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatCurrency(totals.unrealized_total + totals.realized_total)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                {formatMOIC(calculateMOIC(totals.unrealized_total + totals.realized_total, totals.cost_total))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Asset Type Table with Expandable Rows
function AssetTypeTable({
  data,
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: {
  data: AssetTypeRow[];
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick: (projectId: string) => void;
}) {
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [typeProjects, setTypeProjects] = useState<Record<string, AssetTypeProjectRow[]>>({});
  const [loadingTypes, setLoadingTypes] = useState<Record<string, boolean>>({});

  const toggleAssetType = async (assetType: string) => {
    console.log(`[AssetTypeTable] toggleAssetType called for: "${assetType}"`);
    const isExpanded = expandedTypes[assetType];
    setExpandedTypes((prev) => ({ ...prev, [assetType]: !isExpanded }));

    // Fetch projects if expanding and not already fetched
    if (!isExpanded && !typeProjects[assetType]) {
      console.log(`[AssetTypeTable] Fetching projects for: "${assetType}"`);
      setLoadingTypes((prev) => ({ ...prev, [assetType]: true }));
      try {
        const projects = await getAssetTypeProjects(vehicleId, portfolioDate, assetType, dateReportedStart, dateReportedEnd);
        console.log(`[AssetTypeTable] Received ${projects.length} projects for: "${assetType}"`);
        setTypeProjects((prev) => ({ ...prev, [assetType]: projects }));
      } catch (error) {
        console.error(`[AssetTypeTable] Error fetching projects for: "${assetType}"`, error);
      } finally {
        setLoadingTypes((prev) => ({ ...prev, [assetType]: false }));
      }
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-lg font-semibold text-[#111827]">Asset Type Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Projects (%)</th>
              <th className="px-4 py-3 font-medium text-right">Cost ($M)</th>
              <th className="px-4 py-3 font-medium text-right">Unrealized MV</th>
              <th className="px-4 py-3 font-medium text-right">Realized MV</th>
              <th className="px-4 py-3 font-medium text-right">Total MV</th>
              <th className="px-4 py-3 font-medium text-right">MOIC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.map((row, idx) => {
              const isExpanded = expandedTypes[row.asset_type];
              const projects = typeProjects[row.asset_type] || [];

              return (
                <Fragment key={idx}>
                  <tr
                    className={cn(
                      'hover:bg-[#F9FAFB]',
                      row.is_summary && 'bg-[#F3F4F6] font-semibold',
                      !row.is_summary && 'cursor-pointer'
                    )}
                    onClick={() => !row.is_summary && toggleAssetType(row.asset_type)}
                  >
                    <td className="px-6 py-3">
                      {!row.is_summary && (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                        )
                      )}
                    </td>
                    <td className={cn('px-4 py-3 text-sm text-[#111827]', row.is_summary && 'font-semibold')}>
                      {row.asset_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCountWithPct(row.project_count, row.project_percentage)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.cost)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.unrealized_mv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.realized_mv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.total_mv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums font-medium">
                      {formatMOIC(row.moic)}
                    </td>
                  </tr>

                  {/* Expanded Projects */}
                  {isExpanded && loadingTypes[row.asset_type] && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        Loading projects...
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingTypes[row.asset_type] && projects.length === 0 && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        No projects found for this asset type
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingTypes[row.asset_type] && projects.map((project) => (
                    <tr key={`${row.asset_type}-${project.project_id}`} className="bg-[#FAFAFA]">
                      <td className="px-6 py-2"></td>
                      <td className="px-4 py-2 text-sm pl-4">
                        <button
                          onClick={() => onProjectClick(project.project_id)}
                          className="text-[#1E4B7A] hover:underline font-medium"
                        >
                          {project.project_id}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">-</td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.cost)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.unrealized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.realized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(toNumber(project.unrealized_mv) + toNumber(project.realized_mv))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatMOIC(project.moic)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Valuation Stage Table with Expandable Rows
function ValuationStageTable({
  data,
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: {
  data: ValuationStageRow[];
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick: (projectId: string) => void;
}) {
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [stageProjects, setStageProjects] = useState<Record<string, ValuationProjectRow[]>>({});
  const [loadingStages, setLoadingStages] = useState<Record<string, boolean>>({});

  const toggleStage = async (stage: string) => {
    console.log(`[ValuationStageTable] toggleStage called for: "${stage}"`);
    const isExpanded = expandedStages[stage];
    setExpandedStages((prev) => ({ ...prev, [stage]: !isExpanded }));

    // Fetch projects if expanding and not already fetched
    if (!isExpanded && !stageProjects[stage]) {
      console.log(`[ValuationStageTable] Fetching projects for: "${stage}"`);
      setLoadingStages((prev) => ({ ...prev, [stage]: true }));
      try {
        const projects = await getValuationStageProjects(vehicleId, portfolioDate, stage, dateReportedStart, dateReportedEnd);
        console.log(`[ValuationStageTable] Received ${projects.length} projects for: "${stage}"`);
        setStageProjects((prev) => ({ ...prev, [stage]: projects }));
      } catch (error) {
        console.error(`[ValuationStageTable] Error fetching projects for: "${stage}"`, error);
      } finally {
        setLoadingStages((prev) => ({ ...prev, [stage]: false }));
      }
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-lg font-semibold text-[#111827]">Valuation Stage Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium text-right">Projects (%)</th>
              <th className="px-4 py-3 font-medium text-right">Cost ($M)</th>
              <th className="px-4 py-3 font-medium text-right">Unrealized MV</th>
              <th className="px-4 py-3 font-medium text-right">Realized MV</th>
              <th className="px-4 py-3 font-medium text-right">Total MV</th>
              <th className="px-4 py-3 font-medium text-right">MOIC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.map((row, idx) => {
              const isExpanded = expandedStages[row.stage];
              const projects = stageProjects[row.stage] || [];

              return (
                <Fragment key={idx}>
                  <tr
                    className={cn(
                      'hover:bg-[#F9FAFB]',
                      row.is_summary && 'bg-[#F3F4F6] font-semibold',
                      !row.is_summary && 'cursor-pointer'
                    )}
                    onClick={() => !row.is_summary && toggleStage(row.stage)}
                  >
                    <td className="px-6 py-3">
                      {!row.is_summary && (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                        )
                      )}
                    </td>
                    <td className={cn('px-4 py-3 text-sm text-[#111827]', row.is_summary && 'font-semibold')}>
                      {row.stage}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCountWithPct(row.project_count, row.project_percentage)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.cost)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.unrealized_mv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.realized_mv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(row.total_mv)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums font-medium">
                      {formatMOIC(row.moic)}
                    </td>
                  </tr>

                  {/* Expanded Projects */}
                  {isExpanded && loadingStages[row.stage] && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        Loading projects...
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingStages[row.stage] && projects.length === 0 && (
                    <tr className="bg-[#FAFAFA]">
                      <td colSpan={8} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                        No projects found for this stage
                      </td>
                    </tr>
                  )}
                  {isExpanded && !loadingStages[row.stage] && projects.map((project) => (
                    <tr key={`${row.stage}-${project.project_id}`} className="bg-[#FAFAFA]">
                      <td className="px-6 py-2"></td>
                      <td className="px-4 py-2 text-sm pl-4">
                        <button
                          onClick={() => onProjectClick(project.project_id)}
                          className="text-[#1E4B7A] hover:underline font-medium"
                        >
                          {project.project_id}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">-</td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.cost)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.unrealized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(project.realized_mv)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatCurrency(toNumber(project.unrealized_mv) + toNumber(project.realized_mv))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                        {formatMOIC(project.moic)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Integrated Notes Section using new Notes System
function OverviewNotesSection({ vehicleId, portfolioDate }: { vehicleId: string; portfolioDate: string }) {
  return (
    <NotesSectionComponent
      sectionCode="overview"
      sectionTitle="Notes on Overview"
      vehicleId={vehicleId}
      dateOfReview={portfolioDate}
      author={DEFAULT_AUTHOR}
      showPreviousReviews={true}
      defaultExpanded={true}
      maxHeight="350px"
    />
  );
}

export function OverviewPage({ vehicleId, portfolioDate, dateReportedStart, dateReportedEnd, onProjectClick }: OverviewPageProps) {
  const [categorySelection, setCategorySelection] = useState<CategorySelection>('project_stack');
  const [showAssetBreakdown, setShowAssetBreakdown] = useState(true);
  const dateOfReview = new Date().toISOString().split('T')[0];

  // Fetch category summary (uses date range for ownership data, portfolioDate for MV)
  const { data: categorySummary, isLoading: loadingCategory } = useQuery({
    queryKey: ['categorySummary', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd, categorySelection],
    queryFn: () => getProjectCategorySummary(vehicleId, portfolioDate, categorySelection, dateReportedStart, dateReportedEnd),
    enabled: !!vehicleId && !!portfolioDate,
  });

  // Fetch MOIC buckets (uses date range for ownership data, portfolioDate for MV)
  const { data: moicBuckets, isLoading: loadingMOIC } = useQuery({
    queryKey: ['moicBuckets', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd],
    queryFn: () => getMOICBuckets(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    enabled: !!vehicleId && !!portfolioDate,
  });

  // Fetch asset type breakdown (uses date range for ownership data, portfolioDate for MV)
  const { data: assetTypes, isLoading: loadingAsset } = useQuery({
    queryKey: ['assetTypes', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd],
    queryFn: () => getAssetTypeBreakdown(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    enabled: !!vehicleId && !!portfolioDate,
  });

  // Fetch valuation breakdown (uses date range for ownership data, portfolioDate for MV)
  const { data: valuationBreakdown, isLoading: loadingValuation } = useQuery({
    queryKey: ['valuationBreakdown', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd],
    queryFn: () => getValuationBreakdown(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    enabled: !!vehicleId && !!portfolioDate,
  });

  // Fetch notes
  const { data: notes } = useQuery({
    queryKey: ['overviewNotes', vehicleId, dateOfReview],
    queryFn: () => getOverviewNotes(vehicleId, dateOfReview),
    enabled: !!vehicleId,
  });

  if (!vehicleId || !portfolioDate) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">
          <p className="text-lg">Select a Fund Manager and Investment to view overview</p>
          <p className="text-sm mt-2">Use the filters above to get started</p>
        </div>
      </div>
    );
  }

  if (loadingCategory || loadingMOIC || loadingAsset || loadingValuation) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">Loading overview data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Table 1: Category Summary */}
      <CategorySummaryTable
        data={categorySummary || []}
        categorySelection={categorySelection}
        onCategoryChange={setCategorySelection}
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        dateReportedStart={dateReportedStart}
        dateReportedEnd={dateReportedEnd}
        onProjectClick={onProjectClick}
      />

      {/* Table 2: MOIC Buckets */}
      <MOICBucketsTable
        data={moicBuckets || []}
        showAssetBreakdown={showAssetBreakdown}
        onToggleAssetBreakdown={setShowAssetBreakdown}
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        dateReportedStart={dateReportedStart}
        dateReportedEnd={dateReportedEnd}
        onProjectClick={onProjectClick}
      />

      {/* Table 3: Asset Type Breakdown */}
      <AssetTypeTable
        data={assetTypes || []}
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        dateReportedStart={dateReportedStart}
        dateReportedEnd={dateReportedEnd}
        onProjectClick={onProjectClick}
      />

      {/* Table 4: Valuation Stage Breakdown */}
      <ValuationStageTable
        data={valuationBreakdown || []}
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        dateReportedStart={dateReportedStart}
        dateReportedEnd={dateReportedEnd}
        onProjectClick={onProjectClick}
      />

      {/* Excluded Positions */}
      <ExcludedPositionsTable
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        dateReportedStart={dateReportedStart}
        dateReportedEnd={dateReportedEnd}
      />

      {/* Notes Section - Integrated with Notes System */}
      {vehicleId && (
        <OverviewNotesSection vehicleId={vehicleId} portfolioDate={portfolioDate} />
      )}
    </div>
  );
}
