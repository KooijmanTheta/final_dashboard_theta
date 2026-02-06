'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import {
  getGeneralManagerInfo,
  getGeneralFundInfo,
  getGeneralNotes,
  getInvestmentPeriodRange,
  type GeneralManagerInfo,
  type GeneralFundInfo,
  type GeneralNotes,
  type TBVFundFlows,
} from '@/actions/general';
import { cn } from '@/lib/utils';
import { NotesSection as NotesSectionComponent } from '@/components/notes/notes-section';
import { VehicleFundUpdatesSection } from '@/components/dashboard/vehicle-fund-updates-section';

// Default author - in production, this would come from authentication
const DEFAULT_AUTHOR = 'Dashboard User';

interface GeneralPageProps {
  fundManager: string;
  vehicleId: string;
  portfolioDate: string;
}

// Formatting utilities
function formatCurrency(value: number | null | undefined, scale: 'M' | 'B' = 'M'): string {
  if (value === null || value === undefined) return '-';
  if (scale === 'B') {
    return `$${(value / 1e9).toFixed(1)}B`;
  }
  return `$${(value / 1e6).toFixed(1)}M`;
}

function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatTBVCommitment(data: TBVFundFlows): string {
  if (data.commitment === 0) return '-';
  return `$${(data.commitment / 1e6).toFixed(1)}M (${data.called_percentage}% called)`;
}

function formatTBVDistributed(data: TBVFundFlows): string {
  if (data.distributed === 0 && data.commitment === 0) return '-';
  return `$${(data.distributed / 1e6).toFixed(1)}M (${data.dpi}% DPI)`;
}

// Key-Value Table Row Component
function TableRow({
  label,
  value,
  isUrl = false,
}: {
  label: string;
  value: string | null | undefined;
  isUrl?: boolean;
}) {
  // Format display text for URLs
  const getDisplayText = (url: string): string => {
    // Handle Twitter/X URLs - show @handle
    if (url.includes('twitter.com/') || url.includes('x.com/')) {
      const handle = url.split('/').pop();
      return handle ? `@${handle}` : url;
    }
    // For other URLs, show domain without protocol
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40) + (url.length > 40 ? '...' : '');
  };

  return (
    <div className="flex justify-between py-3 border-b border-[#F3F4F6] last:border-b-0">
      <span className="text-[#6B7280] text-sm">{label}</span>
      {isUrl && value ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1E4B7A] text-sm font-medium hover:underline flex items-center gap-1"
        >
          {getDisplayText(value)}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className={cn('text-sm font-medium', value ? 'text-[#111827]' : 'text-[#9CA3AF]')}>
          {value || '-'}
        </span>
      )}
    </div>
  );
}

// Numeric Table Row Component (right-aligned with monospace)
function NumericTableRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between py-3 border-b border-[#F3F4F6] last:border-b-0">
      <span className="text-[#6B7280] text-sm">{label}</span>
      <span className={cn('text-sm font-medium font-mono tabular-nums text-right', value ? 'text-[#111827]' : 'text-[#9CA3AF]')}>
        {value || '-'}
      </span>
    </div>
  );
}

// Manager Info Table Component
function ManagerInfoTable({ data }: { data: GeneralManagerInfo | null }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#111827]">Manager Information</h2>
        </div>
        <div className="p-6">
          <p className="text-center text-[#6B7280]">Select a fund manager to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-3">
        {data.logo_url && (
          <img
            src={data.logo_url}
            alt={data.name_fund}
            className="w-10 h-10 rounded-lg object-contain bg-[#F9FAFB]"
          />
        )}
        <h2 className="text-lg font-semibold text-[#111827]">Manager Information</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-0">
          <TableRow label="Name" value={data.name_fund} />
          <TableRow label="Founded" value={data.founded?.toString()} />
          <NumericTableRow label="AuM" value={data.aum ? formatCurrency(data.aum, 'B') : null} />
          <TableRow label="Location" value={data.location} />
          <TableRow label="Country" value={data.country} />
          <TableRow label="Website" value={data.website} isUrl />
          <TableRow
            label="Twitter"
            value={data.twitter_handle ? `https://twitter.com/${data.twitter_handle.replace('@', '')}` : null}
            isUrl
          />
          <TableRow label="LinkedIn" value={data.linkedin} isUrl />
        </div>
      </div>
    </div>
  );
}

