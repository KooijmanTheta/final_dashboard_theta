'use client';

import { useQuery } from '@tanstack/react-query';
import { getVehicleUpdates, getVehicleUpdate, countVehicleUpdates, VehicleUpdate } from '@/actions/vehicle-updates';

// ============================================
// Query Keys
// ============================================

export const vehicleUpdateKeys = {
  all: ['vehicleUpdates'] as const,
  vehicle: (vehicleId: string, recordIdVehicle?: string | null, recordIdFund?: string | null) =>
    [...vehicleUpdateKeys.all, 'vehicle', vehicleId, recordIdVehicle, recordIdFund] as const,
  single: (updateId: string) => [...vehicleUpdateKeys.all, 'single', updateId] as const,
  count: (vehicleId: string, recordIdVehicle?: string | null, recordIdFund?: string | null) =>
    [...vehicleUpdateKeys.all, 'count', vehicleId, recordIdVehicle, recordIdFund] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch all vehicle updates for a vehicle
 * @param vehicleId - The vehicle ID (human-readable name)
 * @param recordIdVehicleUniverse - Optional Airtable record ID for vehicle
 * @param recordIdFundUniverse - Optional Airtable record ID for fund
 * @param limit - Number of updates to fetch (default 10). Pass null for unlimited.
 * @param enabled - Whether the query should run
 */
export function useVehicleUpdates(
  vehicleId: string,
  recordIdVehicleUniverse?: string | null,
  recordIdFundUniverse?: string | null,
  limit?: number | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: vehicleUpdateKeys.vehicle(vehicleId, recordIdVehicleUniverse, recordIdFundUniverse),
    queryFn: () => getVehicleUpdates(vehicleId, recordIdVehicleUniverse, recordIdFundUniverse, limit),
    enabled: enabled && !!vehicleId,
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
  });
}

/**
 * Fetch a single vehicle update by ID
 */
export function useVehicleUpdate(updateId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleUpdateKeys.single(updateId),
    queryFn: () => getVehicleUpdate(updateId),
    enabled: enabled && !!updateId,
    staleTime: 60000,
    gcTime: 300000,
  });
}

/**
 * Count vehicle updates for a vehicle
 */
export function useVehicleUpdatesCount(
  vehicleId: string,
  recordIdVehicleUniverse?: string | null,
  recordIdFundUniverse?: string | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: vehicleUpdateKeys.count(vehicleId, recordIdVehicleUniverse, recordIdFundUniverse),
    queryFn: () => countVehicleUpdates(vehicleId, recordIdVehicleUniverse, recordIdFundUniverse),
    enabled: enabled && !!vehicleId,
    staleTime: 60000,
    gcTime: 300000,
  });
}

// Re-export types
export type { VehicleUpdate };
