'use client';

import { useEffect, useCallback, useState, createContext, useContext } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMOICColorClass } from '@/lib/moic-utils';
import { NoteCard } from '@/components/notes/note-card';
import { NoteEditor, NoteEditorInline } from '@/components/notes/note-editor';
import { NoteVersionHistory } from '@/components/notes/note-version-history';
import { UndoToast } from '@/components/notes/undo-toast';
import { Note, CreateNoteParams, UpdateNoteParams } from '@/actions/notes';
import {
  useVehicleInfo,
  useVehicleCapitalSummary,
  useVehiclePerformance,
  useTopPositions,
  useVehiclePortfolioDates,
  useVehicleTBVFunds,
  type VehicleInfo,
  type VehicleCapitalSummary,
  type VehiclePerformanceMetrics,
  type TopPosition,
} from '@/hooks/use-vehicle-card';
import {
  useGeneralNotesForVehicle,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useRestoreNote,
} from '@/hooks/use-notes';
import { VehicleUpdatesTimeline } from './vehicle-updates-timeline';

interface VehicleCardProps {
  vehicleId: string;
  initialPortfolioDate?: string;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// Formatting utilities
// ============================================================================

function formatCurrency(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || value === 0) return '-';
  const millions = value / 1e6;
  const currencySymbol = currency === 'EUR' ? '€' : '$';
  if (Math.abs(millions) >= 0.01) {
    return `${currencySymbol}${millions.toFixed(2)}M`;
  }
  return `${currencySymbol}${value.toLocaleString()}`;
}

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '-';
  return `${value.toFixed(2)}x`;
}

