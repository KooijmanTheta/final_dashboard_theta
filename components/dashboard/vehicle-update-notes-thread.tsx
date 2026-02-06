'use client';

import { useState } from 'react';
import { useNotesForVehicleUpdate, useCreateNote, useUpdateNote, useDeleteNote } from '@/hooks/use-notes';
import { Note, CreateNoteParams, UpdateNoteParams } from '@/actions/notes';
import { NoteCard } from '@/components/notes/note-card';
import { NoteEditor } from '@/components/notes/note-editor';
import { cn } from '@/lib/utils';
import { MessageSquare, ChevronDown, ChevronUp, Plus, Loader2 } from 'lucide-react';

interface VehicleUpdateNotesThreadProps {
  vehicleUpdateId: string;
  vehicleId: string;  // Human-readable vehicle name
  dateOfReview: string;
  author: string;
}

export function VehicleUpdateNotesThread({
  vehicleUpdateId,
  vehicleId,
  dateOfReview,
  author,
}: VehicleUpdateNotesThreadProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // Fetch notes for this specific vehicle update
  const { data: notes, isLoading, error } = useNotesForVehicleUpdate(vehicleUpdateId);

  // Mutations
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const noteCount = notes?.length || 0;
  const visibleNotes = isExpanded ? notes : notes?.slice(0, 2);
  const hasMoreNotes = noteCount > 2;

  const handleCreateNote = async (params: CreateNoteParams | UpdateNoteParams) => {
    await createNoteMutation.mutateAsync(params as CreateNoteParams);
    setIsAddingNote(false);
  };

  const handleUpdateNote = async (params: CreateNoteParams | UpdateNoteParams) => {
    if (!editingNote) return;
    await updateNoteMutation.mutateAsync({
      noteId: editingNote.note_id,
      params: params as UpdateNoteParams,
    });
    setEditingNote(null);
  };

  const handleDeleteNote = async (note: Note) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    await deleteNoteMutation.mutateAsync({
      noteId: note.note_id,
      deletedBy: author,
    });
  };

  // Don't show anything if loading or error (keep UI clean)
  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
        <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Loading notes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail for notes
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
      {/* Notes Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{noteCount} {noteCount === 1 ? 'note' : 'notes'}</span>
        </div>

        {/* Add Note Button */}
        {!isAddingNote && !editingNote && (
          <button
            onClick={() => setIsAddingNote(true)}
            className="flex items-center gap-1 text-xs text-[#1E4B7A] hover:underline"
          >
            <Plus className="w-3 h-3" />
            Add note
          </button>
        )}
      </div>

      {/* Notes List */}
      {visibleNotes && visibleNotes.length > 0 && (
        <div className="space-y-2">
          {visibleNotes.map((note) => (
            <div key={note.note_id}>
              {editingNote?.note_id === note.note_id ? (
                <NoteEditor
                  existingNote={note}
                  author={author}
                  onSave={handleUpdateNote}
                  onCancel={() => setEditingNote(null)}
                  isLoading={updateNoteMutation.isPending}
                  className="bg-[#F9FAFB]"
                />
              ) : (
                <NoteCard
                  note={note}
                  onEdit={setEditingNote}
                  onDelete={handleDeleteNote}
                  isEditable={true}
                  className="bg-[#FAFAFA] text-sm"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show More/Less Button */}
      {hasMoreNotes && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#1E4B7A] mt-2',
            'hover:underline transition-colors'
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show {noteCount - 2} more {noteCount - 2 === 1 ? 'note' : 'notes'}
            </>
          )}
        </button>
      )}

      {/* Add Note Editor */}
      {isAddingNote && (
        <div className="mt-2">
          <NoteEditor
            entityType="vehicle"
            vehicleId={vehicleId}
            projectUpdateId={vehicleUpdateId}
            dateOfReview={dateOfReview}
            author={author}
            onSave={handleCreateNote}
            onCancel={() => setIsAddingNote(false)}
            isLoading={createNoteMutation.isPending}
            className="bg-[#F9FAFB]"
          />
        </div>
      )}
    </div>
  );
}
