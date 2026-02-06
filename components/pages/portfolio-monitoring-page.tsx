'use client';

import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  getNewInvestmentsAggregated,
  getNewInvestmentAssetBreakdown,
  getAvailableInvestmentDates,
  getTopMVPositions,
  getTopMVProjectDetails,
  getTopCostPositions,
  getTopCostProjectDetails,
  type OwnershipType,
  type NewInvestmentProjectRow,
  type NewInvestmentAssetRow,
  type TopMVRow,
  type TopMVAssetRow,
  type TopCostRow,
  type TopCostProjectRow,
} from '@/actions/portfolio-monitoring';
import { getMOICColorClass } from '@/lib/moic-utils';
import { cn } from '@/lib/utils';
import { NotesSection as NotesSectionComponent } from '@/components/notes/notes-section';
import { ExcludedPositionsTable } from '@/components/dashboard/excluded-positions-table';

// Default author - in production, this would come from authentication
const DEFAULT_AUTHOR = 'Dashboard User';

interface PortfolioMonitoringPageProps {
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick?: (projectId: string) => void;
}

// ============================================================================
// Formatting utilities
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
  return `${moic.toFixed(2)}x`;
}

function formatLiveness(score: number | null): string {
  if (score === null) return '-';
  return score.toFixed(0);
}

// ============================================================================
// Table 1: New Investments & Top Ups
// ============================================================================