function formatIRR(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

// ============================================================================
// Section Components
// ============================================================================

function VehicleInfoSection({
  data,
  capitalSummary,
}: {
  data: VehicleInfo | null;
  capitalSummary: VehicleCapitalSummary | null;
}) {
  if (!data) return null;

  const vintage = data.vintage ? `(${data.vintage})` : '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-[#111827]">
            {data.full_strategy_name || data.vehicle_id} {vintage}
          </h3>
          {data.fund_manager && (
            <p className="text-sm text-[#6B7280] mt-1">Fund Manager: {data.fund_manager}</p>
          )}
        </div>
      </div>

      {/* Fund Details Grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {data.vintage && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Vintage Year</span>
            <span className="text-[#111827] font-medium">{data.vintage}</span>
          </div>
        )}
        {data.fund_size && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Fund Size</span>
            <span className="text-[#111827] font-medium">{formatCurrency(data.fund_size, data.currency)}</span>
          </div>
        )}
        {data.target && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Target</span>
            <span className="text-[#111827] font-medium">{formatCurrency(data.target, data.currency)}</span>
          </div>
        )}
        {data.cap && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Cap</span>
            <span className="text-[#111827] font-medium">{formatCurrency(data.cap, data.currency)}</span>
          </div>
        )}
        {data.investment_period && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Investment Period</span>
            <span className="text-[#111827] font-medium">
              {data.investment_period}y {data.vintage ? `(${data.vintage + data.investment_period})` : ''}
            </span>
          </div>
        )}
        {data.fund_life && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Fund Life</span>
            <span className="text-[#111827] font-medium">{data.fund_life}y</span>
          </div>
        )}
        {data.potential_extension && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Potential Extension</span>
            <span className="text-[#111827] font-medium">{data.potential_extension}y</span>
          </div>
        )}
        {data.management_fee !== null && data.management_fee !== undefined && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Management Fee</span>
            <span className="text-[#111827] font-medium">{formatPercentage(data.management_fee)}</span>
          </div>
        )}
        {data.performance_fee !== null && data.performance_fee !== undefined && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Performance Fee</span>
            <span className="text-[#111827] font-medium">{formatPercentage(data.performance_fee)}</span>
          </div>
        )}
        {data.gp_commitment !== null && data.gp_commitment !== undefined && (
          <div className="flex justify-between">
            <span className="text-[#6B7280]">GP Commitment</span>
            <span className="text-[#111827] font-medium">{formatPercentage(data.gp_commitment)}</span>
          </div>
        )}
      </div>

      {/* Capital Summary */}
      {capitalSummary && (
        <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
          <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Capital Summary</h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Theta Commitment</span>
              <span className="text-[#111827] font-medium">{formatCurrency(capitalSummary.theta_commitment_total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Capital Called</span>
              <span className="text-[#111827] font-medium">
                {formatCurrency(capitalSummary.capital_called)} ({formatPercentage(capitalSummary.called_percentage)})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280]">Capital Distributed</span>
              <span className="text-[#111827] font-medium">{formatCurrency(capitalSummary.capital_distributed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PerformanceMetricsSection({ data }: { data: VehiclePerformanceMetrics | null }) {
  if (!data) {
    return <p className="text-sm text-[#6B7280]">No performance data available</p>;
  }

  return (
    <div className="space-y-4">
      {/* Performance Metrics */}
      <div className="grid grid-cols-3 gap-4">
        {data.nav > 0 && (
          <div className="bg-[#F9FAFB] rounded-lg p-3">
            <p className="text-xs text-[#6B7280] uppercase">NAV</p>
            <p className="text-lg font-semibold text-[#111827]">{formatCurrency(data.nav)}</p>
          </div>
        )}
        <div className="bg-[#F9FAFB] rounded-lg p-3">
          <p className="text-xs text-[#6B7280] uppercase">TVPI</p>
          <p className="text-lg font-semibold text-[#111827]">{formatMultiple(data.tvpi)}</p>
        </div>
        <div className="bg-[#F9FAFB] rounded-lg p-3">
          <p className="text-xs text-[#6B7280] uppercase">DPI</p>
          <p className="text-lg font-semibold text-[#111827]">{formatMultiple(data.dpi)}</p>
        </div>
        <div className="bg-[#F9FAFB] rounded-lg p-3">
          <p className="text-xs text-[#6B7280] uppercase">RVPI</p>
          <p className="text-lg font-semibold text-[#111827]">{formatMultiple(data.rvpi)}</p>
        </div>
        {data.irr !== null && (
          <div className="bg-[#F9FAFB] rounded-lg p-3">
            <p className="text-xs text-[#6B7280] uppercase">IRR</p>
            <p className="text-lg font-semibold text-[#111827]">{formatIRR(data.irr)}</p>
          </div>
        )}
      </div>

      {/* Position Counts */}
      <div className="pt-4 border-t border-[#E5E7EB]">
        <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Position Counts</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Unique Projects</span>
            <span className="text-[#111827] font-medium">{data.unique_projects}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Private</span>
            <span className="text-[#111827] font-medium">{data.private_positions}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Liquid</span>
            <span className="text-[#111827] font-medium">{data.liquid_positions}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopPositionsSection({ data }: { data: TopPosition[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-[#6B7280]">No position data available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="py-2 text-left font-medium text-[#6B7280]">Project</th>
            <th className="py-2 text-left font-medium text-[#6B7280]">Asset Class</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Cost</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">Market Value</th>
            <th className="py-2 text-right font-medium text-[#6B7280]">MOIC</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-[#F3F4F6]">
              <td className="py-2 text-[#111827]">{row.project_name}</td>
              <td className="py-2 text-[#6B7280]">{row.asset_class}</td>
              <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(row.cost)}</td>
              <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(row.market_value)}</td>
              <td className="py-2 text-right">
                <span className={cn('px-2 py-0.5 rounded text-xs font-mono', getMOICColorClass(row.moic))}>
                  {formatMultiple(row.moic)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline Notes Section for Vehicle
function InlineNotesSection({
  vehicleId,
  dateOfReview,
  author,
}: {
  vehicleId: string;
  dateOfReview: string;
  author: string;
}) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingHistoryNote, setViewingHistoryNote] = useState<Note | null>(null);
  const [deletedNoteId, setDeletedNoteId] = useState<string | null>(null);

  // Fetch general notes (excluding update-specific notes)
  const { data: notes, isLoading } = useGeneralNotesForVehicle(
    vehicleId,
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
          entityType="vehicle"
          vehicleId={vehicleId}
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

      {/* Notes List */}
      {!isLoading && notes && notes.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {notes.map((note) =>
            editingNote?.note_id === note.note_id ? (
              <NoteEditor
                key={note.note_id}
                entityType="vehicle"
                vehicleId={vehicleId}
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
// Main Vehicle Card Component
// ============================================================================

const DEFAULT_AUTHOR = 'Dashboard User';

export function VehicleCard({ vehicleId, initialPortfolioDate, isOpen, onClose }: VehicleCardProps) {
  const [selectedPortfolioDate, setSelectedPortfolioDate] = useState(initialPortfolioDate || '');
  const [selectedTBVFund, setSelectedTBVFund] = useState<string | undefined>(undefined);

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

  // Fetch filter options
  const { data: portfolioDates } = useVehiclePortfolioDates(vehicleId, isOpen);
  const { data: tbvFunds } = useVehicleTBVFunds(vehicleId, isOpen);

  // Set initial portfolio date when data is loaded
  useEffect(() => {
    if (portfolioDates && portfolioDates.length > 0 && !selectedPortfolioDate) {
      setSelectedPortfolioDate(portfolioDates[0]);
    }
  }, [portfolioDates, selectedPortfolioDate]);

  // Fetch vehicle data
  const { data: vehicleInfo, isLoading: loadingInfo } = useVehicleInfo(vehicleId, isOpen);
  const { data: capitalSummary, isLoading: loadingCapital } = useVehicleCapitalSummary(
    vehicleId,
    selectedTBVFund,
    isOpen && !!vehicleId
  );
  const { data: performanceMetrics, isLoading: loadingPerformance } = useVehiclePerformance(
    vehicleId,
    selectedPortfolioDate,
    selectedTBVFund,
    isOpen && !!selectedPortfolioDate
  );
  const { data: topPositions, isLoading: loadingPositions } = useTopPositions(
    vehicleId,
    selectedPortfolioDate,
    isOpen && !!selectedPortfolioDate
  );

  if (!isOpen) return null;

  const isLoading = loadingInfo || loadingCapital || loadingPerformance || loadingPositions;

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
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#111827]">{vehicleId}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-[#6B7280]" />
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-4 mt-3">
            {/* Portfolio Date Filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#6B7280]">Portfolio Date:</label>
              <select
                value={selectedPortfolioDate}
                onChange={(e) => setSelectedPortfolioDate(e.target.value)}
                className="text-sm border border-[#E5E7EB] rounded-md px-2 py-1 bg-white"
              >
                {portfolioDates?.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>

            {/* TBV Fund Filter */}
            {tbvFunds && tbvFunds.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#6B7280]">TBV Fund:</label>
                <select
                  value={selectedTBVFund || ''}
                  onChange={(e) => setSelectedTBVFund(e.target.value || undefined)}
                  className="text-sm border border-[#E5E7EB] rounded-md px-2 py-1 bg-white"
                >
                  <option value="">All</option>
                  {tbvFunds.map((fund) => (
                    <option key={fund} value={fund}>{fund}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100vh-120px)] px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-[#6B7280]">Loading vehicle data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: General Vehicle Info */}
              <Section title="General Vehicle Information">
                <VehicleInfoSection data={vehicleInfo || null} capitalSummary={capitalSummary || null} />
              </Section>

              {/* Section 2: Performance Metrics */}
              <Section title="Performance Metrics">
                <PerformanceMetricsSection data={performanceMetrics || null} />
              </Section>

              {/* Section 3: Top Positions */}
              <Section title="Top Positions by Market Value">
                <TopPositionsSection data={topPositions || []} />
              </Section>

              {/* Section 4: Vehicle Updates */}
              <Section title="Vehicle Updates">
                <VehicleUpdatesTimeline
                  vehicleId={vehicleId}
                  recordIdVehicleUniverse={vehicleInfo?.record_id_vehicle_universe}
                  recordIdFundUniverse={vehicleInfo?.record_id_fund_universe}
                  dateOfReview={selectedPortfolioDate}
                  author={DEFAULT_AUTHOR}
                />
              </Section>

              {/* Section 5: General Notes */}
              <Section title="General Notes">
                <InlineNotesSection
                  vehicleId={vehicleId}
                  dateOfReview={selectedPortfolioDate}
                  author={DEFAULT_AUTHOR}
                />
              </Section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Context for Vehicle Card State
// ============================================================================

interface VehicleCardContextValue {
  openVehicleCard: (vehicleId: string, portfolioDate?: string) => void;
}

export const VehicleCardContext = createContext<VehicleCardContextValue | null>(null);

export function useVehicleCard() {
  const context = useContext(VehicleCardContext);
  if (!context) {
    throw new Error('useVehicleCard must be used within a VehicleCardProvider');
  }
  return context;
}
