'use client';

import { useVehicleUpdates } from '@/hooks/use-vehicle-updates';
import { VehicleUpdateCard } from './vehicle-update-card';
import { FileText, Loader2 } from 'lucide-react';

interface VehicleUpdatesTimelineProps {
  vehicleId: string;
  recordIdVehicleUniverse?: string | null;
  recordIdFundUniverse?: string | null;
  dateOfReview: string;
  author: string;
}

export function VehicleUpdatesTimeline({
  vehicleId,
  recordIdVehicleUniverse,
  recordIdFundUniverse,
  dateOfReview,
  author,
}: VehicleUpdatesTimelineProps) {
  const { data: updates, isLoading, error } = useVehicleUpdates(
    vehicleId,
    recordIdVehicleUniverse,
    recordIdFundUniverse
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-[#6B7280]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading updates...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500 text-sm">
        Failed to load vehicle updates
      </div>
    );
  }

  if (!updates || updates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[#6B7280]">
        <FileText className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No vehicle updates available</p>
      </div>
    );
  }

  return (
    <div className="relative max-h-[400px] overflow-y-auto pr-2">
      {/* Vertical timeline line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-[#E5E7EB]" />

      {/* Update cards */}
      <div className="space-y-4 pl-6">
        {updates.map((update, index) => (
          <VehicleUpdateCard
            key={update.id}
            update={update}
            vehicleId={vehicleId}
            dateOfReview={dateOfReview}
            author={author}
            isFirst={index === 0}
            isLast={index === updates.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
