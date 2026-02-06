'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Note } from '@/actions/notes';
import { NoteCategoryBadge } from './note-category-badge';
import { Pencil, Trash2, History, ChevronDown, ChevronUp } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  onEdit?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  onViewHistory?: (note: Note) => void;
  isEditable?: boolean;
  showFullText?: boolean;
  className?: string;
}

export function NoteCard({
  note,
  onEdit,
  onDelete,
  onViewHistory,
  isEditable = true,
  showFullText = false,
  className,
}: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(showFullText);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Truncate text if needed
  const maxLength = 200;
  const shouldTruncate = !isExpanded && note.note_text.length > maxLength;
  const displayText = shouldTruncate
    ? note.note_text.slice(0, maxLength) + '...'
    : note.note_text;

  const hasVersions = (note.version_count || 0) > 0;

  return (
    <div
      className={cn(
        'border-l-2 border-[#1E4B7A] pl-4 py-3 bg-white rounded-r-md',
        'hover:bg-[#FAFAFA] transition-colors',
        className
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <NoteCategoryBadge category={note.category} />
          <span className="text-xs text-[#6B7280]">
            {formatDate(note.date_created)}
          </span>
          {hasVersions && (
            <span className="text-xs text-[#9CA3AF]">(v{(note.version_count || 0) + 1})</span>
          )}
        </div>

        {/* Action Buttons */}
        {isEditable && (
          <div className="flex items-center gap-1">
            {hasVersions && onViewHistory && (
              <button
                onClick={() => onViewHistory(note)}
                className="p-1 text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6] rounded transition-colors"
                title="View history"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(note)}
                className="p-1 text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6] rounded transition-colors"
                title="Edit note"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(note)}
                className="p-1 text-[#6B7280] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Note Text */}
      <p className="text-sm text-[#111827] whitespace-pre-wrap">{displayText}</p>

      {/* Expand/Collapse Button */}
      {note.note_text.length > maxLength && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-[#1E4B7A] hover:underline mt-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show more
            </>
          )}
        </button>
      )}

      {/* Footer: Author */}
      <div className="flex items-center gap-2 mt-2 text-xs text-[#9CA3AF]">
        <span>by {note.author}</span>
        {note.date_modified !== note.date_created && (
          <span className="text-[#D1D5DB]">
            (edited {formatDate(note.date_modified)})
          </span>
        )}
      </div>
    </div>
  );
}

// Compact version for inline display
export function NoteCardCompact({
  note,
  onClick,
  className,
}: {
  note: Note;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-2 p-2 rounded-md',
        'hover:bg-[#F3F4F6] cursor-pointer transition-colors',
        className
      )}
    >
      <NoteCategoryBadge category={note.category} size="sm" />
      <p className="text-sm text-[#374151] line-clamp-2 flex-1">{note.note_text}</p>
    </div>
  );
}
