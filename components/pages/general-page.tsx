'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Globe,
  Twitter,
  Linkedin,
  MapPin,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from 'lucide-react';
import {
  getGeneralManagerInfo,
  getGeneralFundInfo,
  getGeneralNotes,
  getInvestmentPeriodRange,
  getFundKPIs,
  getCapitalDeploymentTimeline,
  getVehicleCardData,
  type GeneralManagerInfo,
  type GeneralFundInfo,
  type GeneralNotes,
  type TBVFundFlows,
  type FundKPIs,
  type CapitalDeploymentPoint,
  type VehicleCardData,
} from '@/actions/general';
import { cn } from '@/lib/utils';
import { useFilterState } from '@/hooks/use-url-state';
import { NotesSection as NotesSectionComponent } from '@/components/notes/notes-section';
import { VehicleFundUpdatesSection } from '@/components/dashboard/vehicle-fund-updates-section';

const DEFAULT_AUTHOR = 'Dashboard User';

interface GeneralPageProps {
  fundManager: string;
  vehicleId: string;
  portfolioDate: string;
}

// ── Formatting utilities ──────────────────────────────────────────────

function formatCurrency(value: number | null | undefined, scale: 'M' | 'B' = 'M'): string {
  if (value === null || value === undefined) return '-';
  if (scale === 'B') return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(1)}M`;
}

function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatChartAxis(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
}

// ── Skeleton loading ──────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-200 rounded', className)} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-6">
        <div className="flex items-center gap-4">
          <SkeletonBlock className="w-12 h-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <SkeletonBlock className="h-8 w-24 rounded-full" />
        </div>
      </div>
      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-[#E5E7EB] p-4 space-y-3">
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-7 w-28" />
            <SkeletonBlock className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Two-col skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-4 w-full" />
          ))}
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-6">
          <SkeletonBlock className="h-[280px] w-full" />
        </div>
      </div>
    </div>
  );
}

// ── Manager Header Card ───────────────────────────────────────────────

function ManagerHeaderCard({ data }: { data: GeneralManagerInfo | null }) {
  const [logoError, setLogoError] = useState(false);

  if (!data) return null;

  const initial = data.name_fund?.charAt(0)?.toUpperCase() || '?';
  const twitterUrl = data.twitter_handle
    ? `https://twitter.com/${data.twitter_handle.replace('@', '')}`
    : null;

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-6">
      <div className="flex items-center justify-between">
        {/* Left: Logo + Name + Location */}
        <div className="flex items-center gap-4">
          {data.logo_url && !logoError ? (
            <img
              src={data.logo_url}
              alt={data.name_fund}
              className="w-12 h-12 rounded-full object-contain bg-[#F9FAFB] border border-[#E5E7EB]"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#1E4B7A] flex items-center justify-center text-white font-bold text-lg">
              {initial}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-[#111827]">{data.name_fund}</h1>
            {(data.location || data.country) && (
              <div className="flex items-center gap-1 text-[#6B7280] text-sm mt-0.5">
                <MapPin className="h-3.5 w-3.5" />
                <span>{[data.location, data.country].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: AuM badge + Social links */}
        <div className="flex items-center gap-3">
          {data.aum != null && data.aum > 0 && (
            <span className="bg-[#EFF6FF] text-[#1E4B7A] text-sm font-semibold px-3 py-1.5 rounded-full">
              AuM {formatCurrency(data.aum, 'B')}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {data.website && (
              <a
                href={data.website.startsWith('http') ? data.website : `https://${data.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#1E4B7A] hover:border-[#1E4B7A] transition-colors"
              >
                <Globe className="h-4 w-4" />
              </a>
            )}
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#1E4B7A] hover:border-[#1E4B7A] transition-colors"
              >
                <Twitter className="h-4 w-4" />
              </a>
            )}
            {data.linkedin && (
              <a
                href={data.linkedin.startsWith('http') ? data.linkedin : `https://${data.linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#1E4B7A] hover:border-[#1E4B7A] transition-colors"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI Metric Card ───────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor: string; // tailwind border color class
  iconBgColor: string; // tailwind bg color class
  iconTextColor: string; // tailwind text color class
}

function KPICard({ label, value, subtitle, icon, accentColor, iconBgColor, iconTextColor }: KPICardProps) {
  return (
    <div className={cn('bg-white rounded-lg border border-[#E5E7EB] p-4 border-l-4', accentColor)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-[#111827] mt-1 truncate">{value}</p>
          {subtitle && <p className="text-xs text-[#6B7280] mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ml-2', iconBgColor)}>
          <span className={iconTextColor}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function KPIMetricsRow({ kpis }: { kpis: FundKPIs }) {
  const calledPctColor =
    kpis.called_pct >= 0.75
      ? 'text-[#10B981]'
      : kpis.called_pct >= 0.5
        ? 'text-[#F59E0B]'
        : 'text-[#EF4444]';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      <KPICard
        label="Total Committed"
        value={formatCurrency(kpis.total_committed)}
        icon={<DollarSign className="h-4 w-4" />}
        accentColor="border-l-[#1E4B7A]"
        iconBgColor="bg-[#EFF6FF]"
        iconTextColor="text-[#1E4B7A]"
      />
      <KPICard
        label="Capital Called"
        value={formatCurrency(kpis.total_called)}
        subtitle={`${(kpis.called_pct * 100).toFixed(0)}% of committed`}
        icon={<ArrowUpRight className="h-4 w-4" />}
        accentColor="border-l-[#3D7AB8]"
        iconBgColor="bg-[#EFF6FF]"
        iconTextColor="text-[#3D7AB8]"
      />
      <KPICard
        label="Uncalled Capital"
        value={formatCurrency(kpis.uncalled_capital)}
        icon={<Calendar className="h-4 w-4" />}
        accentColor="border-l-[#F59E0B]"
        iconBgColor="bg-[#FFFBEB]"
        iconTextColor="text-[#F59E0B]"
      />
      <KPICard
        label="Distributed"
        value={formatCurrency(kpis.total_distributed)}
        icon={<ArrowDownRight className="h-4 w-4" />}
        accentColor="border-l-[#10B981]"
        iconBgColor="bg-[#ECFDF5]"
        iconTextColor="text-[#10B981]"
      />
      <KPICard
        label="DPI"
        value={`${kpis.dpi.toFixed(2)}x`}
        icon={<TrendingUp className="h-4 w-4" />}
        accentColor="border-l-[#10B981]"
        iconBgColor="bg-[#ECFDF5]"
        iconTextColor="text-[#10B981]"
      />
      <KPICard
        label="Called %"
        value={`${(kpis.called_pct * 100).toFixed(1)}%`}
        icon={<DollarSign className="h-4 w-4" />}
        accentColor="border-l-[#F59E0B]"
        iconBgColor="bg-[#FFFBEB]"
        iconTextColor={calledPctColor}
      />
    </div>
  );
}

// ── Fund Details Card ─────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-[#F3F4F6] last:border-b-0">
      <span className="text-[#6B7280] text-sm">{label}</span>
      <span className={cn('text-sm font-medium text-right', value ? 'text-[#111827]' : 'text-[#9CA3AF]')}>
        {value || '-'}
      </span>
    </div>
  );
}

function FundDetailsCard({ data }: { data: GeneralFundInfo }) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-base font-semibold text-[#111827]">Fund Details</h2>
      </div>
      <div className="px-6 py-2">
        <DetailRow label="Name (Vintage)" value={data.name_fund_vintage} />
        <DetailRow label="Investment Period" value={data.investment_period} />
        <DetailRow label="Fund Life + Extensions" value={data.fund_life_extensions} />
        <DetailRow label="Fees (Mgmt/Perf)" value={data.fees} />
        <DetailRow label="GP Commit" value={data.gp_commit ? formatPercentage(data.gp_commit) : null} />
        <DetailRow label="Fund Size" value={data.fund_size ? formatCurrency(data.fund_size, 'M') : null} />
        <DetailRow label="Vintage Year" value={data.vintage_year?.toString()} />
        <DetailRow label="Primary Relationship Owner" value={data.fund_relationship_owner} />
        <DetailRow label="Secondary Relationship Owner" value={data.secondary_relationship_owner} />
        <DetailRow label="Date of Review" value={data.date_of_review} />
      </div>
    </div>
  );
}

// ── Capital Deployment Chart ──────────────────────────────────────────

function CapitalDeploymentChart({ data }: { data: CapitalDeploymentPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-base font-semibold text-[#111827]">Capital Deployment</h2>
        </div>
        <div className="p-6 flex items-center justify-center h-[280px]">
          <p className="text-[#6B7280] text-sm">No flow data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-base font-semibold text-[#111827]">Capital Deployment</h2>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCalled" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1E4B7A" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#1E4B7A" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorDistributed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="flow_date"
              tickFormatter={formatChartDate}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatChartAxis}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'cumulative_called' ? 'Capital Called' : 'Distributed',
              ]}
              labelFormatter={formatChartDate}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                fontSize: 13,
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative_called"
              stroke="#1E4B7A"
              strokeWidth={2}
              fill="url(#colorCalled)"
              name="cumulative_called"
            />
            <Area
              type="monotone"
              dataKey="cumulative_distributed"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#colorDistributed)"
              name="cumulative_distributed"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── TBV Fund Breakdown Table ──────────────────────────────────────────

function TBVFundBreakdownTable({ flows }: { flows: TBVFundFlows[] }) {
  if (flows.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-base font-semibold text-[#111827]">TBV Fund Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <th className="px-6 py-3 text-left font-medium text-[#6B7280]">TBV Fund</th>
              <th className="px-6 py-3 text-right font-medium text-[#6B7280]">Commitment</th>
              <th className="px-6 py-3 text-right font-medium text-[#6B7280]">Called</th>
              <th className="px-6 py-3 text-right font-medium text-[#6B7280]">Called %</th>
              <th className="px-6 py-3 text-right font-medium text-[#6B7280]">Distributed</th>
              <th className="px-6 py-3 text-right font-medium text-[#6B7280]">DPI</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow) => {
              const calledPctBg =
                flow.called_percentage >= 75
                  ? 'bg-[#ECFDF5] text-[#10B981]'
                  : flow.called_percentage >= 50
                    ? 'bg-[#FFFBEB] text-[#F59E0B]'
                    : 'bg-[#FEF2F2] text-[#EF4444]';

              return (
                <tr key={flow.tbv_fund} className="border-b border-[#F3F4F6] last:border-b-0 hover:bg-[#F9FAFB]">
                  <td className="px-6 py-3 font-medium text-[#111827]">{flow.tbv_fund}</td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-[#111827]">
                    {formatCurrency(flow.commitment)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-[#111827]">
                    {formatCurrency(flow.called)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-semibold', calledPctBg)}>
                      {flow.called_percentage}%
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-[#111827]">
                    {formatCurrency(flow.distributed)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono tabular-nums text-[#111827]">
                    {flow.dpi}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Notes Section ─────────────────────────────────────────────────────

function GeneralNotesSection({ vehicleId, portfolioDate }: { vehicleId: string; portfolioDate: string }) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <NotesSectionComponent
        sectionCode="general_actions"
        sectionTitle="Notes on General - Actions"
        vehicleId={vehicleId}
        dateOfReview={portfolioDate}
        author={DEFAULT_AUTHOR}
        showPreviousReviews={true}
        defaultExpanded={true}
        maxHeight="300px"
      />
      <NotesSectionComponent
        sectionCode="general_conclusion"
        sectionTitle="Notes on General - Conclusion"
        vehicleId={vehicleId}
        dateOfReview={portfolioDate}
        author={DEFAULT_AUTHOR}
        showPreviousReviews={true}
        defaultExpanded={true}
        maxHeight="300px"
      />
    </div>
  );
}

// ── Vehicle Overview Card (for fund-manager-only view) ────────────────

function VehicleOverviewCard({
  data,
  onClick,
}: {
  data: VehicleCardData;
  onClick: () => void;
}) {
  const { kpis, timeline } = data;
  const chartId = `vc-${data.vehicle_id.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-[#E5E7EB] cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-150"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#111827] truncate">
            {data.full_strategy_name || data.vehicle_id}
          </h3>
          {data.vintage != null && (
            <span className="ml-2 flex-shrink-0 bg-[#EFF6FF] text-[#1E4B7A] text-xs font-medium px-2 py-0.5 rounded-full">
              {data.vintage}
            </span>
          )}
        </div>
      </div>

      {/* Mini KPI grid (2x2) */}
      <div className="grid grid-cols-2 gap-px bg-[#F3F4F6]">
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide">Committed</p>
          <p className="text-sm font-bold text-[#111827] mt-0.5">{formatCurrency(kpis.total_committed)}</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide">Called</p>
          <p className="text-sm font-bold text-[#111827] mt-0.5">
            {formatCurrency(kpis.total_called)}{' '}
            <span className="text-[10px] font-normal text-[#6B7280]">({(kpis.called_pct * 100).toFixed(0)}%)</span>
          </p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide">Distributed</p>
          <p className="text-sm font-bold text-[#10B981] mt-0.5">{formatCurrency(kpis.total_distributed)}</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide">DPI</p>
          <p className="text-sm font-bold text-[#111827] mt-0.5">{kpis.dpi.toFixed(2)}x</p>
        </div>
      </div>

      {/* Mini Chart */}
      {timeline.length > 0 && (
        <div className="px-3 py-2">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={timeline} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id={`${chartId}-called`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1E4B7A" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1E4B7A" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id={`${chartId}-dist`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis dataKey="flow_date" hide />
              <YAxis hide />
              <Area
                type="monotone"
                dataKey="cumulative_called"
                stroke="#1E4B7A"
                strokeWidth={1.5}
                fill={`url(#${chartId}-called)`}
              />
              <Area
                type="monotone"
                dataKey="cumulative_distributed"
                stroke="#10B981"
                strokeWidth={1.5}
                fill={`url(#${chartId}-dist)`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function VehicleCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-[#E5E7EB] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-5 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="space-y-1">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-5 w-20" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="h-[140px] w-full" />
        </div>
      ))}
    </div>
  );
}

function VehicleCardsGrid({
  fundManager,
  dateOfReview,
}: {
  fundManager: string;
  dateOfReview: string;
}) {
  const [, setFilters] = useFilterState();
  const [showAll, setShowAll] = useState(false);

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicleCardData', fundManager, dateOfReview],
    queryFn: () => getVehicleCardData(fundManager, dateOfReview),
    enabled: !!fundManager,
  });

  if (isLoading) return <VehicleCardsSkeleton />;

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <p className="text-center text-[#6B7280] text-sm">No vehicles found for this fund manager</p>
      </div>
    );
  }

  const withCommitment = vehicles.filter((v) => v.kpis.total_committed > 0);
  const hiddenCount = vehicles.length - withCommitment.length;
  const displayed = showAll ? vehicles : withCommitment;

  return (
    <div className="space-y-3">
      {hiddenCount > 0 && (
        <div className="flex items-center justify-end">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#6B7280]">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#D1D5DB] text-[#1E4B7A] focus:ring-[#1E4B7A]"
            />
            Show all strategies ({hiddenCount} with no commitment)
          </label>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayed.map((v) => (
          <VehicleOverviewCard
            key={v.vehicle_id}
            data={v}
            onClick={() =>
              setFilters({
                investmentName: v.vehicle_id,
                vehicleId: v.vehicle_id,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────

export function GeneralPage({ fundManager, vehicleId, portfolioDate }: GeneralPageProps) {
  const dateOfReview = new Date().toISOString().split('T')[0];
  const hasVehicle = !!vehicleId;

  // Fetch manager info
  const { data: managerInfo, isLoading: loadingManager } = useQuery({
    queryKey: ['managerInfo', fundManager],
    queryFn: () => getGeneralManagerInfo(fundManager),
    enabled: !!fundManager,
  });

  // Fetch fund info (only when vehicle selected)
  const { data: fundInfo, isLoading: loadingFund } = useQuery({
    queryKey: ['fundInfo', vehicleId, dateOfReview],
    queryFn: () => getGeneralFundInfo(vehicleId, dateOfReview),
    enabled: hasVehicle,
  });

  // Fetch KPIs (only when vehicle selected)
  const { data: kpis, isLoading: loadingKPIs } = useQuery({
    queryKey: ['fundKPIs', vehicleId, dateOfReview],
    queryFn: () => getFundKPIs(vehicleId, dateOfReview),
    enabled: hasVehicle,
  });

  // Fetch capital deployment timeline (only when vehicle selected)
  const { data: timeline } = useQuery({
    queryKey: ['capitalDeployment', vehicleId],
    queryFn: () => getCapitalDeploymentTimeline(vehicleId),
    enabled: hasVehicle,
  });

  // Fetch notes (only when vehicle selected)
  const { data: notes } = useQuery({
    queryKey: ['notes', vehicleId, dateOfReview],
    queryFn: () => getGeneralNotes(vehicleId, dateOfReview),
    enabled: hasVehicle,
  });

  // Fetch investment period range (only when vehicle selected)
  const { data: periodRange } = useQuery({
    queryKey: ['periodRange', vehicleId],
    queryFn: () => getInvestmentPeriodRange(vehicleId),
    enabled: hasVehicle,
  });

  // Empty state — no fund manager selected
  if (!fundManager && !vehicleId) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">
          <p className="text-lg">Select a Fund Manager and Investment to view details</p>
          <p className="text-sm mt-2">Use the filters above to get started</p>
        </div>
      </div>
    );
  }

  // Fund manager selected but no vehicle — show manager header + vehicle cards
  if (fundManager && !hasVehicle) {
    if (loadingManager) return <LoadingSkeleton />;

    return (
      <div className="space-y-6">
        <ManagerHeaderCard data={managerInfo || null} />
        <VehicleCardsGrid fundManager={fundManager} dateOfReview={dateOfReview} />
      </div>
    );
  }

  // Vehicle selected — full single-vehicle view
  if (loadingManager || loadingFund || loadingKPIs) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* A. Manager Header Card */}
      <ManagerHeaderCard data={managerInfo || null} />

      {/* B. KPI Metrics Row */}
      {kpis && <KPIMetricsRow kpis={kpis} />}

      {/* C. Two-Column Grid: Fund Details + Capital Deployment Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {fundInfo && <FundDetailsCard data={fundInfo} />}
        <CapitalDeploymentChart data={timeline || []} />
      </div>

      {/* D. TBV Fund Breakdown */}
      {fundInfo && <TBVFundBreakdownTable flows={fundInfo.tbv_fund_flows} />}

      {/* E. Vehicle Updates + Notes */}
      <VehicleFundUpdatesSection
        vehicleId={vehicleId}
        dateOfReview={dateOfReview}
        author={DEFAULT_AUTHOR}
        title="VEHICLE UPDATES"
        maxHeight="500px"
        defaultExpanded={true}
      />

      <GeneralNotesSection vehicleId={vehicleId} portfolioDate={portfolioDate} />
    </div>
  );
}
