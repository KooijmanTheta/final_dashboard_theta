'use client';

import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import type { Tab } from '@/lib/types';

export const filterParsers = {
  fundManager: parseAsString.withDefault(''),
  investmentName: parseAsString.withDefault(''),
  vehicleId: parseAsString.withDefault(''),
  portfolioDate: parseAsString.withDefault(''),
  dateReportedStart: parseAsString.withDefault(''),
  dateReportedEnd: parseAsString.withDefault(''),
  tab: parseAsStringLiteral(['general', 'overview', 'historical', 'portfolio', 'soi', 'team', 'data-quality', 'bas'] as const).withDefault('general' as Tab),
};

export function useFilterState() {
  return useQueryStates(filterParsers);
}

export type FilterStateType = ReturnType<typeof useFilterState>[0];
export type SetFilterStateType = ReturnType<typeof useFilterState>[1];
