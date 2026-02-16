'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useFilterState } from '@/hooks/use-url-state';
import { Header } from '@/components/dashboard/header';
import { GlobalFilters } from '@/components/dashboard/global-filters';
import { GeneralPage } from '@/components/pages/general-page';
import { OverviewPage } from '@/components/pages/overview-page';
import { HistoricalPage } from '@/components/pages/historical-page';
import { PortfolioMonitoringPage } from '@/components/pages/portfolio-monitoring-page';
import { SOIPage } from '@/components/pages/soi-page';
import { TeamPage } from '@/components/pages/team-page';
import { DataQualityPage } from '@/components/pages/data-quality-page';
import { FundManagerMonitoringPage } from '@/components/pages/fund-manager-monitoring-page';
import { DataConnectionFooter } from '@/components/dashboard/data-connection-footer';

const ProjectCard = dynamic(() => import('@/components/dashboard/project-card').then(m => ({ default: m.ProjectCard })), { ssr: false });
const VehicleCard = dynamic(() => import('@/components/dashboard/vehicle-card').then(m => ({ default: m.VehicleCard })), { ssr: false });
const PeopleCard = dynamic(() => import('@/components/dashboard/people-card').then(m => ({ default: m.PeopleCard })), { ssr: false });

export function FundMonitoringContent() {
  const [{ tab, ...filters }] = useFilterState();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedPeopleId, setSelectedPeopleId] = useState<string | null>(null);

  const handleProjectClick = (projectId: string) => {
    setSelectedProjectId(projectId);
  };

  const handleCloseProjectCard = () => {
    setSelectedProjectId(null);
  };

  const handleVehicleClick = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
  };

  const handleCloseVehicleCard = () => {
    setSelectedVehicleId(null);
  };

  const handlePersonClick = (peopleId: string) => {
    setSelectedPeopleId(peopleId);
  };

  const handleClosePeopleCard = () => {
    setSelectedPeopleId(null);
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <Header />
      <GlobalFilters onVehicleClick={handleVehicleClick} />
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {tab === 'general' && (
          <GeneralPage
            fundManager={filters.fundManager}
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
          />
        )}
        {tab === 'overview' && (
          <OverviewPage
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
            dateReportedStart={filters.dateReportedStart}
            dateReportedEnd={filters.dateReportedEnd}
            onProjectClick={handleProjectClick}
          />
        )}
        {tab === 'historical' && (
          <HistoricalPage
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
            dateReportedStart={filters.dateReportedStart}
            dateReportedEnd={filters.dateReportedEnd}
          />
        )}
        {tab === 'portfolio' && (
          <PortfolioMonitoringPage
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
            dateReportedStart={filters.dateReportedStart}
            dateReportedEnd={filters.dateReportedEnd}
            onProjectClick={handleProjectClick}
          />
        )}
        {tab === 'soi' && (
          <SOIPage
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
          />
        )}
        {tab === 'team' && (
          <TeamPage
            fundManager={filters.fundManager}
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
            onPersonClick={handlePersonClick}
          />
        )}
        {tab === 'fm-monitoring' && (
          <FundManagerMonitoringPage />
        )}
        {tab === 'data-quality' && (
          <DataQualityPage
            vehicleId={filters.vehicleId}
            portfolioDate={filters.portfolioDate}
          />
        )}
        {tab === 'bas' && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center">
            <p className="text-[#6B7280] text-sm">Bas&apos;s personal workspace will appear here.</p>
          </div>
        )}
      </main>
      <ProjectCard
        projectId={selectedProjectId || ''}
        portfolioDate={filters.portfolioDate}
        isOpen={!!selectedProjectId}
        onClose={handleCloseProjectCard}
      />
      <VehicleCard
        vehicleId={selectedVehicleId || ''}
        initialPortfolioDate={filters.portfolioDate}
        isOpen={!!selectedVehicleId}
        onClose={handleCloseVehicleCard}
      />
      <PeopleCard
        peopleId={selectedPeopleId || ''}
        portfolioDate={filters.portfolioDate}
        isOpen={!!selectedPeopleId}
        onClose={handleClosePeopleCard}
      />
      <DataConnectionFooter />
    </div>
  );
}
