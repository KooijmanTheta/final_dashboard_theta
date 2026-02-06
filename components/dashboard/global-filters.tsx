'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Search, ChevronDown, Check, Info } from 'lucide-react';
import { useFilterState } from '@/hooks/use-url-state';
import {
  getFundManagers,
  getInvestmentNames,
  getPortfolioDates,
  getLatestPortfolioDate,
  getDateReportedDates,
  getDateReportedEndDates,
  getEarliestDateReported,
  getLatestDateReported,
} from '@/actions/filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface GlobalFiltersProps {
  onVehicleClick?: (vehicleId: string) => void;
}

export function GlobalFilters({ onVehicleClick }: GlobalFiltersProps = {}) {
  const [filters, setFilters] = useFilterState();
  const [fundManagerSearch, setFundManagerSearch] = useState('');
  const [fundManagerOpen, setFundManagerOpen] = useState(false);
  const fundManagerRef = useRef<HTMLDivElement>(null);

  // Fetch fund managers
  const { data: fundManagers = [], isLoading: loadingManagers } = useQuery({
    queryKey: ['fundManagers'],
    queryFn: getFundManagers,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fundManagerRef.current && !fundManagerRef.current.contains(event.target as Node)) {
        setFundManagerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync search text with selected fund manager
  useEffect(() => {
    if (filters.fundManager && fundManagers.length > 0) {
      const selected = fundManagers.find((fm) => fm.fund_manager_id === filters.fundManager);
      if (selected) {
        setFundManagerSearch(selected.fund_manager_name);
      }
    } else if (!filters.fundManager) {
      setFundManagerSearch('');
    }
  }, [filters.fundManager, fundManagers]);

  // Fetch investment names (filtered by fund manager)
  const { data: investmentNames = [], isLoading: loadingInvestments } = useQuery({
    queryKey: ['investmentNames', filters.fundManager],
    queryFn: () => getInvestmentNames(filters.fundManager || undefined),
    enabled: true,
  });

  // Fetch portfolio dates (filtered by vehicle) - for market value data
  const { data: portfolioDates = [], isLoading: loadingDates } = useQuery({
    queryKey: ['portfolioDates', filters.vehicleId],
    queryFn: () => getPortfolioDates(filters.vehicleId),
    enabled: !!filters.vehicleId,
  });

  // Fetch date reported start dates (all available dates, sorted ascending)
  const { data: dateReportedStartDates = [], isLoading: loadingStartDates } = useQuery({
    queryKey: ['dateReportedStartDates', filters.vehicleId],
    queryFn: () => getDateReportedDates(filters.vehicleId),
    enabled: !!filters.vehicleId,
  });

  // Fetch date reported end dates (filtered by portfolio date, sorted descending)
  const { data: dateReportedEndDates = [], isLoading: loadingEndDates } = useQuery({
    queryKey: ['dateReportedEndDates', filters.vehicleId, filters.portfolioDate],
    queryFn: () => getDateReportedEndDates(filters.vehicleId, filters.portfolioDate),
    enabled: !!filters.vehicleId && !!filters.portfolioDate,
  });

  // Auto-select latest portfolio date when vehicle changes
  useEffect(() => {
    if (filters.vehicleId && !filters.portfolioDate) {
      getLatestPortfolioDate(filters.vehicleId).then((date) => {
        if (date) {
          setFilters({ portfolioDate: date });
        }
      });
    }
  }, [filters.vehicleId, filters.portfolioDate, setFilters]);

  // Auto-select investment period dates when vehicle and portfolio date are set
  useEffect(() => {
    if (filters.vehicleId && filters.portfolioDate) {
      // Set start date to earliest date reported
      if (!filters.dateReportedStart) {
        getEarliestDateReported(filters.vehicleId).then((date) => {
          if (date) {
            setFilters({ dateReportedStart: date });
          }
        });
      }
      // Set end date to latest date reported on or before portfolio date
      if (!filters.dateReportedEnd) {
        getLatestDateReported(filters.vehicleId, filters.portfolioDate).then((date) => {
          if (date) {
            setFilters({ dateReportedEnd: date });
          }
        });
      }
    }
  }, [filters.vehicleId, filters.portfolioDate, filters.dateReportedStart, filters.dateReportedEnd, setFilters]);

  // Handle fund manager change - clear downstream filters
  const handleFundManagerChange = (value: string) => {
    setFilters({
      fundManager: value,
      investmentName: '',
      vehicleId: '',
      portfolioDate: '',
      dateReportedStart: '',
      dateReportedEnd: '',
    });
  };

  // Handle investment name change - set vehicle ID and clear dates
  const handleInvestmentChange = (value: string) => {
    const investment = investmentNames.find((i) => i.investment_name_id === value);
    setFilters({
      investmentName: value,
      vehicleId: investment?.vehicle_id || '',
      portfolioDate: '',
      dateReportedStart: '',
      dateReportedEnd: '',
    });
  };

  // Handle portfolio date change (market value filter) - also reset end date
  const handlePortfolioDateChange = (value: string) => {
    setFilters({ portfolioDate: value, dateReportedEnd: '' });
  };

  // Handle investment period start date change
  const handleDateReportedStartChange = (value: string) => {
    setFilters({ dateReportedStart: value });
  };

  // Handle investment period end date change
  const handleDateReportedEndChange = (value: string) => {
    setFilters({ dateReportedEnd: value });
  };

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-6 py-4">
      <div className="flex items-end gap-4 flex-wrap">
        {/* Fund Manager - Searchable Dropdown */}
        <div className="flex flex-col gap-1.5 min-w-[200px]" ref={fundManagerRef}>
          <Label className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
            Fund Manager
          </Label>
          <div className="relative">
            <div
              className="flex h-9 w-full items-center rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            >
              <Search className="h-4 w-4 text-[#6B7280] ml-3 shrink-0" />
              <input
                type="text"
                className="flex-1 h-full px-2 bg-transparent outline-none placeholder:text-muted-foreground"
                placeholder={loadingManagers ? 'Loading...' : 'Search fund manager...'}
                value={fundManagerSearch}
                onChange={(e) => {
                  setFundManagerSearch(e.target.value);
                  setFundManagerOpen(true);
                }}
                onFocus={() => setFundManagerOpen(true)}
              />
              <button
                type="button"
                className="h-full px-2 hover:bg-accent rounded-r-md"
                onClick={() => setFundManagerOpen(!fundManagerOpen)}
              >
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
            </div>
            {fundManagerOpen && (
              <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
                {fundManagers
                  .filter((fm) =>
                    fm.fund_manager_name.toLowerCase().includes(fundManagerSearch.toLowerCase())
                  )
                  .map((fm) => (
                    <div
                      key={fm.fund_manager_id}
                      className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        handleFundManagerChange(fm.fund_manager_id);
                        setFundManagerSearch(fm.fund_manager_name);
                        setFundManagerOpen(false);
                      }}
                    >
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                        {filters.fundManager === fm.fund_manager_id && (
                          <Check className="h-4 w-4" />
                        )}
                      </span>
                      {fm.fund_manager_name}
                    </div>
                  ))}
                {fundManagers.filter((fm) =>
                  fm.fund_manager_name.toLowerCase().includes(fundManagerSearch.toLowerCase())
                ).length === 0 && (
                  <div className="py-2 px-3 text-sm text-muted-foreground">
                    No fund managers found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Investment Name */}
        <div className="flex flex-col gap-1.5 min-w-[240px]">
          <Label className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
            Investment Name
          </Label>
          <div className="flex items-center gap-2">
            <Select
              value={filters.investmentName}
              onValueChange={handleInvestmentChange}
            >
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder={loadingInvestments ? 'Loading...' : 'Select investment'} />
              </SelectTrigger>
              <SelectContent>
                {investmentNames
                  .filter((inv, i, arr) => arr.findIndex((x) => x.investment_name_id === inv.investment_name_id) === i)
                  .map((inv) => (
                  <SelectItem key={inv.investment_name_id} value={inv.investment_name_id}>
                    {inv.investment_name} {inv.vintage ? `(${inv.vintage})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filters.vehicleId && onVehicleClick && (
              <button
                type="button"
                onClick={() => onVehicleClick(filters.vehicleId)}
                className="h-9 w-9 flex items-center justify-center rounded-md border border-[#E5E7EB] hover:bg-[#F3F4F6] transition-colors"
                title="View vehicle details"
              >
                <Info className="h-4 w-4 text-[#1E4B7A]" />
              </button>
            )}
          </div>
        </div>

        {/* Portfolio Date (Market Value) */}
        <div className="flex flex-col gap-1.5 min-w-[130px]">
          <Label className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
            Portfolio Date
          </Label>
          <Select
            value={filters.portfolioDate}
            onValueChange={handlePortfolioDateChange}
            disabled={!filters.vehicleId}
          >
            <SelectTrigger className="h-9">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#6B7280]" />
                <SelectValue placeholder={loadingDates ? '...' : 'Select'} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {portfolioDates.map((pd) => (
                <SelectItem key={pd.date} value={pd.date}>
                  {pd.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Investment Period Start Date */}
        <div className="flex flex-col gap-1.5 min-w-[130px]">
          <Label className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
            Period Start
          </Label>
          <Select
            value={filters.dateReportedStart}
            onValueChange={handleDateReportedStartChange}
            disabled={!filters.vehicleId}
          >
            <SelectTrigger className="h-9">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#6B7280]" />
                <SelectValue placeholder={loadingStartDates ? '...' : 'Select'} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {dateReportedStartDates.map((dr) => (
                <SelectItem key={dr.date} value={dr.date}>
                  {dr.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Investment Period End Date */}
        <div className="flex flex-col gap-1.5 min-w-[130px]">
          <Label className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
            Period End
          </Label>
          <Select
            value={filters.dateReportedEnd}
            onValueChange={handleDateReportedEndChange}
            disabled={!filters.vehicleId || !filters.portfolioDate}
          >
            <SelectTrigger className="h-9">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#6B7280]" />
                <SelectValue placeholder={loadingEndDates ? '...' : 'Select'} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {dateReportedEndDates.map((dr) => (
                <SelectItem key={dr.date} value={dr.date}>
                  {dr.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date of Review */}
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <Label className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
            Date of Review
          </Label>
          <div className="flex items-center h-9 px-3 border border-[#E5E7EB] rounded-md bg-[#F9FAFB]">
            <Calendar className="h-4 w-4 text-[#6B7280] mr-2" />
            <span className="text-sm text-[#374151]">
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
