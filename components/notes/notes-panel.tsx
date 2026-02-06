'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Note, CreateNoteParams, UpdateNoteParams, EntityType } from '@/actions/notes';
import { NoteCard } from './note-card';
import { NoteEditor, NoteEditorInline } from './note-editor';
import { NoteVersionHistory } from './note-version-history';
import { UndoToast } from './undo-toast';
import {
  useNotesForProject,
  useNotesForVehicle,
  useNotesForSection,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useRestoreNote,
  useRefreshNotes,
  groupNotesByReviewDate,
} from '@/hooks/use-notes';
import { X, RefreshCw, Loader2, FileText } from 'lucide-react';

type NotesPanelMode = 'project' | 'vehicle' | 'section';

interface NotesPanelProps {
  // Panel mode and identifiers
  mode: NotesPanelMode;

  // Project mode
  projectId?: string;
  recordIdProject?: string;

  // Vehicle mode
  vehicleId?: string;
  recordIdVehicle?: string;

  // Section mode
  sectionCode?: string;

  // Common
  dateOfReview?: string;
  tbvFund?: string;

  // Display
  title: string;
  isOpen: boolean;
  onClose: () => void;

  // Author info
  author: string;

  // Options
  showPreviousReviews?: boolean;

  className?: string;
}

export function NotesPanel({
  mode,
  projectId,
  recordIdProject,
  vehicleId,
  recordIdVehicle,
  sectionCode,
  dateOfReview,
  tbvFund,
  title,
  isOpen,
  onClose,
  author,
  showPreviousReviews = true,
  className,
}: NotesPanelProps) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingHistoryNote, setViewingHistoryNote] = useState<Note | null>(null);
  const [deletedNoteId, setDeletedNoteId] = useState<string | null>(null);

  // Fetch notes based on mode
  const projectNotesQuery = useNotesForProject(
    projectId || recordIdProject || '',
    dateOfReview,
    showPreviousReviews,
    mode === 'project' && isOpen
  );

  const vehicleNotesQuery = useNotesForVehicle(
    vehicleId || recordIdVehicle || '',
    dateOfReview,
    showPreviousReviews,
    mode === 'vehicle' && isOpen
  );

  const sectionNotesQuery = useNotesForSection(
    sectionCode || '',
    vehicleId || '',
    dateOfReview || '',
    showPreviousReviews,
    mode === 'section' && isOpen && !!sectionCode && !!vehicleId && !!dateOfReview
  );

  // Select the right query based on mode
  const notesQuery =
    mode === 'project'
      ? projectNotesQuery
      : mode === 'vehicle'
      ? vehicleNotesQuery
      : sectionNotesQuery;

  // Mutations
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();
  const restoreNoteMutation = useRestoreNote();
  const { refresh } = useRefreshNotes();

  // Group notes by review date
  const groupedNotes = notesQuery.data ? groupNotesByReviewDate(notesQuery.data) : new Map<string, Note[]>();

  // Close panel on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (viewingHistoryNote) {
          setViewingHistoryNote(null);
        } else if (editingNote) {
          setEditingNote(null);
        } else if (isAddingNote) {
          setIsAddingNote(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isAddingNote, editingNote, viewingHistoryNote, onClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

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

  // Get entity type for note creation
  const getEntityType = (): EntityType => {
    switch (mode) {
      case 'project':
        return 'project';
      case 'vehicle':
        return 'vehicle';
      case 'section':
        return 'section';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-4 py-3 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#1E4B7A]" />
              <h2 className="font-semibold text-[#111827]">{title}</h2>
              {notesQuery.data && (
                <span className="text-xs text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
                  {notesQuery.data.length} notes
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={notesQuery.isFetching}
                className="p-1.5 text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6] rounded transition-colors"
                title="Refresh notes"
              >
                <RefreshCw
                  className={cn('w-4 h-4', notesQuery.isFetching && 'animate-spin')}
                />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="h-[calc(100vh-60px)] overflow-y-auto p-4">
          {/* Add Note Section */}
          {isAddingNote || editingNote ? (
            <NoteEditor
              entityType={getEntityType()}
              entityCode={sectionCode}
              recordIdProject={recordIdProject}
              recordIdVehicle={recordIdVehicle}
              vehicleId={vehicleId}
              projectId={projectId}
              tbvFund={tbvFund}
              dateOfReview={dateOfReview}
              existingNote={editingNote || undefined}
              author={author}
              onSave={handleSaveNote}
              onCancel={() => {
                setIsAddingNote(false);
                setEditingNote(null);
              }}
              isLoading={createNoteMutation.isPending || updateNoteMutation.isPending}
              className="mb-4"
            />
          ) : (
            <NoteEditorInline
              onAddClick={() => setIsAddingNote(true)}
              className="mb-4"
            />
          )}

          {/* Loading State */}
          {notesQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#1E4B7A]" />
            </div>
          )}

          {/* Empty State */}
          {!notesQuery.isLoading && (!notesQuery.data || notesQuery.data.length === 0) && (
            <div className="text-center py-8 text-[#6B7280]">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No notes yet.</p>
              <p className="text-sm">Click above to add your first note.</p>
            </div>
          )}

          {/* Notes List Grouped by Review Date */}
          {!notesQuery.isLoading && groupedNotes.size > 0 && (
            <div className="space-y-6">
              {Array.from(groupedNotes.entries()).map(([reviewDate, notes]) => (
                <div key={reviewDate}>
                  {/* Review Date Divider */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px bg-[#E5E7EB] flex-1" />
                    <span className="text-xs font-medium text-[#6B7280] px-2">
                      Review: {reviewDate}
                    </span>
                    <div className="h-px bg-[#E5E7EB] flex-1" />
                  </div>

                  {/* Notes for this review date */}
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <NoteCard
                        key={note.note_id}
                        note={note}
                        onEdit={(n) => setEditingNote(n)}
                        onDelete={handleDeleteNote}
                        onViewHistory={(n) => setViewingHistoryNote(n)}
                        isEditable={true}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </>
  );
}
