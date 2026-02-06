'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAllTbvFundsPerformance,
  getHistoricalNotes,
  type PeriodType,
  type HistoricalPerformanceRow,
  type TbvFundPerformanceData,
} from '@/actions/historical-changes';
import { NotesSection as NotesSectionComponent } from '@/components/notes/notes-section';

// Default author - in production, this would come from authentication
const DEFAULT_AUTHOR = 'Dashboard User';

interface HistoricalPageProps {
  vehicleId: string;
  portfolioDate: string;
  dateReportedStart: string;
  dateReportedEnd: string;
}

// Formatting utilities
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

function formatCurrencyWithPct(value: unknown, pct: unknown): string {
  const num = toNumber(value);
  const p = toNumber(pct);
  if (num === 0 && p === 0) return '-';
  return `${formatCurrency(num)} (${(p * 100).toFixed(0)}%)`;
}

function formatMultiple(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = toNumber(value);
  if (num === 0) return '-';
  return `${num.toFixed(2)}x`;
}

// Historical Performance Table for a single TBV Fund
function HistoricalPerformanceTable({
  tbvFund,
  data,
  isLoading,
}: {
  tbvFund: string;
  data: HistoricalPerformanceRow[];
  isLoading: boolean;
}) {
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  // Initialize explanations from data
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const row of data) {
      if (!row.is_total) {
        initial[row.period] = row.explanation || '';
      }
    }
    setExplanations(initial);
  }, [data]);

  const handleExplanationChange = (period: string, value: string) => {
    setExplanations((prev) => ({ ...prev, [period]: value }));
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
        <div className="text-[#6B7280]">Loading historical performance data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
        <div className="text-[#6B7280]">No historical performance data available for {tbvFund}</div>
      </div>
    );
  }

  // Separate data rows from total row
  const dataRows = data.filter((row) => !row.is_total);
  const totalRow = data.find((row) => row.is_total);

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-lg font-semibold text-[#111827]">
          Historical Performance Summary - {tbvFund}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
              <th className="px-6 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium text-right">Cumulative Deployment</th>
              <th className="px-4 py-3 font-medium text-right">Capital Calls</th>
              <th className="px-4 py-3 font-medium text-right">Distributions</th>
              <th className="px-4 py-3 font-medium text-right">NAV</th>
              <th className="px-4 py-3 font-medium text-right">TVPI</th>
              <th className="px-4 py-3 font-medium text-right">DPI</th>
              <th className="px-4 py-3 font-medium min-w-[200px]">Explanation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {dataRows.map((row) => (
              <tr key={row.period} className="hover:bg-[#F9FAFB]">
                <td className="px-6 py-3 text-sm font-medium text-[#111827]">{row.period}</td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrencyWithPct(row.cumulative_deployment, row.deployment_pct)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrencyWithPct(row.capital_calls, row.capital_calls_pct)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrencyWithPct(row.distributions, row.distributions_pct)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {row.nav !== null ? formatCurrency(row.nav) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatMultiple(row.tvpi)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatMultiple(row.dpi)}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={explanations[row.period] || ''}
                    onChange={(e) => handleExplanationChange(row.period, e.target.value)}
                    placeholder="Add explanation..."
                    className="w-full px-2 py-1 text-sm border border-[#E5E7EB] rounded focus:outline-none focus:ring-2 focus:ring-[#1E4B7A] focus:border-transparent"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          {totalRow && (
            <tfoot>
              <tr className="bg-[#F3F4F6] font-semibold">
                <td className="px-6 py-3 text-sm text-[#111827]">TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrencyWithPct(totalRow.cumulative_deployment, 1)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totalRow.capital_calls)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatCurrency(totalRow.distributions)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {totalRow.nav !== null ? formatCurrency(totalRow.nav) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatMultiple(totalRow.tvpi)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono tabular-nums">
                  {formatMultiple(totalRow.dpi)}
                </td>
                <td className="px-4 py-3 text-sm text-[#6B7280]">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Period Type Toggle
function PeriodTypeToggle({
  value,
  onChange,
}: {
  value: PeriodType;
  onChange: (type: PeriodType) => void;
}) {
  const options: PeriodType[] = ['Quarterly', 'Half Yearly', 'Yearly'];

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium text-[#374151]">Period Type:</span>
      <div className="flex items-center gap-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="periodType"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="w-4 h-4 text-[#1E4B7A] focus:ring-[#1E4B7A] border-[#D1D5DB]"
            />
            <span className="text-sm text-[#374151]">{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Integrated Notes Section using new Notes System
function HistoricalNotesSection({ vehicleId, portfolioDate }: { vehicleId: string; portfolioDate: string }) {
  return (
    <NotesSectionComponent
      sectionCode="historical_changes"
      sectionTitle="Notes on Historical Changes"
      vehicleId={vehicleId}
      dateOfReview={portfolioDate}
      author={DEFAULT_AUTHOR}
      showPreviousReviews={true}
      defaultExpanded={true}
      maxHeight="350px"
    />
  );
}

// Main Page Component
export function HistoricalPage({
  vehicleId,
  portfolioDate,
  dateReportedStart,
  dateReportedEnd,
}: HistoricalPageProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('Quarterly');

  // Fetch all TBV funds performance data
  const { data: allFundsData = [], isLoading: loadingPerformance } = useQuery({
    queryKey: [
      'allTbvFundsPerformance',
      vehicleId,
      dateReportedStart,
      dateReportedEnd,
      periodType,
    ],
    queryFn: () =>
      getAllTbvFundsPerformance(
        vehicleId,
        dateReportedStart,
        dateReportedEnd,
        periodType
      ),
    enabled: !!vehicleId && !!dateReportedStart && !!dateReportedEnd,
  });

  // Fetch notes
  const dateOfReview = new Date().toISOString().split('T')[0];
  const { data: notesData } = useQuery({
    queryKey: ['historicalNotes', vehicleId, dateOfReview],
    queryFn: () => getHistoricalNotes(vehicleId, dateOfReview),
    enabled: !!vehicleId,
  });

  // Show message if no vehicle selected
  if (!vehicleId) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
          <div className="text-[#6B7280]">Please select an investment to view historical changes</div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loadingPerformance) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <PeriodTypeToggle value={periodType} onChange={setPeriodType} />
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
          <div className="text-[#6B7280]">Loading...</div>
        </div>
      </div>
    );
  }

  // Show message if no TBV funds found
  if (allFundsData.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <PeriodTypeToggle value={periodType} onChange={setPeriodType} />
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
          <div className="text-[#6B7280]">No TBV fund data available for this vehicle</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
        <div className="flex flex-wrap items-center gap-6">
          <PeriodTypeToggle value={periodType} onChange={setPeriodType} />
          <div className="text-sm text-[#6B7280]">
            {allFundsData.length} TBV fund{allFundsData.length !== 1 ? 's' : ''} found
          </div>
        </div>
      </div>

      {/* Historical Performance Tables - One per TBV Fund */}
      {allFundsData.map((fundData) => (
        <HistoricalPerformanceTable
          key={fundData.tbv_vehicle_id}
          tbvFund={fundData.tbv_fund}
          data={fundData.rows}
          isLoading={false}
        />
      ))}

      {/* Notes Section - Integrated with Notes System */}
      {vehicleId && (
        <HistoricalNotesSection vehicleId={vehicleId} portfolioDate={portfolioDate} />
      )}
    </div>
  );
}
