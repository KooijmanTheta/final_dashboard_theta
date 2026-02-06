'use client';

import { useEffect, useCallback, useState, createContext, useContext, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink, Globe, Twitter, Linkedin, ChevronDown, ChevronRight } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  getProjectInfo,
  getProjectTBVCostMV,
  getProjectFundExposure,
  getProjectValuationHistory,
  getProjectNotes,
  getProjectPriceHistory,
  getProjectOwnershipDates,
  type ProjectInfo,
  type TBVCostMVData,
  type FundExposureRow,
  type ValuationHistoryRow,
  type ProjectNoteRow,
  type PriceHistoryRow,
  type OwnershipDateRow,
} from '@/actions/project-card';
import { cn } from '@/lib/utils';
import { getMOICColorClass } from '@/lib/moic-utils';
import { NoteCard } from '@/components/notes/note-card';
import { NoteEditor, NoteEditorInline } from '@/components/notes/note-editor';
import { NoteVersionHistory } from '@/components/notes/note-version-history';
import { UndoToast } from '@/components/notes/undo-toast';
import { Note, CreateNoteParams, UpdateNoteParams } from '@/actions/notes';
import {
  useGeneralNotesForProject,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useRestoreNote,
} from '@/hooks/use-notes';
import { ProjectUpdatesTimeline } from './project-updates-timeline';

interface ProjectCardProps {
  projectId: string;
  portfolioDate: string;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// Formatting utilities
// ============================================================================

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '-';
  const millions = value / 1e6;
  if (Math.abs(millions) >= 0.01) {
    return `$${millions.toFixed(2)}M`;
  }
  return `$${value.toLocaleString()}`;
}

function formatValuation(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '-';
  const billions = value / 1e9;
  if (Math.abs(billions) >= 1) {
    return `$${billions.toFixed(1)}B`;
  }
  const millions = value / 1e6;
  return `$${millions.toFixed(0)}M`;
}

function formatMOIC(moic: number | null | undefined): string {
  if (moic === null || moic === undefined || moic === 0) return '-';
  return `${moic.toFixed(2)}x`;
}

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

// ============================================================================
// Section Components
// ============================================================================

function ProjectInfoSection({ data }: { data: ProjectInfo | null }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {data.project_logo_url && (
          <img
            src={data.project_logo_url}
            alt={data.project_id}
            className="w-16 h-16 rounded-lg object-contain bg-[#F9FAFB]"
          />
        )}
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-[#111827]">{data.project_id}</h3>
          {data.description && (
            <p className="text-sm text-[#6B7280] mt-1 line-clamp-3">{data.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {data.project_ecosystem && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Ecosystem</span>
            <span className="text-[#111827] font-medium">{data.project_ecosystem}</span>
          </div>
        )}
        {data.project_stack && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Stack</span>
            <span className="text-[#111827] font-medium">{data.project_stack}</span>
          </div>
        )}
        {data.project_tag && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Tag</span>
            <span className="text-[#111827] font-medium">{data.project_tag}</span>
          </div>
        )}
        {data.project_sub_tag && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Sub-Tag</span>
            <span className="text-[#111827] font-medium">{data.project_sub_tag}</span>
          </div>
        )}
        {data.country && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Country</span>
            <span className="text-[#111827] font-medium">{data.country}</span>
          </div>
        )}
        {data.project_liveness_score !== null && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Liveness Score</span>
            <span className="text-[#111827] font-medium">{data.project_liveness_score}/5</span>
          </div>
        )}
        {data.project_liveness_status && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Status</span>
            <span className={cn(
              'font-medium',
              data.project_liveness_status === 'Active' ? 'text-green-600' : 'text-[#6B7280]'
            )}>{data.project_liveness_status}</span>
          </div>
        )}
        {data.token_live && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Token Live</span>
            <span className={cn(
              'font-medium',
              data.token_live === 'Yes' ? 'text-green-600' : 'text-[#6B7280]'
            )}>{data.token_live}</span>
          </div>
        )}
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-3 pt-2">
        {data.website && (
          <a
            href={data.website.startsWith('http') ? data.website : `https://${data.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline"
          >
            <Globe className="h-4 w-4" />
            Website
            {data.website_status && (
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                data.website_status === 'Online' ? 'bg-green-100 text-green-700' :
                data.website_status === 'Offline' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              )}>{data.website_status}</span>
            )}
          </a>
        )}
        {data.twitter_handle && (
          <a
            href={`https://twitter.com/${data.twitter_handle.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline"
          >
            <Twitter className="h-4 w-4" />
            @{data.twitter_handle.replace('@', '')}
          </a>
        )}
        {data.linkedin_url && (
          <a
            href={data.linkedin_url.startsWith('http') ? data.linkedin_url : `https://${data.linkedin_url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline"
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </a>
        )}
        {data.coingecko_id && (
          <a
            href={`https://www.coingecko.com/en/coins/${data.coingecko_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#1E4B7A] hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            CoinGecko
          </a>
        )}
      </div>
    </div>
  );
}

