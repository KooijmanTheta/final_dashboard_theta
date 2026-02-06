'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, Check, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VehicleUpdate } from '@/actions/vehicle-updates';

export interface VehicleUpdatesFilterState {
  yearStart: number;
  yearEnd: number;
  selectedSourceTypes: string[];
  selectedEntityTypes: string[];
  selectedTags: string[];
}

interface VehicleUpdatesFiltersProps {
  updates: VehicleUpdate[];
  filters: VehicleUpdatesFilterState;
  onFiltersChange: (filters: VehicleUpdatesFilterState) => void;
}

// Generate year options (from 2015 to current year + 1)
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2015 + 2 }, (_, i) => 2015 + i);

// Source document type color mapping
const SOURCE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'LP Update': { bg: 'bg-green-100', text: 'text-green-700' },
  'IR Call': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Meeting Notes': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'Meeting Transcripts': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'Email': { bg: 'bg-gray-100', text: 'text-gray-700' },
  'DDQ': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Portfolio Update': { bg: 'bg-violet-100', text: 'text-violet-700' },
  'Manager Call': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'Fund Operations': { bg: 'bg-teal-100', text: 'text-teal-700' },
  'Fund Strategy': { bg: 'bg-orange-100', text: 'text-orange-700' },
};

function getSourceTypeColors(type: string): { bg: string; text: string } {
  return SOURCE_TYPE_COLORS[type] || { bg: 'bg-gray-100', text: 'text-gray-700' };
}

