'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { NoteCategory, getCategoryOptions, getCategoryConfig } from '@/lib/note-categories';
import { Note, CreateNoteParams, UpdateNoteParams } from '@/actions/notes';
import { ChevronDown, X, Loader2, Check } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface NoteEditorProps {
  // For creating new notes
  entityType?: string;
  entityCode?: string;
  recordIdProject?: string;
  recordIdVehicle?: string;
  vehicleId?: string;
  projectId?: string;
  fundManagerId?: string;
  projectUpdateId?: string;  // Links note to specific project update
  peopleId?: string;  // Links note to specific person
  tbvFund?: string;
  dateOfReview?: string;
  rowIdentifier?: Record<string, unknown>;

  // For editing existing notes
  existingNote?: Note;

  // Author info
  author: string;

  // Callbacks
  onSave: (params: CreateNoteParams | UpdateNoteParams) => Promise<void>;
  onCancel: () => void;

  // Loading state
  isLoading?: boolean;

  // Styling
  className?: string;
}

export function NoteEditor({
  entityType = 'project',
  entityCode,
  recordIdProject,
  recordIdVehicle,
  vehicleId,
  fundManagerId,
  projectId,
  projectUpdateId,
  peopleId,
  tbvFund,
  dateOfReview,
  rowIdentifier,
  existingNote,
  author,
  onSave,
  onCancel,
  isLoading = false,
  className,
}: NoteEditorProps) {
  const [noteText, setNoteText] = useState(existingNote?.note_text || '');
  const [category, setCategory] = useState<NoteCategory>(existingNote?.category || 'observation');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Track if content has changed since last save
  const lastSavedTextRef = useRef(existingNote?.note_text || '');
  const lastSavedCategoryRef = useRef<NoteCategory>(existingNote?.category || 'observation');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isEditing = !!existingNote;
  const categoryOptions = getCategoryOptions();
  const selectedCategory = getCategoryConfig(category);

  // Check if content has changed
  const hasChanges = noteText.trim() !== lastSavedTextRef.current || category !== lastSavedCategoryRef.current;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.category-dropdown')) {
        setShowCategoryDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, []);

  const performSave = useCallback(async () => {
    if (!noteText.trim()) return;
    if (!hasChanges) return;

    setSaveStatus('saving');

    try {
      if (isEditing) {
        // Update existing note
        const params: UpdateNoteParams = {
          category,
          note_text: noteText.trim(),
          author,
        };
        await onSave(params);
      } else {
        // Create new note
        const params: CreateNoteParams = {
          entity_type: entityType as CreateNoteParams['entity_type'],
          entity_code: entityCode,
          record_id_project: recordIdProject,
          record_id_vehicle: recordIdVehicle,
          vehicle_id: vehicleId,
          fund_manager_id: fundManagerId,
          project_id: projectId,
          project_update_id: projectUpdateId,
          people_id: peopleId,
          tbv_fund: tbvFund,
          date_of_review: dateOfReview || new Date().toISOString().split('T')[0],
          row_identifier: rowIdentifier,
          category,
          note_text: noteText.trim(),
          author,
        };
        await onSave(params);
      }

      // Update last saved refs
      lastSavedTextRef.current = noteText.trim();
      lastSavedCategoryRef.current = category;

      setSaveStatus('saved');

      // Clear "saved" status after 2 seconds
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Error saving note:', error);
      setSaveStatus('error');

      // Clear error status after 3 seconds
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    }
  }, [noteText, category, hasChanges, isEditing, entityType, entityCode, recordIdProject, recordIdVehicle, vehicleId, projectId, projectUpdateId, peopleId, tbvFund, dateOfReview, rowIdentifier, author, onSave]);

  // Autosave on blur
  const handleBlur = useCallback(() => {
    if (noteText.trim() && hasChanges) {
      // Small delay to allow category changes to be picked up
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, 100);
    }
  }, [noteText, hasChanges, performSave]);

  // Also trigger save when category changes (if there's text)
  const handleCategoryChange = useCallback((newCategory: NoteCategory) => {
    setCategory(newCategory);
    setShowCategoryDropdown(false);

    // If we have text and are editing, autosave after category change
    if (noteText.trim() && isEditing) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, 300);
    }
  }, [noteText, isEditing, performSave]);

  return (
    <div className={cn('bg-[#F9FAFB] rounded-lg p-4', className)}>
      {/* Textarea with autosave on blur */}
      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Enter your note..."
        className={cn(
          'w-full h-24 p-3 border border-[#E5E7EB] rounded-md text-sm resize-none',
          'focus:outline-none focus:ring-2 focus:ring-[#1E4B7A] focus:border-transparent',
          'bg-white placeholder:text-[#9CA3AF]'
        )}
        disabled={isLoading || saveStatus === 'saving'}
        autoFocus
      />

      {/* Footer Row */}
      <div className="flex items-center justify-between mt-3">
        {/* Category Selector */}
        <div className="relative category-dropdown">
          <button
            type="button"
            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium',
              'border border-[#E5E7EB] hover:bg-[#F3F4F6] transition-colors',
              selectedCategory.bgColor,
              selectedCategory.textColor
            )}
            disabled={isLoading || saveStatus === 'saving'}
          >
            {selectedCategory.label}
            <ChevronDown className="w-4 h-4" />
          </button>

          {/* Dropdown Menu */}
          {showCategoryDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50">
              <div className="py-1">
                {categoryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleCategoryChange(option.value)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#F3F4F6]',
                      category === option.value && 'bg-[#F3F4F6]'
                    )}
                  >
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        option.bgColor,
                        option.textColor
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="text-xs text-[#6B7280] flex-1">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-3">
          {/* Autosave Status */}
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[#6B7280]" />
                <span className="text-[#6B7280]">Saving...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-green-600" />
                <span className="text-green-600">Saved</span>
              </>
            )}
            {saveStatus === 'error' && (
              <span className="text-red-600">Failed to save</span>
            )}
            {saveStatus === 'idle' && hasChanges && noteText.trim() && (
              <span className="text-[#9CA3AF]">Unsaved changes</span>
            )}
          </div>

          {/* Cancel/Close Button */}
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm',
              'text-[#6B7280] hover:bg-[#E5E7EB] transition-colors'
            )}
            disabled={isLoading || saveStatus === 'saving'}
          >
            <X className="w-4 h-4" />
            {isEditing ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* Author Display & Autosave Hint */}
      <div className="mt-2 flex items-center justify-between text-xs text-[#9CA3AF]">
        <span>{isEditing ? 'Editing as' : 'Posting as'}: {author}</span>
        <span>Autosaves when you leave the text box</span>
      </div>
    </div>
  );
}

// Inline version for quick note adding
export function NoteEditorInline({
  onAddClick,
  className,
}: {
  onAddClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onAddClick}
      className={cn(
        'w-full p-3 text-left rounded-lg border border-dashed border-[#E5E7EB]',
        'text-sm text-[#9CA3AF] hover:border-[#1E4B7A] hover:text-[#1E4B7A]',
        'hover:bg-[#F9FAFB] transition-colors',
        className
      )}
    >
      + Add a note...
    </button>
  );
}