// TBV Cost & Market Value Section with expandable rows
function TBVCostMVSection({ data }: { data: TBVCostMVData | null }) {
  const [expandedFunds, setExpandedFunds] = useState<Record<string, boolean>>({});

  if (!data || data.funds.length === 0) {
    return <p className="text-sm text-[#6B7280]">No cost/MV data available</p>;
  }

  const toggleFund = (tbvFund: string) => {
    setExpandedFunds(prev => ({ ...prev, [tbvFund]: !prev[tbvFund] }));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="py-2 text-left font-medium text-[#6B7280] w-8"></th>
            <th className="py-2 text-left font-medium text-[#6B7280]">TBV Fund</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Total Cost</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Unrealized MV</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Realized MV</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Total MV</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">MOIC</th>
          </tr>
        </thead>
        <tbody>
          {data.funds.map((fund) => {
            const isExpanded = expandedFunds[fund.tbv_fund];
            return (
              <Fragment key={fund.tbv_fund}>
                {/* Parent Row (TBV Fund) */}
                <tr
                  className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] cursor-pointer"
                  onClick={() => toggleFund(fund.tbv_fund)}
                >
                  <td className="py-2 pl-2">
                    {fund.asset_classes.length > 0 && (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                      )
                    )}
                  </td>
                  <td className="py-2 font-medium text-[#111827]">{fund.tbv_fund}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(fund.cost)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(fund.unrealized_mv)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(fund.realized_mv)}</td>
                  <td className="py-2 text-right font-mono tabular-nums font-medium">{formatCurrency(fund.total_mv)}</td>
                  <td className="py-2 text-right">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-mono', getMOICColorClass(fund.moic))}>
                      {formatMOIC(fund.moic)}
                    </span>
                  </td>
                </tr>

                {/* Child Rows (Asset Classes) */}
                {isExpanded && fund.asset_classes.map((ac) => (
                  <tr key={`${fund.tbv_fund}-${ac.asset_class}`} className="bg-[#FAFAFA] border-b border-[#F3F4F6]">
                    <td className="py-2"></td>
                    <td className="py-2 pl-6 text-[#6B7280]">- {ac.asset_class}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#6B7280]">{formatCurrency(ac.cost)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#6B7280]">{formatCurrency(ac.unrealized_mv)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#6B7280]">{formatCurrency(ac.realized_mv)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#6B7280]">{formatCurrency(ac.total_mv)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#6B7280]">{formatMOIC(ac.moic)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        {/* Footer Row (Totals) */}
        <tfoot>
          <tr className="bg-[#F3F4F6] font-semibold">
            <td className="py-2"></td>
            <td className="py-2 text-[#111827]">TOTAL</td>
            <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(data.totals.cost)}</td>
            <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(data.totals.unrealized_mv)}</td>
            <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(data.totals.realized_mv)}</td>
            <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(data.totals.total_mv)}</td>
            <td className="py-2 text-right">
              <span className={cn('px-2 py-0.5 rounded text-xs font-mono', getMOICColorClass(data.totals.moic))}>
                {formatMOIC(data.totals.moic)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Fund Exposure Section
function FundExposureSection({ data }: { data: FundExposureRow[] }) {
  if (data.length === 0) return <p className="text-sm text-[#6B7280]">No fund exposure data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="py-2 text-left font-medium text-[#6B7280]">Fund</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Cost</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Market Value</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">MOIC</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-[#F3F4F6]">
              <td className="py-2 text-[#111827]" title={row.vehicle_id}>{row.fund_name}</td>
              <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(row.cost)}</td>
              <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(row.market_value)}</td>
              <td className="py-2 text-right">
                <span className={cn('px-2 py-0.5 rounded text-xs font-mono', getMOICColorClass(row.moic))}>
                  {formatMOIC(row.moic)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValuationHistorySection({ data }: { data: ValuationHistoryRow[] }) {
  if (data.length === 0) return <p className="text-sm text-[#6B7280]">No valuation history</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="py-2 text-left font-medium text-[#6B7280]">Date</th>
            <th className="py-2 text-left font-medium text-[#6B7280]">Round</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Valuation</th>
            <th className="py-2 text-left font-medium text-[#6B7280]">Instrument</th>
            <th className="py-2 text-left font-medium text-[#6B7280]">Lead</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-[#F3F4F6]">
              <td className="py-2 text-[#111827]">{row.rounds_date}</td>
              <td className="py-2 text-[#6B7280]">{row.round || '-'}</td>
              <td className="py-2 text-right font-mono tabular-nums">{formatValuation(row.overall_valuation)}</td>
              <td className="py-2 text-[#6B7280]">{row.investment_instrument || '-'}</td>
              <td className="py-2 text-[#6B7280]">{row.fund_lead || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline Notes Section - Shows general notes (not linked to specific project updates)
function InlineNotesSection({
  projectId,
  dateOfReview,
  author,
}: {
  projectId: string;
  dateOfReview: string;
  author: string;
}) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingHistoryNote, setViewingHistoryNote] = useState<Note | null>(null);
  const [deletedNoteId, setDeletedNoteId] = useState<string | null>(null);

  // Fetch general notes (excluding update-specific notes)
  const { data: notes, isLoading } = useGeneralNotesForProject(
    projectId,
    dateOfReview,
    true, // include previous reviews
    true  // enabled
  );

  // Mutations
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();
  const restoreNoteMutation = useRestoreNote();

  const handleSaveNote = async (params: CreateNoteParams | UpdateNoteParams) => {
    if (editingNote) {
      await updateNoteMutation.mutateAsync({
        noteId: editingNote.note_id,
        params: params as UpdateNoteParams,
      });
      setEditingNote(null);
    } else {
      await createNoteMutation.mutateAsync(params as CreateNoteParams);
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (note: Note) => {
    await deleteNoteMutation.mutateAsync({
      noteId: note.note_id,
      deletedBy: author,
    });
    setDeletedNoteId(note.note_id);
  };

  const handleUndoDelete = async () => {
    if (deletedNoteId) {
      await restoreNoteMutation.mutateAsync(deletedNoteId);
      setDeletedNoteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Note Section */}
      {isAddingNote ? (
        <NoteEditor
          entityType="project"
          projectId={projectId}
          dateOfReview={dateOfReview}
          author={author}
          onSave={handleSaveNote}
          onCancel={() => setIsAddingNote(false)}
          isLoading={createNoteMutation.isPending}
        />
      ) : (
        <NoteEditorInline onAddClick={() => setIsAddingNote(true)} />
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-4 text-[#6B7280] text-sm">
          Loading notes...
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!notes || notes.length === 0) && (
        <div className="text-center py-4 text-[#6B7280] text-sm">
          No notes yet. Add your first note above.
        </div>
      )}

      {/* Notes List - Inline editing replaces note card */}
      {!isLoading && notes && notes.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {notes.map((note) =>
            editingNote?.note_id === note.note_id ? (
              <NoteEditor
                key={note.note_id}
                entityType="project"
                projectId={projectId}
                dateOfReview={dateOfReview}
                existingNote={note}
                author={author}
                onSave={handleSaveNote}
                onCancel={() => setEditingNote(null)}
                isLoading={updateNoteMutation.isPending}
              />
            ) : (
              <NoteCard
                key={note.note_id}
                note={note}
                onEdit={(n) => setEditingNote(n)}
                onDelete={handleDeleteNote}
                onViewHistory={(n) => setViewingHistoryNote(n)}
                isEditable={true}
              />
            )
          )}
        </div>
      )}

      {/* Version History Modal */}
      {viewingHistoryNote && (
        <NoteVersionHistory
          noteId={viewingHistoryNote.note_id}
          isOpen={!!viewingHistoryNote}
          onClose={() => setViewingHistoryNote(null)}
          currentAuthor={author}
        />
      )}

      {/* Undo Delete Toast */}
      {deletedNoteId && (
        <UndoToast
          message="Note deleted"
          onUndo={handleUndoDelete}
          onDismiss={() => setDeletedNoteId(null)}
          duration={5000}
        />
      )}
    </div>
  );
}

function PriceChartSection({
  priceData,
  ownershipDates,
}: {
  priceData: PriceHistoryRow[];
  ownershipDates: OwnershipDateRow[];
}) {
  if (priceData.length === 0) {
    return <p className="text-sm text-[#6B7280]">No price data available</p>;
  }

  // Format data for Recharts
  const chartData = priceData.map((p) => ({
    date: p.date,
    price: p.price,
  }));

  // Get min/max for Y axis
  const prices = priceData.map((p) => p.price);
  const minPrice = Math.min(...prices) * 0.9;
  const maxPrice = Math.max(...prices) * 1.1;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
            }}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => formatPrice(value)}
            width={60}
          />
          <Tooltip
            formatter={(value: number) => [formatPrice(value), 'Price']}
            labelFormatter={(label) => label}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#1E4B7A"
            strokeWidth={2}
            dot={false}
          />
          {/* Ownership date annotations */}
          {ownershipDates.map((od, idx) => (
            <ReferenceLine
              key={idx}
              x={od.date_reported}
              stroke={od.ownership_type === 'Established' ? '#16a34a' : '#3b82f6'}
              strokeDasharray="5 5"
              label={{
                value: od.ownership_type === 'Established' ? 'E' : 'T',
                position: 'top',
                fontSize: 10,
                fill: od.ownership_type === 'Established' ? '#16a34a' : '#3b82f6',
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {ownershipDates.length > 0 && (
        <div className="flex gap-4 mt-2 text-xs text-[#6B7280]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-600"></span> E = Established
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500"></span> T = Top Up
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Section Wrapper Component
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#E5E7EB] pb-6 mb-6 last:border-b-0 last:pb-0 last:mb-0">
      <h3 className="text-sm font-semibold text-[#111827] uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ============================================================================
// Main Project Card Component
// ============================================================================

// Default author - in production, this would come from authentication
const DEFAULT_AUTHOR = 'Dashboard User';

export function ProjectCard({ projectId, portfolioDate, isOpen, onClose }: ProjectCardProps) {
  // Handle Escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  // Fetch all data
  const { data: projectInfo, isLoading: loadingInfo } = useQuery({
    queryKey: ['projectInfo', projectId],
    queryFn: () => getProjectInfo(projectId),
    enabled: isOpen && !!projectId,
  });

  const { data: costMV, isLoading: loadingCostMV } = useQuery({
    queryKey: ['projectCostMV', projectId, portfolioDate],
    queryFn: () => getProjectTBVCostMV(projectId, portfolioDate),
    enabled: isOpen && !!projectId && !!portfolioDate,
  });

  const { data: fundExposure, isLoading: loadingExposure } = useQuery({
    queryKey: ['projectFundExposure', projectId, portfolioDate],
    queryFn: () => getProjectFundExposure(projectId, portfolioDate),
    enabled: isOpen && !!projectId && !!portfolioDate,
  });

  const { data: valuationHistory, isLoading: loadingValuation } = useQuery({
    queryKey: ['projectValuationHistory', projectId],
    queryFn: () => getProjectValuationHistory(projectId),
    enabled: isOpen && !!projectId,
  });

  const { data: notes, isLoading: loadingNotes } = useQuery({
    queryKey: ['projectNotes', projectId],
    queryFn: () => getProjectNotes(projectId),
    enabled: isOpen && !!projectId,
  });

  // Fetch price data only if token is live
  const shouldFetchPrices = projectInfo?.token_live === 'Yes' && projectInfo?.coingecko_id;

  const { data: priceHistory } = useQuery({
    queryKey: ['projectPriceHistory', projectInfo?.coingecko_id],
    queryFn: () => getProjectPriceHistory(projectInfo!.coingecko_id!),
    enabled: isOpen && !!shouldFetchPrices,
  });

  const { data: ownershipDates } = useQuery({
    queryKey: ['projectOwnershipDates', projectId],
    queryFn: () => getProjectOwnershipDates(projectId),
    enabled: isOpen && !!shouldFetchPrices,
  });

  if (!isOpen) return null;

  const isLoading = loadingInfo || loadingCostMV || loadingExposure || loadingValuation || loadingNotes;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-[#111827]">
            {projectId}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-[#6B7280]" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-73px)] px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-[#6B7280]">Loading project data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: Project Info */}
              <Section title="Project Information">
                <ProjectInfoSection data={projectInfo || null} />
              </Section>

              {/* Section 2: TBV Cost & Market Value */}
              <Section title="TBV Cost & Market Value">
                <TBVCostMVSection data={costMV || null} />
              </Section>

              {/* Section 3: Fund Exposure */}
              <Section title="Fund Exposure">
                <FundExposureSection data={fundExposure || []} />
              </Section>

              {/* Section 4: Valuation History */}
              <Section title="Valuation History">
                <ValuationHistorySection data={valuationHistory || []} />
              </Section>

              {/* Section 5: Project Updates - Timeline of processed notes */}
              <Section title="Project Updates">
                <ProjectUpdatesTimeline
                  projectId={projectId}
                  dateOfReview={portfolioDate}
                  author={DEFAULT_AUTHOR}
                />
              </Section>

              {/* Section 6: General Notes - Project-level notes (not linked to updates) */}
              <Section title="General Notes">
                <InlineNotesSection
                  projectId={projectId}
                  dateOfReview={portfolioDate}
                  author={DEFAULT_AUTHOR}
                />
              </Section>

              {/* Section 7: Price Chart (only if token is live) */}
              {shouldFetchPrices && (
                <Section title="Price Chart">
                  <PriceChartSection
                    priceData={priceHistory || []}
                    ownershipDates={ownershipDates || []}
                  />
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Context for Project Card State
// ============================================================================

interface ProjectCardContextValue {
  openProjectCard: (projectId: string) => void;
}

export const ProjectCardContext = createContext<ProjectCardContextValue | null>(null);

export function useProjectCard() {
  const context = useContext(ProjectCardContext);
  if (!context) {
    throw new Error('useProjectCard must be used within a ProjectCardProvider');
  }
  return context;
}
