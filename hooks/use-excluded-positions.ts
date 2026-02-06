'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getExcludedPositions,
  getExcludedPositionDetails,
  getExcludedPositionsTotals,
  type ExcludedPositionCategory,
  type ExcludedPositionDetail,
} from '@/actions/excluded-positions';

// ============================================
// Query Keys
// ============================================

export const excludedPositionsKeys = {
  all: ['excludedPositions'] as const,
  list: (vehicleId: string, portfolioDate: string, dateReportedStart?: string, dateReportedEnd?: string) =>
    [...excludedPositionsKeys.all, 'list', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd] as const,
  details: (vehicleId: string, portfolioDate: string, category: string, dateReportedStart?: string, dateReportedEnd?: string) =>
    [...excludedPositionsKeys.all, 'details', vehicleId, portfolioDate, category, dateReportedStart, dateReportedEnd] as const,
  totals: (vehicleId: string, portfolioDate: string, dateReportedStart?: string, dateReportedEnd?: string) =>
    [...excludedPositionsKeys.all, 'totals', vehicleId, portfolioDate, dateReportedStart, dateReportedEnd] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch excluded positions aggregated by category
 */
export function useExcludedPositions(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: excludedPositionsKeys.list(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    queryFn: () => getExcludedPositions(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    enabled: enabled && !!vehicleId && !!portfolioDate,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch individual position details for a specific category
 * Used for expandable rows in SOI page
 */
export function useExcludedPositionDetails(
  vehicleId: string,
  portfolioDate: string,
  category: string,
  dateReportedStart?: string,
  dateReportedEnd?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: excludedPositionsKeys.details(vehicleId, portfolioDate, category, dateReportedStart, dateReportedEnd),
    queryFn: () => getExcludedPositionDetails(vehicleId, portfolioDate, category, dateReportedStart, dateReportedEnd),
    enabled: enabled && !!vehicleId && !!portfolioDate && !!category,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch totals for excluded positions (for verification)
 */
export function useExcludedPositionsTotals(
  vehicleId: string,
  portfolioDate: string,
  dateReportedStart?: string,
  dateReportedEnd?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: excludedPositionsKeys.totals(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    queryFn: () => getExcludedPositionsTotals(vehicleId, portfolioDate, dateReportedStart, dateReportedEnd),
    enabled: enabled && !!vehicleId && !!portfolioDate,
    staleTime: 60000, // 1 minute
  });
}

// Re-export types
export type { ExcludedPositionCategory, ExcludedPositionDetail };