// Fund Info Table Component
function FundInfoTable({ data }: { data: GeneralFundInfo | null }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB]">
        <div className="px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#111827]">Fund Information</h2>
        </div>
        <div className="p-6">
          <p className="text-center text-[#6B7280]">Select an investment to view fund details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-lg font-semibold text-[#111827]">Fund Information</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-0">
          <TableRow label="Name (Vintage)" value={data.name_fund_vintage} />
          <TableRow label="Investment Period" value={data.investment_period} />
          <TableRow label="Fund Life + Extensions" value={data.fund_life_extensions} />
          <TableRow label="Fees (Mgmt/Perf)" value={data.fees} />
          <NumericTableRow label="GP Commit" value={data.gp_commit ? formatPercentage(data.gp_commit) : null} />
          <NumericTableRow label="Fund Size" value={data.fund_size ? formatCurrency(data.fund_size, 'M') : null} />
          <NumericTableRow label="Vintage Year" value={data.vintage_year?.toString()} />

          {/* TBV Fund Commitment & Distribution rows */}
          {data.tbv_fund_flows.length > 0 ? (
            data.tbv_fund_flows.map((tbvFlow) => (
              <div key={tbvFlow.tbv_fund}>
                <NumericTableRow
                  label={`${tbvFlow.tbv_fund} Commitment (Called)`}
                  value={formatTBVCommitment(tbvFlow)}
                />
                <NumericTableRow
                  label={`${tbvFlow.tbv_fund} Capital Distributed`}
                  value={formatTBVDistributed(tbvFlow)}
                />
              </div>
            ))
          ) : (
            <>
              <NumericTableRow label="Commitment (Called)" value="-" />
              <NumericTableRow label="Capital Distributed" value="-" />
            </>
          )}

          <TableRow label="Primary Relationship Owner" value={data.fund_relationship_owner} />
          <TableRow label="Secondary Relationship Owner" value={data.secondary_relationship_owner} />
          <TableRow label="Date of Review" value={data.date_of_review} />
        </div>
      </div>
    </div>
  );
}

// Integrated Notes Section using new Notes System
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

export function GeneralPage({ fundManager, vehicleId, portfolioDate }: GeneralPageProps) {
  const dateOfReview = new Date().toISOString().split('T')[0];

  // Fetch manager info
  const { data: managerInfo, isLoading: loadingManager } = useQuery({
    queryKey: ['managerInfo', fundManager],
    queryFn: () => getGeneralManagerInfo(fundManager),
    enabled: !!fundManager,
  });

  // Fetch fund info
  const { data: fundInfo, isLoading: loadingFund } = useQuery({
    queryKey: ['fundInfo', vehicleId, dateOfReview],
    queryFn: () => getGeneralFundInfo(vehicleId, dateOfReview),
    enabled: !!vehicleId,
  });

  // Fetch notes
  const { data: notes } = useQuery({
    queryKey: ['notes', vehicleId, dateOfReview],
    queryFn: () => getGeneralNotes(vehicleId, dateOfReview),
    enabled: !!vehicleId,
  });

  // Fetch investment period range
  const { data: periodRange } = useQuery({
    queryKey: ['periodRange', vehicleId],
    queryFn: () => getInvestmentPeriodRange(vehicleId),
    enabled: !!vehicleId,
  });

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

  if (loadingManager || loadingFund) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">Loading fund data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Two-column layout for Manager and Fund Info */}
      <div className="grid grid-cols-2 gap-6">
        <ManagerInfoTable data={managerInfo || null} />
        <FundInfoTable data={fundInfo || null} />
      </div>

      {/* Vehicle Updates Section - Timeline of updates from at_processed_notes */}
      {vehicleId && (
        <VehicleFundUpdatesSection
          vehicleId={vehicleId}
          dateOfReview={dateOfReview}
          author={DEFAULT_AUTHOR}
          title="VEHICLE UPDATES"
          maxHeight="500px"
          defaultExpanded={true}
        />
      )}

      {/* Notes Section - Integrated with Notes System */}
      {vehicleId && (
        <GeneralNotesSection vehicleId={vehicleId} portfolioDate={portfolioDate} />
      )}
    </div>
  );
}
