'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Note, CreateNoteParams, UpdateNoteParams } from '@/actions/notes';
import { NoteCard } from './note-card';
import { NoteEditor, NoteEditorInline } from './note-editor';
import { NoteVersionHistory } from './note-version-history';
import { NoteCategoryBadge } from './note-category-badge';
import { UndoToast } from './undo-toast';
import { NoteCategory, getCategoryOptions } from '@/lib/note-categories';
import {
  useNotesForSection,
  useNotesForSectionByFund,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useRestoreNote,
  useRefreshNotes,
} from '@/hooks/use-notes';
import { RefreshCw, ChevronDown, ChevronUp, FileText, Filter, Loader2 } from 'lucide-react';

interface NotesSectionProps {
  sectionCode: string;
  sectionTitle: string;
  vehicleId: string;
  fundManagerId?: string;
  dateOfReview: string;
  author: string;
  showPreviousReviews?: boolean;
  defaultExpanded?: boolean;
  maxHeight?: string;
  className?: string;
}

export function NotesSection({
  sectionCode,
  sectionTitle,
  vehicleId,
  fundManagerId,
  dateOfReview,
  author,
  showPreviousReviews = true,
  defaultExpanded = true,
  maxHeight = '400px',
  className,
}: NotesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingHistoryNote, setViewingHistoryNote] = useState<Note | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<NoteCategory | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [deletedNoteId, setDeletedNoteId] = useState<string | null>(null);

  // Use fund-scoped query when fundManagerId is provided (for team-level notes)
  const useFundScope = !!fundManagerId;

  // Fetch notes - use fund-scoped or vehicle-scoped query
  const vehicleNotesQuery = useNotesForSection(
    sectionCode,
    vehicleId,
    dateOfReview,
    showPreviousReviews,
    isExpanded && !useFundScope
  );
  const fundNotesQuery = useNotesForSectionByFund(
    sectionCode,
    fundManagerId || '',
    dateOfReview,
    showPreviousReviews,
    isExpanded && useFundScope
  );
  const notesQuery = useFundScope ? fundNotesQuery : vehicleNotesQuery;

  // Mutations
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();
  const restoreNoteMutation = useRestoreNote();
  const { refresh } = useRefreshNotes();

  // Filter notes by category
  const filteredNotes = notesQuery.data
    ? categoryFilter === 'all'
      ? notesQuery.data
      : notesQuery.data.filter((note) => note.category === categoryFilter)
    : [];

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

  const handleRefresh = () => {
    refresh();
    notesQuery.refetch();
  };

  const categoryOptions = getCategoryOptions();

  return (
    <div className={cn('border border-[#E5E7EB] rounded-lg bg-white', className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#FAFAFA] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#1E4B7A]" />
          <h3 className="font-semibold text-[#111827]">{sectionTitle}</h3>
          {notesQuery.data && (
            <span className="text-xs text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
              {notesQuery.data.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
            disabled={notesQuery.isFetching}
            className="p-1 text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6] rounded"
            title="Refresh notes"
          >
            <RefreshCw className={cn('w-4 h-4', notesQuery.isFetching && 'animate-spin')} />
          </button>
          {/* Expand/Collapse */}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-[#6B7280]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#6B7280]" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-[#E5E7EB]">
          {/* Filter Bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#FAFAFA] border-b border-[#E5E7EB]">
            {/* Category Filter */}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#1E4B7A]"
              >
                <Filter className="w-4 h-4" />
                {categoryFilter === 'all' ? 'All Categories' : categoryFilter}
                <ChevronDown className="w-3 h-3" />
              </button>

              {showFilterDropdown && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-20">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setCategoryFilter('all');
                        setShowFilterDropdown(false);
                      }}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm hover:bg-[#F3F4F6]',
                        categoryFilter === 'all' && 'bg-[#F3F4F6]'
                      )}
                    >
                      All Categories
                    </button>
                    {categoryOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setCategoryFilter(option.value);
                          setShowFilterDropdown(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F3F4F6]',
                          categoryFilter === option.value && 'bg-[#F3F4F6]'
                        )}
                      >
                        <NoteCategoryBadge category={option.value} size="sm" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Note count */}
            <span className="text-xs text-[#9CA3AF]">
              Showing {filteredNotes.length} of {notesQuery.data?.length || 0} notes
            </span>
          </div>

          {/* Notes Content */}
          <div className="p-4" style={{ maxHeight, overflowY: 'auto' }}>
            {/* Add Note Section - Only show when not editing an existing note */}
            {isAddingNote ? (
              <NoteEditor
                entityType="section"
                entityCode={sectionCode}
                vehicleId={useFundScope ? undefined : vehicleId}
                fundManagerId={useFundScope ? fundManagerId : undefined}
                dateOfReview={dateOfReview}
                author={author}
                onSave={handleSaveNote}
                onCancel={() => setIsAddingNote(false)}
                isLoading={createNoteMutation.isPending}
                className="mb-4"
              />
            ) : (
              <NoteEditorInline onAddClick={() => setIsAddingNote(true)} className="mb-4" />
            )}

            {/* Loading State */}
            {notesQuery.isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-[#1E4B7A]" />
              </div>
            )}

            {/* Empty State */}
            {!notesQuery.isLoading && filteredNotes.length === 0 && (
              <div className="text-center py-4 text-[#6B7280] text-sm">
                {notesQuery.data?.length === 0
                  ? 'No notes yet. Add your first note above.'
                  : 'No notes match the selected filter.'}
              </div>
            )}

            {/* Notes List - Inline editing replaces note card */}
            {!notesQuery.isLoading && filteredNotes.length > 0 && (
              <div className="space-y-3">
                {filteredNotes.map((note) =>
                  editingNote?.note_id === note.note_id ? (
                    <NoteEditor
                      key={note.note_id}
                      entityType="section"
                      entityCode={sectionCode}
                      vehicleId={useFundScope ? undefined : vehicleId}
                      fundManagerId={useFundScope ? fundManagerId : undefined}
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
          </div>
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

// Compact inline notes indicator
export function NotesIndicator({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'bg-[#E0E7FF] text-[#1E4B7A] text-xs font-medium',
        'hover:bg-[#C7D2FE] transition-colors',
        className
      )}
    >
      <FileText className="w-3 h-3" />
      {count}
    </button>
  );
}
