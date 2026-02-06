'use client';

import { useQuery } from '@tanstack/react-query';
import { getVehicleRecordIds, type VehicleRecordIds } from '@/actions/general';

/**
 * Query key for vehicle record IDs
 */
export const vehicleRecordIdKeys = {
  all: ['vehicleRecordIds'] as const,
  vehicle: (vehicleId: string) => [...vehicleRecordIdKeys.all, vehicleId] as const,
};

/**
 * Hook to fetch record_id_vehicle_universe and record_id_fund_universe from vehicle_id
 * Used for looking up updates from at_processed_notes
 */
export function useVehicleRecordIds(vehicleId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleRecordIdKeys.vehicle(vehicleId),
    queryFn: () => getVehicleRecordIds(vehicleId),
    enabled: enabled && !!vehicleId,
    staleTime: 300000, // 5 minutes - record IDs don't change often
    gcTime: 600000, // 10 minutes
  });
}

// Re-export types
export type { VehicleRecordIds };