function NewInvestmentsTable({
  data,
  ownershipType,
  onOwnershipTypeChange,
  showAssetBreakdown,
  onShowAssetBreakdownChange,
  investmentDate,
  onInvestmentDateChange,
  availableDates,
  vehicleId,
  onProjectClick,
}: {
  data: NewInvestmentProjectRow[];
  ownershipType: OwnershipType;
  onOwnershipTypeChange: (type: OwnershipType) => void;
  showAssetBreakdown: boolean;
  onShowAssetBreakdownChange: (value: boolean) => void;
  investmentDate: string;
  onInvestmentDateChange: (date: string) => void;
  availableDates: string[];
  vehicleId: string;
  onProjectClick?: (projectId: string) => void;
}) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [assetData, setAssetData] = useState<Record<string, NewInvestmentAssetRow[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});

  const toggleProject = async (projectId: string, hasMultiple: boolean) => {
    if (!showAssetBreakdown || !hasMultiple) return;

    const isExpanded = expandedProjects[projectId];
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !isExpanded }));

    if (!isExpanded && !assetData[projectId]) {
      setLoadingProjects((prev) => ({ ...prev, [projectId]: true }));
      try {
        const details = await getNewInvestmentAssetBreakdown(
          vehicleId,
          projectId,
          ownershipType,
          investmentDate
        );
        setAssetData((prev) => ({ ...prev, [projectId]: details }));
      } catch (error) {
        console.error('Error fetching asset breakdown:', error);
      } finally {
        setLoadingProjects((prev) => ({ ...prev, [projectId]: false }));
      }
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#111827]">New Investments & Top Ups</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAssetBreakdown}
              onChange={(e) => onShowAssetBreakdownChange(e.target.checked)}
              className="w-4 h-4 text-[#1E4B7A] border-[#E5E7EB] rounded focus:ring-[#1E4B7A]"
            />
            <span className="text-sm text-[#6B7280]">Show Asset Breakdown</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6B7280]">Investment Date:</span>
            <select
              value={investmentDate}
              onChange={(e) => onInvestmentDateChange(e.target.value)}
              className="border border-[#E5E7EB] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
            >
              {availableDates.length === 0 ? (
                <option value="">No dates available</option>
              ) : (
                availableDates.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))
              )}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6B7280]">Ownership Type:</span>
            <select
              value={ownershipType}
              onChange={(e) => onOwnershipTypeChange(e.target.value as OwnershipType)}
              className="border border-[#E5E7EB] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
            >
              <option value="All">All</option>
              <option value="Established">Established</option>
              <option value="Top Up">Top Up</option>
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium text-right">Cost ($M)</th>
              <th className="px-4 py-3 font-medium text-right">Val. Token</th>
              <th className="px-4 py-3 font-medium text-right">Val. Equity</th>
              <th className="px-4 py-3 font-medium">Established</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-[#6B7280]">
                  No new investments found for this period
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const isExpanded = expandedProjects[row.project_id];
                const details = assetData[row.project_id] || [];
                const isLoading = loadingProjects[row.project_id];
                const canExpand = showAssetBreakdown && row.has_multiple_asset_classes;

                return (
                  <Fragment key={row.project_id}>
                    <tr
                      className={cn('hover:bg-[#F9FAFB]', canExpand && 'cursor-pointer')}
                      onClick={() => toggleProject(row.project_id, row.has_multiple_asset_classes)}
                    >
                      <td className="px-4 py-3">
                        {canExpand && (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {onProjectClick ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onProjectClick(row.project_id); }}
                            className="text-[#1E4B7A] hover:underline"
                          >
                            {row.project_id}
                          </button>
                        ) : (
                          <span className="text-[#111827]">{row.project_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrency(row.cost)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {row.valuation_token ? formatCurrency(row.valuation_token) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {row.valuation_equity ? formatCurrency(row.valuation_equity) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6B7280]">{row.established_type || '-'}</td>
                    </tr>

                    {/* Asset class breakdown rows */}
                    {isExpanded && isLoading && (
                      <tr className="bg-[#FAFAFA]">
                        <td colSpan={6} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                          Loading...
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isLoading && details.length === 0 && (
                      <tr className="bg-[#FAFAFA]">
                        <td colSpan={6} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                          No asset breakdown available
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isLoading && details.map((detail) => (
                      <tr key={`${row.project_id}-${detail.asset_class}`} className="bg-[#FAFAFA]">
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2 text-sm text-[#6B7280] pl-4">
                          <span className="font-medium">{detail.asset_class}</span>
                          <span className="ml-3 text-xs">
                            {detail.instrument_types && `Instrument: ${detail.instrument_types}`}
                            {detail.outcome_type && ` | Outcome: ${detail.outcome_type}`}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                          {formatCurrency(detail.cost)}
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Table 2: Top N Market Value
// ============================================================================

function TopMVTable({
  data,
  topN,
  onTopNChange,
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: {
  data: TopMVRow[];
  topN: number;
  onTopNChange: (n: number) => void;
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick?: (projectId: string) => void;
}) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [projectDetails, setProjectDetails] = useState<Record<string, TopMVAssetRow[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});

  const toggleProject = async (projectId: string) => {
    const isExpanded = expandedProjects[projectId];
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !isExpanded }));

    if (!isExpanded && !projectDetails[projectId]) {
      setLoadingProjects((prev) => ({ ...prev, [projectId]: true }));
      try {
        const details = await getTopMVProjectDetails(vehicleId, projectId, portfolioDate, dateReportedStart, dateReportedEnd);
        setProjectDetails((prev) => ({ ...prev, [projectId]: details }));
      } catch (error) {
        console.error('Error fetching project details:', error);
      } finally {
        setLoadingProjects((prev) => ({ ...prev, [projectId]: false }));
      }
    }
  };

  // Calculate totals for footer
  const totals = useMemo(() => data.reduce(
    (acc, row) => ({
      cost: acc.cost + row.cost,
      unrealized_mv: acc.unrealized_mv + row.unrealized_mv,
      realized_mv: acc.realized_mv + row.realized_mv,
      total_mv: acc.total_mv + row.total_mv,
    }),
    { cost: 0, unrealized_mv: 0, realized_mv: 0, total_mv: 0 }
  ), [data]);
  const totalMOIC = totals.cost > 0 ? totals.total_mv / totals.cost : 0;

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#111827]">Top Market Value Positions</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B7280]">Top N:</span>
          <select
            value={topN}
            onChange={(e) => onTopNChange(parseInt(e.target.value))}
            className="border border-[#E5E7EB] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={0}>All</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium text-right">Cost ($M)</th>
              <th className="px-4 py-3 font-medium text-right">Unrealized MV</th>
              <th className="px-4 py-3 font-medium text-right">Realized MV</th>
              <th className="px-4 py-3 font-medium text-right">MV ($M)</th>
              <th className="px-4 py-3 font-medium text-right">MOIC</th>
              <th className="px-4 py-3 font-medium text-right">QTD</th>
              <th className="px-4 py-3 font-medium text-right">Liveness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-[#6B7280]">
                  No positions found
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const isExpanded = expandedProjects[row.project_id];
                const details = projectDetails[row.project_id] || [];
                const isLoading = loadingProjects[row.project_id];

                return (
                  <Fragment key={row.project_id}>
                    <tr
                      className="hover:bg-[#F9FAFB] cursor-pointer"
                      onClick={() => toggleProject(row.project_id)}
                    >
                      <td className="px-6 py-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {onProjectClick ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onProjectClick(row.project_id); }}
                            className="text-[#1E4B7A] hover:underline"
                          >
                            {row.project_id}
                          </button>
                        ) : (
                          <span className="text-[#111827]">{row.project_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrencyWithPct(row.cost, row.cost_percentage)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrency(row.unrealized_mv)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrency(row.realized_mv)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrencyWithPct(row.total_mv, row.mv_percentage)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium', getMOICColorClass(row.moic))}>
                          {formatMOIC(row.moic)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {row.qtd_line_item !== null ? formatPercentage(row.qtd_line_item) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatLiveness(row.liveness_score)}
                      </td>
                    </tr>

                    {/* Expanded details */}
                    {isExpanded && isLoading && (
                      <tr className="bg-[#FAFAFA]">
                        <td colSpan={9} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                          Loading...
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isLoading && details.length === 0 && (
                      <tr className="bg-[#FAFAFA]">
                        <td colSpan={9} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                          No details found
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isLoading && details.map((detail) => (
                      <tr key={detail.asset_class} className="bg-[#FAFAFA]">
                        <td className="px-6 py-2"></td>
                        <td className="px-4 py-2 text-sm text-[#6B7280] pl-4">
                          {detail.asset_class}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                          {formatCurrency(detail.cost)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                          {formatCurrency(detail.unrealized_mv)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                          {formatCurrency(detail.realized_mv)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                          {formatCurrency(detail.total_mv)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right">
                          <span className={cn('px-2 py-1 rounded text-xs font-medium', getMOICColorClass(detail.moic))}>
                            {formatMOIC(detail.moic)}
                          </span>
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="bg-[#F3F4F6] font-semibold">
                <td className="px-6 py-3"></td>
                <td className="px-4 py-3 text-sm">TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.cost)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.unrealized_mv)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.realized_mv)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.total_mv)}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <span className={cn('px-2 py-1 rounded text-xs font-medium', getMOICColorClass(totalMOIC))}>
                    {formatMOIC(totalMOIC)}
                  </span>
                </td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Table 3: Top N Cost
// ============================================================================

function TopCostTable({
  data,
  topN,
  onTopNChange,
  vehicleId,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: {
  data: TopCostRow[];
  topN: number;
  onTopNChange: (n: number) => void;
  vehicleId: string;
  dateReportedStart: string;
  dateReportedEnd: string;
  onProjectClick?: (projectId: string) => void;
}) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [projectDetails, setProjectDetails] = useState<Record<string, TopCostProjectRow[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});

  const toggleProject = async (projectId: string) => {
    const isExpanded = expandedProjects[projectId];
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !isExpanded }));

    if (!isExpanded && !projectDetails[projectId]) {
      setLoadingProjects((prev) => ({ ...prev, [projectId]: true }));
      try {
        const details = await getTopCostProjectDetails(vehicleId, projectId, dateReportedStart, dateReportedEnd);
        setProjectDetails((prev) => ({ ...prev, [projectId]: details }));
      } catch (error) {
        console.error('Error fetching project details:', error);
      } finally {
        setLoadingProjects((prev) => ({ ...prev, [projectId]: false }));
      }
    }
  };

  // Calculate totals for footer
  const totals = useMemo(() => data.reduce(
    (acc, row) => ({
      total_cost: acc.total_cost + row.total_cost,
      established_cost: acc.established_cost + row.established_cost,
      topup_cost: acc.topup_cost + row.topup_cost,
      divested_cost: acc.divested_cost + row.divested_cost,
    }),
    { total_cost: 0, established_cost: 0, topup_cost: 0, divested_cost: 0 }
  ), [data]);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#111827]">Top Cost Positions</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B7280]">Top N:</span>
          <select
            value={topN}
            onChange={(e) => onTopNChange(parseInt(e.target.value))}
            className="border border-[#E5E7EB] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={0}>All</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium text-right">Total Cost ($M)</th>
              <th className="px-4 py-3 font-medium text-right">Established</th>
              <th className="px-4 py-3 font-medium text-right">Top Up</th>
              <th className="px-4 py-3 font-medium text-right">Divested</th>
              <th className="px-4 py-3 font-medium text-right">Liveness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-[#6B7280]">
                  No positions found
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const isExpanded = expandedProjects[row.project_id];
                const details = projectDetails[row.project_id] || [];
                const isLoading = loadingProjects[row.project_id];

                return (
                  <Fragment key={row.project_id}>
                    <tr
                      className="hover:bg-[#F9FAFB] cursor-pointer"
                      onClick={() => toggleProject(row.project_id)}
                    >
                      <td className="px-6 py-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {onProjectClick ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onProjectClick(row.project_id); }}
                            className="text-[#1E4B7A] hover:underline"
                          >
                            {row.project_id}
                          </button>
                        ) : (
                          <span className="text-[#111827]">{row.project_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrencyWithPct(row.total_cost, row.total_cost_percentage)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrencyWithPct(row.established_cost, row.established_cost_percentage)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrencyWithPct(row.topup_cost, row.topup_cost_percentage)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatCurrencyWithPct(row.divested_cost, row.divested_cost_percentage)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                        {formatLiveness(row.liveness_score)}
                      </td>
                    </tr>

                    {/* Expanded details */}
                    {isExpanded && isLoading && (
                      <tr className="bg-[#FAFAFA]">
                        <td colSpan={7} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                          Loading...
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isLoading && details.length === 0 && (
                      <tr className="bg-[#FAFAFA]">
                        <td colSpan={7} className="px-6 py-2 text-sm text-[#6B7280] text-center">
                          No details found
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isLoading && details.map((detail, idx) => (
                      <tr key={`${detail.ownership_id}-${detail.date_reported}-${idx}`} className="bg-[#FAFAFA]">
                        <td className="px-6 py-2"></td>
                        <td className="px-4 py-2 text-sm text-[#6B7280] pl-4">
                          {detail.ownership_id}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono tabular-nums text-[#6B7280]">
                          {formatCurrency(detail.cost)}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#6B7280]">{detail.asset_class}</td>
                        <td className="px-4 py-2 text-sm text-[#6B7280]">{detail.ownership_type}</td>
                        <td className="px-4 py-2 text-sm text-[#6B7280]">{detail.date_reported}</td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="bg-[#F3F4F6] font-semibold">
                <td className="px-6 py-3"></td>
                <td className="px-4 py-3 text-sm">TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.total_cost)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.established_cost)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.topup_cost)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totals.divested_cost)}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Integrated Notes Section using new Notes System
// ============================================================================

function PortfolioMonitoringNotesSection({ vehicleId, portfolioDate }: { vehicleId: string; portfolioDate: string }) {
  return (
    <NotesSectionComponent
      sectionCode="portfolio_monitoring"
      sectionTitle="Notes on Portfolio Monitoring"
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

export function PortfolioMonitoringPage({
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
  onProjectClick,
}: PortfolioMonitoringPageProps) {
  // Section-specific state
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('All');
  const [showAssetBreakdown, setShowAssetBreakdown] = useState(false);
  const [investmentDate, setInvestmentDate] = useState<string>('');
  const [topNMV, setTopNMV] = useState(10);
  const [topNCost, setTopNCost] = useState(10);

  // Fetch available investment dates for the New Investments table
  const { data: availableDates } = useQuery({
    queryKey: ['availableInvestmentDates', vehicleId],
    queryFn: () => getAvailableInvestmentDates(vehicleId),
    enabled: !!vehicleId,
  });

  // Set default investment date when available dates are loaded
  const effectiveInvestmentDate = investmentDate || (availableDates && availableDates.length > 0 ? availableDates[0] : '');

  // Fetch New Investments data (filtered by exact investmentDate, NOT by date range)
  const { data: newInvestments, isLoading: loadingNewInvestments } = useQuery({
    queryKey: ['newInvestmentsAggregated', vehicleId, ownershipType, effectiveInvestmentDate],
    queryFn: () => getNewInvestmentsAggregated(vehicleId, ownershipType, effectiveInvestmentDate),
    enabled: !!vehicleId && !!effectiveInvestmentDate,
  });

  // Fetch Top MV data (Cost uses delta_cost sum within date range)
  const { data: topMVPositions, isLoading: loadingTopMV } = useQuery({
    queryKey: ['topMVPositions', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd, topNMV],
    queryFn: () => getTopMVPositions(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd, topNMV),
    enabled: !!vehicleId && !!portfolioDate,
  });

  // Fetch Top Cost data (uses delta_cost sum within date range)
  const { data: topCostPositions, isLoading: loadingTopCost } = useQuery({
    queryKey: ['topCostPositions', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd, topNCost],
    queryFn: () => getTopCostPositions(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd, topNCost),
    enabled: !!vehicleId && !!portfolioDate,
  });

  if (!vehicleId || !portfolioDate) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">
          <p className="text-lg">Select a Fund Manager and Investment to view portfolio monitoring</p>
          <p className="text-sm mt-2">Use the filters above to get started</p>
        </div>
      </div>
    );
  }

  if (loadingNewInvestments || loadingTopMV || loadingTopCost) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">Loading portfolio data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Table 1: New Investments */}
      <NewInvestmentsTable
        data={newInvestments || []}
        ownershipType={ownershipType}
        onOwnershipTypeChange={setOwnershipType}
        showAssetBreakdown={showAssetBreakdown}
        onShowAssetBreakdownChange={setShowAssetBreakdown}
        investmentDate={effectiveInvestmentDate}
        onInvestmentDateChange={setInvestmentDate}
        availableDates={availableDates || []}
        vehicleId={vehicleId}
        onProjectClick={onProjectClick}
      />

      {/* Table 2: Top MV */}
      <TopMVTable
        data={topMVPositions || []}
        topN={topNMV}
        onTopNChange={setTopNMV}
        vehicleId={vehicleId}
        portfolioDate={portfolioDate}
        dateReportedStart={dateReportedStart}
        dateReportedEnd={dateReportedEnd}
        onProjectClick={onProjectClick}
      />

      {/* Table 3: Top Cost */}
      <TopCostTable
        data={topCostPositions || []}
        topN={topNCost}
        onTopNChange={setTopNCost}
        vehicleId={vehicleId}
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
        <PortfolioMonitoringNotesSection vehicleId={vehicleId} portfolioDate={portfolioDate} />
      )}
    </div>
  );
}
