'use client';

import { useVehicleRecordIds } from '@/hooks/use-vehicle-record-ids';
import { useVehicleUpdates } from '@/hooks/use-vehicle-updates';
import { VehicleUpdateCard } from './vehicle-update-card';
import {
  VehicleUpdatesFilters,
  filterUpdates,
  getDefaultFilterState,
  type VehicleUpdatesFilterState,
} from './vehicle-updates-filters';
import { FileText, Loader2, RefreshCcw, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface VehicleFundUpdatesSectionProps {
  vehicleId: string;
  dateOfReview: string;
  author: string;
  title?: string;
  maxHeight?: string;
  defaultExpanded?: boolean;
  showFilters?: boolean;
}

/**
 * Vehicle/Fund Updates Section
 * Displays a timeline of updates from at_processed_notes for the General page.
 * Matches the styling of the Vehicle Card timeline.
 */
export function VehicleFundUpdatesSection({
  vehicleId,
  dateOfReview,
  author,
  title = 'VEHICLE UPDATES',
  maxHeight = '500px',
  defaultExpanded = true,
  showFilters = true,
}: VehicleFundUpdatesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [filtersVisible, setFiltersVisible] = useState(true); // Filters expanded by default
  const [filters, setFilters] = useState<VehicleUpdatesFilterState>(() => ({
    ...getDefaultFilterState(),
    selectedEntityTypes: ['Fund'], // Default to Fund entity type
  }));

  // Fetch record IDs for the vehicle
  const { data: recordIds, isLoading: loadingRecordIds } = useVehicleRecordIds(vehicleId);

  // Fetch all vehicle updates (no limit for full page display)
  const {
    data: updates,
    isLoading: loadingUpdates,
    error,
    refetch,
  } = useVehicleUpdates(
    vehicleId,
    recordIds?.record_id_vehicle_universe,
    recordIds?.record_id_fund_universe,
    null, // No limit - show all updates
    !!vehicleId && !!recordIds
  );

  const isLoading = loadingRecordIds || loadingUpdates;
  const totalCount = updates?.length || 0;

  // Apply filters to updates
  const filteredUpdates = useMemo(() => {
    if (!updates) return [];
    return filterUpdates(updates, filters);
  }, [updates, filters]);

  const filteredCount = filteredUpdates.length;
  const hasActiveFilters = filteredCount !== totalCount;

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB]">
      {/* Header */}
      <div
        className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between cursor-pointer hover:bg-[#F9FAFB] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide">{title}</h2>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-[#1E4B7A]/10 text-[#1E4B7A] rounded-full">
              {hasActiveFilters ? `${filteredCount} / ${totalCount}` : totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Filter toggle button */}
          {showFilters && totalCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFiltersVisible(!filtersVisible);
              }}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                filtersVisible || hasActiveFilters
                  ? 'text-[#1E4B7A] bg-[#1E4B7A]/10'
                  : 'text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6]'
              )}
              title="Toggle filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
          {/* Refresh button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              refetch();
            }}
            className="p-1.5 text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6] rounded-md transition-colors"
            title="Refresh updates"
          >
            <RefreshCcw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
          {/* Expand/Collapse */}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-[#6B7280]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#6B7280]" />
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {isExpanded && showFilters && filtersVisible && updates && updates.length > 0 && (
        <VehicleUpdatesFilters
          updates={updates}
          filters={filters}
          onFiltersChange={setFilters}
        />
      )}

      {/* Content */}
      {isExpanded && (
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-[#6B7280]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading updates...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 text-sm">
              Failed to load vehicle updates
            </div>
          ) : !updates || updates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#6B7280]">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No updates available</p>
              <p className="text-xs text-[#9CA3AF] mt-1">
                Updates will appear here when documents are processed
              </p>
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#6B7280]">
              <Filter className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No updates match the current filters</p>
              <button
                onClick={() => setFilters(getDefaultFilterState())}
                className="text-xs text-[#1E4B7A] hover:underline mt-2"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="relative overflow-y-auto pr-2" style={{ maxHeight }}>
              {/* Vertical timeline line */}
              <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-[#E5E7EB]" />

              {/* Update cards */}
              <div className="space-y-4 pl-6">
                {filteredUpdates.map((update, index) => (
                  <VehicleUpdateCard
                    key={update.id}
                    update={update}
                    vehicleId={vehicleId}
                    dateOfReview={dateOfReview}
                    author={author}
                    isFirst={index === 0}
                    isLast={index === filteredUpdates.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
