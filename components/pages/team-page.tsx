'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTeamDepartures,
  getTeamAdditions,
  getTeamMetrics,
  getLeadershipTeam,
  getInvestmentTeam,
  getOperationsTeam,
  getFundIdFromVehicle,
  addTeamChange,
  removeTeamChange,
  recordRoleChange,
  type KeyPerson,
  type TeamChange,
} from '@/actions/team';
import { TeamMetricsCards } from '@/components/team/team-metrics-cards';
import { TeamChangesSection } from '@/components/team/team-changes-section';
import { TeamMemberTable } from '@/components/team/team-member-table';
import { AnalystAssessmentSection } from '@/components/team/analyst-assessment-section';
import { FundProfileCard } from '@/components/team/fund-profile-card';
import { Linkedin, RefreshCw, ChevronDown, Check, X, Loader2 } from 'lucide-react';

interface TeamPageProps {
  fundManager: string;
  vehicleId: string;
  portfolioDate: string;
  onPersonClick: (peopleId: string) => void;
}

export function TeamPage({
  fundManager,
  vehicleId,
  portfolioDate,
  onPersonClick,
}: TeamPageProps) {
  // Get current year for default filter values
  const currentYear = new Date().getFullYear();

  // Year range state for team changes
  const [yearStart, setYearStart] = useState(currentYear - 2);
  const [yearEnd, setYearEnd] = useState(currentYear);

  // Scraping state
  const [scrapingMembers, setScrapingMembers] = useState<Set<string>>(new Set());
  const [scrapingFund, setScrapingFund] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ done: number; total: number; message: string } | null>(null);
  const [syncingAirtable, setSyncingAirtable] = useState(false);
  const [showScrapeDropdown, setShowScrapeDropdown] = useState(false);
  const queryClient = useQueryClient();

  // Get today's date for date of review
  const dateOfReview = new Date().toISOString().split('T')[0];

  // Get fund_id from vehicle_id
  const { data: fundId } = useQuery({
    queryKey: ['fundIdFromVehicle', vehicleId],
    queryFn: () => getFundIdFromVehicle(vehicleId),
    enabled: !!vehicleId,
  });

  // Use fundManager as fallback if fundId not found from vehicle
  const effectiveFundId = fundId || fundManager;

  // Fetch team metrics with filter years
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['teamMetrics', effectiveFundId, yearStart, yearEnd],
    queryFn: () => getTeamMetrics(effectiveFundId, yearStart, yearEnd),
    enabled: !!effectiveFundId,
  });

  // Fetch departures with filter years
  const { data: departuresRaw, isLoading: loadingDepartures } = useQuery({
    queryKey: ['teamDepartures', effectiveFundId, yearStart, yearEnd],
    queryFn: () => getTeamDepartures(effectiveFundId, yearStart, yearEnd),
    enabled: !!effectiveFundId,
  });

  // Fetch additions with filter years
  const { data: additionsRaw, isLoading: loadingAdditions } = useQuery({
    queryKey: ['teamAdditions', effectiveFundId, yearStart, yearEnd],
    queryFn: () => getTeamAdditions(effectiveFundId, yearStart, yearEnd),
    enabled: !!effectiveFundId,
  });

  // Fetch team members by type
  const { data: leadershipTeamRaw, isLoading: loadingLeadership } = useQuery({
    queryKey: ['leadershipTeam', effectiveFundId],
    queryFn: () => getLeadershipTeam(effectiveFundId),
    enabled: !!effectiveFundId,
  });

  const { data: investmentTeamRaw, isLoading: loadingInvestment } = useQuery({
    queryKey: ['investmentTeam', effectiveFundId],
    queryFn: () => getInvestmentTeam(effectiveFundId),
    enabled: !!effectiveFundId,
  });

  const { data: operationsTeamRaw, isLoading: loadingOperations } = useQuery({
    queryKey: ['operationsTeam', effectiveFundId],
    queryFn: () => getOperationsTeam(effectiveFundId),
    enabled: !!effectiveFundId,
  });

  // Derived data
  const departures = departuresRaw || [];
  const additions = additionsRaw || [];
  const leadershipTeam = leadershipTeamRaw || [];
  const investmentTeam = investmentTeamRaw || [];
  const operationsTeam = operationsTeamRaw || [];

  const handleYearRangeChange = (start: number, end: number) => {
    setYearStart(start);
    setYearEnd(end);
  };

  // All team members combined (for scraping)
  const allMembers = useMemo(() => {
    return [...(leadershipTeamRaw || []), ...(investmentTeamRaw || []), ...(operationsTeamRaw || [])];
  }, [leadershipTeamRaw, investmentTeamRaw, operationsTeamRaw]);

  const membersWithLinkedIn = useMemo(() => {
    return allMembers.filter(m => m.linkedin_profile_url);
  }, [allMembers]);

  const unscrapedCount = useMemo(() => {
    return membersWithLinkedIn.filter(m => !m.linkedin_last_scraped).length;
  }, [membersWithLinkedIn]);

  // Scrape a single member's LinkedIn profile
  const scrapeLinkedIn = useCallback(async (member: KeyPerson) => {
    if (!member.linkedin_profile_url) return;

    setScrapingMembers(prev => new Set(prev).add(member.people_id));
    try {
      const res = await fetch('/api/linkedin-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedinUrls: [member.linkedin_profile_url],
          peopleIds: [member.people_id],
          force: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');

      // Refresh team data
      queryClient.invalidateQueries({ queryKey: ['leadershipTeam'] });
      queryClient.invalidateQueries({ queryKey: ['investmentTeam'] });
      queryClient.invalidateQueries({ queryKey: ['operationsTeam'] });
    } catch (error) {
      console.error('LinkedIn scrape error:', error);
    } finally {
      setScrapingMembers(prev => {
        const next = new Set(prev);
        next.delete(member.people_id);
        return next;
      });
    }
  }, [queryClient]);

  // Scrape all members with LinkedIn URLs
  const scrapeAllLinkedIn = useCallback(async (force: boolean) => {
    const targets = force ? membersWithLinkedIn : membersWithLinkedIn.filter(m => !m.linkedin_last_scraped);
    if (targets.length === 0) return;

    setScrapingFund(true);
    setScrapeProgress({ done: 0, total: targets.length, message: 'Starting LinkedIn scrape...' });
    setShowScrapeDropdown(false);

    try {
      const res = await fetch('/api/linkedin-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedinUrls: targets.map(m => m.linkedin_profile_url),
          peopleIds: targets.map(m => m.people_id),
          force,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');

      setScrapeProgress({
        done: data.scraped || 0,
        total: targets.length,
        message: `Scraped ${data.scraped} profiles${data.skipped ? `, ${data.skipped} already up to date` : ''}`,
      });

      // Refresh team data
      queryClient.invalidateQueries({ queryKey: ['leadershipTeam'] });
      queryClient.invalidateQueries({ queryKey: ['investmentTeam'] });
      queryClient.invalidateQueries({ queryKey: ['operationsTeam'] });
    } catch (error) {
      console.error('Bulk scrape error:', error);
      setScrapeProgress({ done: 0, total: targets.length, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setScrapingFund(false);
      // Auto-dismiss success message after 8 seconds
      setTimeout(() => setScrapeProgress(null), 8000);
    }
  }, [membersWithLinkedIn, queryClient]);

  // Sync from Airtable
  const syncFromAirtable = useCallback(async () => {
    setSyncingAirtable(true);
    setScrapeProgress({ done: 0, total: 0, message: 'Syncing from Airtable...' });

    try {
      const res = await fetch('/api/sync-key-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      setScrapeProgress({
        done: data.synced || 0,
        total: data.total || 0,
        message: `Synced ${data.synced} people from Airtable${data.errors ? ` (${data.errors} errors)` : ''}`,
      });

      // Refresh team data
      queryClient.invalidateQueries({ queryKey: ['leadershipTeam'] });
      queryClient.invalidateQueries({ queryKey: ['investmentTeam'] });
      queryClient.invalidateQueries({ queryKey: ['operationsTeam'] });
    } catch (error) {
      console.error('Airtable sync error:', error);
      setScrapeProgress({ done: 0, total: 0, message: `Sync error: ${error instanceof Error ? error.message : 'Unknown'}` });
    } finally {
      setSyncingAirtable(false);
      setTimeout(() => setScrapeProgress(null), 8000);
    }
  }, [queryClient]);

  // Add a team change (departure or addition)
  const handleAddChange = useCallback(async (
    changeType: 'departure' | 'addition',
    data: { name: string; role: string; team: string; year: number }
  ) => {
    const result = await addTeamChange(effectiveFundId, data.name, changeType, data.year, data.role, data.team);
    if (!result.success) {
      console.error('Failed to add team change:', result.error);
      return;
    }
    // Refresh departures/additions and metrics
    queryClient.invalidateQueries({ queryKey: ['teamDepartures'] });
    queryClient.invalidateQueries({ queryKey: ['teamAdditions'] });
    queryClient.invalidateQueries({ queryKey: ['teamMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['leadershipTeam'] });
    queryClient.invalidateQueries({ queryKey: ['investmentTeam'] });
    queryClient.invalidateQueries({ queryKey: ['operationsTeam'] });
  }, [effectiveFundId, queryClient]);

  // Remove a team change
  const handleRemoveChange = useCallback(async (
    peopleId: string,
    changeType: 'departure' | 'addition'
  ) => {
    const result = await removeTeamChange(peopleId, changeType);
    if (!result.success) {
      console.error('Failed to remove team change:', result.error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['teamDepartures'] });
    queryClient.invalidateQueries({ queryKey: ['teamAdditions'] });
    queryClient.invalidateQueries({ queryKey: ['teamMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['leadershipTeam'] });
    queryClient.invalidateQueries({ queryKey: ['investmentTeam'] });
    queryClient.invalidateQueries({ queryKey: ['operationsTeam'] });
  }, [queryClient]);

  // Record a role change
  const handleRoleChange = useCallback(async (
    peopleId: string,
    newRole: string,
    note: string,
  ) => {
    const result = await recordRoleChange(peopleId, newRole, note);
    if (!result.success) {
      console.error('Failed to record role change:', result.error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['leadershipTeam'] });
    queryClient.invalidateQueries({ queryKey: ['investmentTeam'] });
    queryClient.invalidateQueries({ queryKey: ['operationsTeam'] });
  }, [queryClient]);

  // Show empty state if no fund selected
  if (!fundManager && !vehicleId) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">
          <p className="text-lg">Select a Fund Manager to view team information</p>
          <p className="text-sm mt-2">Use the filters above to get started</p>
        </div>
      </div>
    );
  }

  const isLoadingChanges = loadingDepartures || loadingAdditions;

  return (
    <div className="space-y-6">
      {/* Fund Company Profile */}
      {effectiveFundId && (
        <FundProfileCard fundId={effectiveFundId} />
      )}

      {/* Team Changes */}
      <div className="space-y-4">
        <TeamMetricsCards metrics={metrics ?? null} isLoading={loadingMetrics} />

        <TeamChangesSection
          departures={departures}
          additions={additions}
          fundId={effectiveFundId}
          vehicleId={vehicleId}
          dateOfReview={dateOfReview}
          reviewPeriodStart={yearStart}
          reviewPeriodEnd={yearEnd}
          onYearRangeChange={handleYearRangeChange}
          onPersonClick={onPersonClick}
          onAddChange={handleAddChange}
          onRemoveChange={handleRemoveChange}
          onRoleChange={handleRoleChange}
          activeFundMembers={allMembers}
          isLoading={isLoadingChanges}
        />
      </div>

      {/* Analyst Assessment */}
      <AnalystAssessmentSection
        vehicleId={vehicleId}
        fundId={effectiveFundId}
        dateOfReview={dateOfReview}
      />

      {/* Data Management Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#111827]">Team Members</h3>
        <div className="flex items-center gap-2">
          {/* Scrape All Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowScrapeDropdown(!showScrapeDropdown)}
              disabled={scrapingFund || membersWithLinkedIn.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#094d92] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Linkedin className="h-3.5 w-3.5" />
              Scrape All
              {unscrapedCount > 0 && (
                <span className="bg-white/20 text-white text-[10px] px-1 py-0.5 rounded-full leading-none">
                  {unscrapedCount}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showScrapeDropdown && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-20">
                <div className="py-1">
                  <button
                    onClick={() => scrapeAllLinkedIn(false)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#F3F4F6]"
                  >
                    Scrape unscraped only ({unscrapedCount})
                  </button>
                  <button
                    onClick={() => scrapeAllLinkedIn(true)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#F3F4F6]"
                  >
                    Re-scrape all ({membersWithLinkedIn.length})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sync from Airtable */}
          <button
            onClick={syncFromAirtable}
            disabled={syncingAirtable}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-[#E5E7EB] text-[#374151] rounded-lg hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingAirtable ? 'animate-spin' : ''}`} />
            Sync from Airtable
          </button>
        </div>
      </div>

      {/* Progress Banner */}
      {scrapeProgress && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm ${
          scrapingFund || syncingAirtable
            ? 'bg-blue-50 text-blue-800 border border-blue-200'
            : scrapeProgress.message.startsWith('Error') || scrapeProgress.message.startsWith('Sync error')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          <div className="flex items-center gap-2">
            {(scrapingFund || syncingAirtable) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : scrapeProgress.message.startsWith('Error') || scrapeProgress.message.startsWith('Sync error') ? (
              <X className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>{scrapeProgress.message}</span>
          </div>
          {!scrapingFund && !syncingAirtable && (
            <button
              onClick={() => setScrapeProgress(null)}
              className="text-current opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Leadership Team */}
      <TeamMemberTable
        title="Leadership Team"
        members={leadershipTeam}
        onPersonClick={onPersonClick}
        onScrape={scrapeLinkedIn}
        scrapingMembers={scrapingMembers}
        isLoading={loadingLeadership}
        defaultExpanded={true}
      />

      {/* Section 3: Investment Team */}
      <TeamMemberTable
        title="Investment Team"
        members={investmentTeam}
        onPersonClick={onPersonClick}
        onScrape={scrapeLinkedIn}
        scrapingMembers={scrapingMembers}
        isLoading={loadingInvestment}
        defaultExpanded={true}
      />

      {/* Section 4: Operations Team */}
      <TeamMemberTable
        title="Operations Team"
        members={operationsTeam}
        onPersonClick={onPersonClick}
        onScrape={scrapeLinkedIn}
        scrapingMembers={scrapingMembers}
        isLoading={loadingOperations}
        defaultExpanded={false}
      />
    </div>
  );
}
