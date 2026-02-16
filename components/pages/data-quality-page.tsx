'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getDataQualityStats,
  getDataQualityProjects,
  type DataQualityStats,
  type DataQualityProject,
  type DataQualityProjectsResult,
} from '@/actions/data-quality';
import { OverallQualityPage } from '@/components/pages/overall-quality-page';
import { cn } from '@/lib/utils';

interface DataQualityPageProps {
  vehicleId: string;
  portfolioDate: string;
}

type DataQualitySubTab = 'overall-quality' | 'project-enrichment';

const KEY_FIELDS = [
  { key: 'coingecko_id', label: 'CoinGecko ID' },
  { key: 'project_stack', label: 'Stack' },
  { key: 'project_tag', label: 'Tag' },
  { key: 'project_sub_tag', label: 'Sub-Tag' },
  { key: 'website', label: 'Website' },
  { key: 'description', label: 'Description' },
] as const;

type KeyField = typeof KEY_FIELDS[number]['key'];

function formatCost(value: number): string {
  if (value === 0) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function completenessColor(pct: number): string {
  if (pct >= 80) return '#10B981';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

function CompleteDot({ pct }: { pct: number }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full mr-1.5"
      style={{ backgroundColor: completenessColor(pct) }}
    />
  );
}

export function DataQualityPage({ vehicleId, portfolioDate }: DataQualityPageProps) {
  const [subTab, setSubTab] = useState<DataQualitySubTab>('overall-quality');

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 border-b border-[#E5E7EB]">
        {([
          { id: 'overall-quality' as const, label: 'Overall Quality' },
          { id: 'project-enrichment' as const, label: 'Project Enrichment' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              subTab === t.id
                ? 'border-[#1E4B7A] text-[#1E4B7A]'
                : 'border-transparent text-[#6B7280] hover:text-[#374151] hover:border-[#D1D5DB]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overall-quality' && (
        <OverallQualityPage />
      )}
      {subTab === 'project-enrichment' && (
        <ProjectEnrichmentContent vehicleId={vehicleId} portfolioDate={portfolioDate} />
      )}
    </div>
  );
}

function ProjectEnrichmentContent({ vehicleId, portfolioDate }: DataQualityPageProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [missingField, setMissingField] = useState<string>('');
  const [sortBy, setSortBy] = useState<'completeness' | 'project_id' | 'cost'>('completeness');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, missingField, sortBy, sortDir, vehicleId]);

  const effectiveVehicleId = vehicleId || undefined;

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['dataQualityStats', effectiveVehicleId, portfolioDate],
    queryFn: () => getDataQualityStats(effectiveVehicleId, portfolioDate),
  });

  const { data: projectsResult, isLoading: loadingProjects } = useQuery({
    queryKey: ['dataQualityProjects', effectiveVehicleId, portfolioDate, debouncedSearch, missingField, sortBy, sortDir, page],
    queryFn: () => getDataQualityProjects({
      vehicleId: effectiveVehicleId,
      portfolioDate,
      search: debouncedSearch || undefined,
      missingField: missingField || undefined,
      sortBy,
      sortDir,
      page,
      pageSize,
    }),
  });

  const handleSortChange = (value: string) => {
    switch (value) {
      case 'completeness_asc': setSortBy('completeness'); setSortDir('asc'); break;
      case 'completeness_desc': setSortBy('completeness'); setSortDir('desc'); break;
      case 'project_id_asc': setSortBy('project_id'); setSortDir('asc'); break;
      case 'project_id_desc': setSortBy('project_id'); setSortDir('desc'); break;
      case 'cost_desc': setSortBy('cost'); setSortDir('desc'); break;
      case 'cost_asc': setSortBy('cost'); setSortDir('asc'); break;
    }
  };

  const handleFieldCardClick = (fieldKey: string) => {
    setMissingField(prev => prev === fieldKey ? '' : fieldKey);
  };

  if (loadingStats && loadingProjects) {
    return (
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-8">
        <div className="text-center text-[#6B7280]">Loading data quality metrics...</div>
      </div>
    );
  }

  const s: DataQualityStats = stats || {
    totalProjects: 0,
    avgCompleteness: 0,
    fullyEnriched: 0,
    needsAttention: 0,
    fieldFillRates: { coingecko_id: 0, project_stack: 0, project_tag: 0, project_sub_tag: 0, website: 0, description: 0 },
  };

  const pResult: DataQualityProjectsResult = projectsResult || { projects: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 1 };
  const projectList: DataQualityProject[] = pResult.projects;
  const totalCount = pResult.totalCount;
  const totalPages = pResult.totalPages;

  return (
    <div className="space-y-6">
      {/* Scope Badge */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${vehicleId ? 'text-[#1E4B7A] bg-[#1E4B7A]/10' : 'text-[#6B7280] bg-[#F3F4F6]'}`}>
          {vehicleId ? 'Filtered by vehicle' : 'All Projects'}
        </span>
      </div>

      {/* A. Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide">Total Projects</p>
          <p className="font-mono text-2xl font-semibold text-[#111827] mt-1">{s.totalProjects.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide">Avg Completeness</p>
          <p className="font-mono text-2xl font-semibold mt-1" style={{ color: completenessColor(s.avgCompleteness) }}>
            {s.avgCompleteness.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide">Fully Enriched</p>
          <p className="font-mono text-2xl font-semibold text-[#10B981] mt-1">{s.fullyEnriched.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide">Needs Attention</p>
          <p className="font-mono text-2xl font-semibold text-[#EF4444] mt-1">{s.needsAttention.toLocaleString()}</p>
        </div>
      </div>

      {/* B. Field Fill Rates */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {KEY_FIELDS.map(({ key, label }) => {
          const rate = s.fieldFillRates[key as KeyField] || 0;
          const isActive = missingField === key;
          return (
            <button
              key={key}
              onClick={() => handleFieldCardClick(key)}
              className={`bg-white rounded-lg border p-4 text-left transition-colors ${isActive ? 'border-[#1E4B7A] ring-1 ring-[#1E4B7A]' : 'border-[#E5E7EB] hover:border-[#D1D5DB]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[#111827]">{label}</p>
                <p className="text-sm font-mono text-[#6B7280]">{rate.toFixed(1)}%</p>
              </div>
              <div className="w-full h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1E4B7A] rounded-full transition-all"
                  style={{ width: `${Math.min(rate, 100)}%` }}
                />
              </div>
              {isActive && (
                <p className="text-xs text-[#1E4B7A] mt-1.5">Showing projects missing this field</p>
              )}
            </button>
          );
        })}
      </div>

      {/* C. Filter Bar */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-[#E5E7EB] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1E4B7A] focus:border-transparent w-64"
          />
          <select
            value={missingField}
            onChange={e => setMissingField(e.target.value)}
            className="text-sm border border-[#E5E7EB] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
          >
            <option value="">All Fields</option>
            {KEY_FIELDS.map(({ key, label }) => (
              <option key={key} value={key}>Missing: {label}</option>
            ))}
          </select>
          <select
            value={`${sortBy}_${sortDir}`}
            onChange={e => handleSortChange(e.target.value)}
            className="text-sm border border-[#E5E7EB] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1E4B7A]"
          >
            <option value="completeness_asc">Completeness (low first)</option>
            <option value="completeness_desc">Completeness (high first)</option>
            <option value="cost_desc">Cost (high first)</option>
            <option value="cost_asc">Cost (low first)</option>
            <option value="project_id_asc">Name A-Z</option>
            <option value="project_id_desc">Name Z-A</option>
          </select>
          <span className="ml-auto text-sm text-[#6B7280]">
            {totalCount.toLocaleString()} project{totalCount !== 1 ? 's' : ''}
            {totalPages > 1 && ` \u00B7 Page ${page} of ${totalPages}`}
          </span>
        </div>
      </div>

      {/* D. Projects Table */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9FAFB] text-left text-sm text-[#6B7280]">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium text-center">Score</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium">CoinGecko ID</th>
                <th className="px-4 py-3 font-medium">Stack</th>
                <th className="px-4 py-3 font-medium">Tag</th>
                <th className="px-4 py-3 font-medium">Sub-Tag</th>
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {loadingProjects ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#6B7280]">
                    Loading projects...
                  </td>
                </tr>
              ) : projectList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#6B7280]">
                    No projects found
                  </td>
                </tr>
              ) : (
                projectList.map(project => (
                  <tr key={project.project_id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3 text-sm font-medium text-[#111827]">
                      <div className="flex items-center gap-2">
                        {project.project_logo_url && (
                          <img
                            src={project.project_logo_url}
                            alt=""
                            className="w-4 h-4 rounded-full"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {project.project_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CompleteDot pct={project.completeness} />
                        <span className="font-mono">{project.completeness}%</span>
                        <span className="text-[#6B7280] text-xs ml-1">{project.filledCount}/6</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono tabular-nums text-[#111827]">
                      {formatCost(project.cost)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <FieldCell value={project.coingecko_id} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <FieldCell value={project.project_stack} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <FieldCell value={project.project_tag} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <FieldCell value={project.project_sub_tag} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {project.website ? (
                        <a
                          href={project.website.startsWith('http') ? project.website : `https://${project.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1E4B7A] hover:underline truncate block max-w-[150px]"
                          title={project.website}
                        >
                          {project.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      ) : (
                        <span className="text-[#D1D5DB]">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#6B7280]">
                      {project.description ? (
                        <span
                          className="block truncate max-w-[200px]"
                          title={project.description}
                        >
                          {project.description.length > 60
                            ? project.description.slice(0, 60) + '...'
                            : project.description}
                        </span>
                      ) : (
                        <span className="text-[#D1D5DB]">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]">
            <p className="text-sm text-[#6B7280]">
              {((page - 1) * pageSize + 1).toLocaleString()}&ndash;{Math.min(page * pageSize, totalCount).toLocaleString()} of {totalCount.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="px-2 py-1 text-sm rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 text-sm rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 py-1 text-sm text-[#6B7280]">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-2.5 py-1 text-sm rounded border ${
                      p === page
                        ? 'bg-[#1E4B7A] text-white border-[#1E4B7A]'
                        : 'border-[#E5E7EB] text-[#6B7280] hover:bg-white'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 text-sm rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="px-2 py-1 text-sm rounded border border-[#E5E7EB] text-[#6B7280] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function FieldCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-[#D1D5DB]">&mdash;</span>;
  return <span className="text-[#111827]">{value}</span>;
}
