'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamFiltersProps {
  // Year range for departures/additions
  yearStart: number;
  yearEnd: number;
  onYearRangeChange: (start: number, end: number) => void;

  // Hierarchy levels (1-5)
  selectedLevels: number[];
  onLevelsChange: (levels: number[]) => void;
}

const HIERARCHY_LEVELS = [
  { value: 1, label: 'L1', description: 'Senior Leadership' },
  { value: 2, label: 'L2', description: 'Partners / Directors' },
  { value: 3, label: 'L3', description: 'Principals / VPs' },
  { value: 4, label: 'L4', description: 'Associates / Analysts' },
  { value: 5, label: 'L5', description: 'Support / Other' },
];

// Generate year options (from 2010 to current year + 1)
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2010 + 2 }, (_, i) => 2010 + i);

export function TeamFilters({
  yearStart,
  yearEnd,
  onYearRangeChange,
  selectedLevels,
  onLevelsChange,
}: TeamFiltersProps) {
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false);
  const levelDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(event.target as Node)) {
        setLevelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleYearStartChange = (year: number) => {
    onYearRangeChange(year, Math.max(year, yearEnd));
  };

  const handleYearEndChange = (year: number) => {
    onYearRangeChange(Math.min(yearStart, year), year);
  };

  const toggleLevel = (level: number) => {
    if (selectedLevels.includes(level)) {
      onLevelsChange(selectedLevels.filter((l) => l !== level));
    } else {
      onLevelsChange([...selectedLevels, level].sort());
    }
  };

  const selectAllLevels = () => {
    onLevelsChange([1, 2, 3, 4, 5]);
  };

  const clearAllLevels = () => {
    onLevelsChange([]);
  };

  const getLevelButtonText = () => {
    if (selectedLevels.length === 0) return 'All Levels';
    if (selectedLevels.length === 5) return 'All Levels';
    return selectedLevels.map((l) => `L${l}`).join(', ');
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-4 w-4 text-[#6B7280]" />
        <span className="text-sm font-medium text-[#111827]">Team Filters</span>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        {/* Year Range Filter */}
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              Year From
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
              <select
                value={yearStart}
                onChange={(e) => handleYearStartChange(parseInt(e.target.value))}
                className={cn(
                  'pl-9 pr-8 py-2 text-sm border border-[#E5E7EB] rounded-lg',
                  'bg-white text-[#111827] appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[120px]'
                )}
              >
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>

          <span className="text-sm text-[#6B7280] pb-2">to</span>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              Year To
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
              <select
                value={yearEnd}
                onChange={(e) => handleYearEndChange(parseInt(e.target.value))}
                className={cn(
                  'pl-9 pr-8 py-2 text-sm border border-[#E5E7EB] rounded-lg',
                  'bg-white text-[#111827] appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                  'min-w-[120px]'
                )}
              >
                {YEAR_OPTIONS.filter((year) => year >= yearStart).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Hierarchy Level Filter */}
        <div className="space-y-1.5" ref={levelDropdownRef}>
          <label className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
            Hierarchy Level
          </label>
          <div className="relative">
            <button
              onClick={() => setLevelDropdownOpen(!levelDropdownOpen)}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2 text-sm',
                'border border-[#E5E7EB] rounded-lg bg-white',
                'hover:bg-[#F9FAFB] transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]/20 focus:border-[#1E4B7A]',
                'min-w-[160px]'
              )}
            >
              <span className="text-[#111827]">{getLevelButtonText()}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[#9CA3AF] transition-transform',
                  levelDropdownOpen && 'rotate-180'
                )}
              />
            </button>

            {levelDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50">
                {/* Select/Clear All */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E7EB]">
                  <button
                    onClick={selectAllLevels}
                    className="text-xs text-[#1E4B7A] hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearAllLevels}
                    className="text-xs text-[#6B7280] hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                {/* Level Options */}
                <div className="py-1">
                  {HIERARCHY_LEVELS.map((level) => {
                    const isSelected = selectedLevels.includes(level.value);
                    return (
                      <button
                        key={level.value}
                        onClick={() => toggleLevel(level.value)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 text-left',
                          'hover:bg-[#F9FAFB] transition-colors'
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center',
                            isSelected
                              ? 'bg-[#1E4B7A] border-[#1E4B7A]'
                              : 'border-[#D1D5DB] bg-white'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full',
                            level.value === 1 && 'bg-purple-100 text-purple-700',
                            level.value === 2 && 'bg-blue-100 text-blue-700',
                            level.value === 3 && 'bg-green-100 text-green-700',
                            level.value === 4 && 'bg-orange-100 text-orange-700',
                            level.value === 5 && 'bg-gray-100 text-gray-700'
                          )}
                        >
                          {level.label}
                        </span>
                        <span className="text-sm text-[#6B7280]">{level.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Filters Summary */}
        {(yearStart !== currentYear - 2 || yearEnd !== currentYear || selectedLevels.length > 0 && selectedLevels.length < 5) && (
          <div className="flex items-center gap-2 text-xs text-[#6B7280]">
            <span>Active filters:</span>
            {yearStart !== currentYear - 2 || yearEnd !== currentYear ? (
              <span className="px-2 py-0.5 bg-[#F3F4F6] rounded">
                {yearStart} - {yearEnd}
              </span>
            ) : null}
            {selectedLevels.length > 0 && selectedLevels.length < 5 && (
              <span className="px-2 py-0.5 bg-[#F3F4F6] rounded">
                {selectedLevels.map((l) => `L${l}`).join(', ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
