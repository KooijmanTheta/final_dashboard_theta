'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getVehicleInfo,
  getVehicleCapitalSummary,
  getVehiclePerformanceMetrics,
  getTopPositions,
  getVehiclePortfolioDates,
  getVehicleTBVFunds,
  type VehicleInfo,
  type VehicleCapitalSummary,
  type VehiclePerformanceMetrics,
  type TopPosition,
} from '@/actions/vehicle-card';

// ============================================
// Query Keys
// ============================================

export const vehicleCardKeys = {
  all: ['vehicleCard'] as const,
  info: (vehicleId: string) => [...vehicleCardKeys.all, 'info', vehicleId] as const,
  capitalSummary: (vehicleId: string, tbvFund?: string) => [...vehicleCardKeys.all, 'capitalSummary', vehicleId, tbvFund] as const,
  performance: (vehicleId: string, portfolioDate: string, tbvFund?: string) => [...vehicleCardKeys.all, 'performance', vehicleId, portfolioDate, tbvFund] as const,
  topPositions: (vehicleId: string, portfolioDate: string) => [...vehicleCardKeys.all, 'topPositions', vehicleId, portfolioDate] as const,
  portfolioDates: (vehicleId: string) => [...vehicleCardKeys.all, 'portfolioDates', vehicleId] as const,
  tbvFunds: (vehicleId: string) => [...vehicleCardKeys.all, 'tbvFunds', vehicleId] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch vehicle info
 */
export function useVehicleInfo(vehicleId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleCardKeys.info(vehicleId),
    queryFn: () => getVehicleInfo(vehicleId),
    enabled: enabled && !!vehicleId,
    staleTime: 60000,
  });
}

/**
 * Fetch vehicle capital summary (commitment, called, distributed)
 */
export function useVehicleCapitalSummary(vehicleId: string, tbvFund?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleCardKeys.capitalSummary(vehicleId, tbvFund),
    queryFn: () => getVehicleCapitalSummary(vehicleId, tbvFund),
    enabled: enabled && !!vehicleId,
    staleTime: 60000,
  });
}

/**
 * Fetch vehicle performance metrics (NAV, TVPI, DPI, etc.)
 */
export function useVehiclePerformance(
  vehicleId: string,
  portfolioDate: string,
  tbvFund?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: vehicleCardKeys.performance(vehicleId, portfolioDate, tbvFund),
    queryFn: () => getVehiclePerformanceMetrics(vehicleId, portfolioDate, tbvFund),
    enabled: enabled && !!vehicleId && !!portfolioDate,
    staleTime: 60000,
  });
}

/**
 * Fetch top positions by market value
 */
export function useTopPositions(vehicleId: string, portfolioDate: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleCardKeys.topPositions(vehicleId, portfolioDate),
    queryFn: () => getTopPositions(vehicleId, portfolioDate),
    enabled: enabled && !!vehicleId && !!portfolioDate,
    staleTime: 60000,
  });
}

/**
 * Fetch available portfolio dates for a vehicle
 */
export function useVehiclePortfolioDates(vehicleId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleCardKeys.portfolioDates(vehicleId),
    queryFn: () => getVehiclePortfolioDates(vehicleId),
    enabled: enabled && !!vehicleId,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Fetch TBV funds associated with a vehicle
 */
export function useVehicleTBVFunds(vehicleId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: vehicleCardKeys.tbvFunds(vehicleId),
    queryFn: () => getVehicleTBVFunds(vehicleId),
    enabled: enabled && !!vehicleId,
    staleTime: 300000, // 5 minutes
  });
}

// Re-export types
export type { VehicleInfo, VehicleCapitalSummary, VehiclePerformanceMetrics, TopPosition };