export function VehicleUpdatesFilters({
  updates,
  filters,
  onFiltersChange,
}: VehicleUpdatesFiltersProps) {
  const [sourceTypeDropdownOpen, setSourceTypeDropdownOpen] = useState(false);
  const [entityTypeDropdownOpen, setEntityTypeDropdownOpen] = useState(false);
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false);

  const sourceTypeRef = useRef<HTMLDivElement>(null);
  const entityTypeRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);

  // Extract unique values from updates for filter options
  const { sourceTypes, entityTypes, allTags } = useMemo(() => {
    const sourceTypesSet = new Set<string>();
    const entityTypesSet = new Set<string>();
    const tagsSet = new Set<string>();

    updates.forEach((update) => {
      if (update.source_document_type) sourceTypesSet.add(update.source_document_type);
      if (update.entity_type) entityTypesSet.add(update.entity_type);
      if (update.note_tags) {
        update.note_tags.forEach((tag) => tagsSet.add(tag));
      }
    });

    return {
      sourceTypes: Array.from(sourceTypesSet).sort(),
      entityTypes: Array.from(entityTypesSet).sort(),
      allTags: Array.from(tagsSet).sort(),
    };
  }, [updates]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceTypeRef.current && !sourceTypeRef.current.contains(event.target as Node)) {
        setSourceTypeDropdownOpen(false);
      }
      if (entityTypeRef.current && !entityTypeRef.current.contains(event.target as Node)) {
        setEntityTypeDropdownOpen(false);
      }
      if (tagsRef.current && !tagsRef.current.contains(event.target as Node)) {
        setTagsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleYearStartChange = (year: number) => {
    onFiltersChange({
      ...filters,
      yearStart: year,
      yearEnd: Math.max(year, filters.yearEnd),
    });
  };

  const handleYearEndChange = (year: number) => {
    onFiltersChange({
      ...filters,
      yearStart: Math.min(filters.yearStart, year),
      yearEnd: year,
    });
  };

  const toggleSourceType = (type: string) => {
    const newSelected = filters.selectedSourceTypes.includes(type)
      ? filters.selectedSourceTypes.filter((t) => t !== type)
      : [...filters.selectedSourceTypes, type];
    onFiltersChange({ ...filters, selectedSourceTypes: newSelected });
  };

  const toggleEntityType = (type: string) => {
    const newSelected = filters.selectedEntityTypes.includes(type)
      ? filters.selectedEntityTypes.filter((t) => t !== type)
      : [...filters.selectedEntityTypes, type];
    onFiltersChange({ ...filters, selectedEntityTypes: newSelected });
  };

  const toggleTag = (tag: string) => {
    const newSelected = filters.selectedTags.includes(tag)
      ? filters.selectedTags.filter((t) => t !== tag)
      : [...filters.selectedTags, tag];
    onFiltersChange({ ...filters, selectedTags: newSelected });
  };

  const clearAllFilters = () => {
    onFiltersChange(getDefaultFilterState());
  };

  const getSourceTypeButtonText = () => {
    if (filters.selectedSourceTypes.length === 0) return 'All Types';
    if (filters.selectedSourceTypes.length === sourceTypes.length) return 'All Types';
    if (filters.selectedSourceTypes.length === 1) return filters.selectedSourceTypes[0];
    return `${filters.selectedSourceTypes.length} selected`;
  };

  const getEntityTypeButtonText = () => {
    if (filters.selectedEntityTypes.length === 0) return 'All Entities';
    if (filters.selectedEntityTypes.length === entityTypes.length) return 'All Entities';
    if (filters.selectedEntityTypes.length === 1) return filters.selectedEntityTypes[0];
    return `${filters.selectedEntityTypes.length} selected`;
  };

  const getTagsButtonText = () => {
    if (filters.selectedTags.length === 0) return 'All Tags';
    if (filters.selectedTags.length === allTags.length) return 'All Tags';
    if (filters.selectedTags.length === 1) return filters.selectedTags[0];
    return `${filters.selectedTags.length} selected`;
  };

  const hasActiveFilters =
    filters.yearStart !== 2015 ||
    filters.yearEnd !== currentYear ||
    filters.selectedSourceTypes.length > 0 ||
    filters.selectedEntityTypes.length > 0 ||
    filters.selectedTags.length > 0;

  return (
    <div className="border-b border-[#E5E7EB] px-6 py-3 bg-[#F9FAFB]">
      <div className="flex flex-wrap items-end gap-4">
        {/* Date Range Filter */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              From
            </label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
              <select
                value={filters.yearStart}
                onChange={(e) => handleYearStartChange(parseInt(e.target.value))}
                className={cn(
                  'pl-8 pr-6 py-1.5 text-xs border border-[#E5E7EB] rounded-md',
                  'bg-white text-[#111827] appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[90px]'
                )}
              >
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>

          <span className="text-xs text-[#6B7280] pb-1.5">-</span>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              To
            </label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
              <select
                value={filters.yearEnd}
                onChange={(e) => handleYearEndChange(parseInt(e.target.value))}
                className={cn(
                  'pl-8 pr-6 py-1.5 text-xs border border-[#E5E7EB] rounded-md',
                  'bg-white text-[#111827] appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[90px]'
                )}
              >
                {YEAR_OPTIONS.filter((year) => year >= filters.yearStart).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Source Document Type Filter */}
        {sourceTypes.length > 0 && (
          <div className="space-y-1" ref={sourceTypeRef}>
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              Source Type
            </label>
            <div className="relative">
              <button
                onClick={() => setSourceTypeDropdownOpen(!sourceTypeDropdownOpen)}
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-1.5 text-xs',
                  'border border-[#E5E7EB] rounded-md bg-white',
                  'hover:bg-[#F9FAFB] transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[140px]'
                )}
              >
                <span className="text-[#111827] truncate">{getSourceTypeButtonText()}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-[#9CA3AF] transition-transform flex-shrink-0',
                    sourceTypeDropdownOpen && 'rotate-180'
                  )}
                />
              </button>

              {sourceTypeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB]">
                    <button
                      onClick={() => onFiltersChange({ ...filters, selectedSourceTypes: [...sourceTypes] })}
                      className="text-xs text-[#1E4B7A] hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => onFiltersChange({ ...filters, selectedSourceTypes: [] })}
                      className="text-xs text-[#6B7280] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="py-1">
                    {sourceTypes.map((type) => {
                      const isSelected = filters.selectedSourceTypes.includes(type);
                      const colors = getSourceTypeColors(type);
                      return (
                        <button
                          key={type}
                          onClick={() => toggleSourceType(type)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F9FAFB]"
                        >
                          <div
                            className={cn(
                              'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                              isSelected ? 'bg-[#1E4B7A] border-[#1E4B7A]' : 'border-[#D1D5DB] bg-white'
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className={cn('px-1.5 py-0.5 text-xs rounded', colors.bg, colors.text)}>
                            {type}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Entity Type Filter */}
        {entityTypes.length > 0 && (
          <div className="space-y-1" ref={entityTypeRef}>
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              Entity Type
            </label>
            <div className="relative">
              <button
                onClick={() => setEntityTypeDropdownOpen(!entityTypeDropdownOpen)}
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-1.5 text-xs',
                  'border border-[#E5E7EB] rounded-md bg-white',
                  'hover:bg-[#F9FAFB] transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[120px]'
                )}
              >
                <span className="text-[#111827] truncate">{getEntityTypeButtonText()}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-[#9CA3AF] transition-transform flex-shrink-0',
                    entityTypeDropdownOpen && 'rotate-180'
                  )}
                />
              </button>

              {entityTypeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB]">
                    <button
                      onClick={() => onFiltersChange({ ...filters, selectedEntityTypes: [...entityTypes] })}
                      className="text-xs text-[#1E4B7A] hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => onFiltersChange({ ...filters, selectedEntityTypes: [] })}
                      className="text-xs text-[#6B7280] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="py-1">
                    {entityTypes.map((type) => {
                      const isSelected = filters.selectedEntityTypes.includes(type);
                      return (
                        <button
                          key={type}
                          onClick={() => toggleEntityType(type)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F9FAFB]"
                        >
                          <div
                            className={cn(
                              'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                              isSelected ? 'bg-[#1E4B7A] border-[#1E4B7A]' : 'border-[#D1D5DB] bg-white'
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-xs text-[#374151]">{type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tags Filter */}
        {allTags.length > 0 && (
          <div className="space-y-1" ref={tagsRef}>
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              Tags
            </label>
            <div className="relative">
              <button
                onClick={() => setTagsDropdownOpen(!tagsDropdownOpen)}
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-1.5 text-xs',
                  'border border-[#E5E7EB] rounded-md bg-white',
                  'hover:bg-[#F9FAFB] transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[120px]'
                )}
              >
                <span className="text-[#111827] truncate">{getTagsButtonText()}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-[#9CA3AF] transition-transform flex-shrink-0',
                    tagsDropdownOpen && 'rotate-180'
                  )}
                />
              </button>

              {tagsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB]">
                    <button
                      onClick={() => onFiltersChange({ ...filters, selectedTags: [...allTags] })}
                      className="text-xs text-[#1E4B7A] hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => onFiltersChange({ ...filters, selectedTags: [] })}
                      className="text-xs text-[#6B7280] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="py-1">
                    {allTags.map((tag) => {
                      const isSelected = filters.selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F9FAFB]"
                        >
                          <div
                            className={cn(
                              'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                              isSelected ? 'bg-[#1E4B7A] border-[#1E4B7A]' : 'border-[#D1D5DB] bg-white'
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-xs text-[#374151] truncate">{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-[#6B7280] hover:text-[#1E4B7A] transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Apply filters to updates array
 */
export function filterUpdates(
  updates: VehicleUpdate[],
  filters: VehicleUpdatesFilterState
): VehicleUpdate[] {
  return updates.filter((update) => {
    // Date range filter
    if (update.source_document_date) {
      const year = parseInt(update.source_document_date.substring(0, 4));
      if (year < filters.yearStart || year > filters.yearEnd) {
        return false;
      }
    }

    // Source document type filter
    if (filters.selectedSourceTypes.length > 0) {
      if (!update.source_document_type || !filters.selectedSourceTypes.includes(update.source_document_type)) {
        return false;
      }
    }

    // Entity type filter
    if (filters.selectedEntityTypes.length > 0) {
      if (!update.entity_type || !filters.selectedEntityTypes.includes(update.entity_type)) {
        return false;
      }
    }

    // Tags filter (match any selected tag)
    if (filters.selectedTags.length > 0) {
      if (!update.note_tags || !update.note_tags.some((tag) => filters.selectedTags.includes(tag))) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get default filter state
 */
export function getDefaultFilterState(): VehicleUpdatesFilterState {
  return {
    yearStart: 2015,
    yearEnd: currentYear,
    selectedSourceTypes: [],
    selectedEntityTypes: ['Fund'], // Default to Fund entity type
    selectedTags: [],
  };
}
