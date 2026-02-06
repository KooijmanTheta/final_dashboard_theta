'use client';

import { cn } from '@/lib/utils';
import { NoteVersion } from '@/actions/notes';
import { NoteCategoryBadge } from './note-category-badge';
import { useNoteVersions, useRevertToVersion } from '@/hooks/use-notes';
import { X, RotateCcw, Loader2, History } from 'lucide-react';

interface NoteVersionHistoryProps {
  noteId: string;
  isOpen: boolean;
  onClose: () => void;
  currentAuthor: string;
  className?: string;
}

export function NoteVersionHistory({
  noteId,
  isOpen,
  onClose,
  currentAuthor,
  className,
}: NoteVersionHistoryProps) {
  const { data: versions, isLoading } = useNoteVersions(noteId, isOpen);
  const revertMutation = useRevertToVersion();

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRevert = async (versionId: string) => {
    if (confirm('Are you sure you want to revert to this version? This will create a new version with the old content.')) {
      await revertMutation.mutateAsync({
        noteId,
        versionId,
        revertedBy: currentAuthor,
      });
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'bg-white rounded-lg shadow-xl z-50 w-full max-w-lg max-h-[80vh] overflow-hidden',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#1E4B7A]" />
            <h3 className="font-semibold text-[#111827]">Version History</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#1E4B7A]" />
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="text-center py-8 text-[#6B7280]">
              No version history available.
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((version) => (
                <VersionCard
                  key={version.version_id}
                  version={version}
                  onRevert={() => handleRevert(version.version_id)}
                  isReverting={revertMutation.isPending}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function VersionCard({
  version,
  onRevert,
  isReverting,
  formatDate,
}: {
  version: NoteVersion;
  onRevert: () => void;
  isReverting: boolean;
  formatDate: (date: string) => string;
}) {
  return (
    <div className="border border-[#E5E7EB] rounded-lg p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#1E4B7A] bg-[#E0E7FF] px-2 py-0.5 rounded">
            v{version.version_number}
          </span>
          <NoteCategoryBadge category={version.category} size="sm" />
        </div>
        <button
          onClick={onRevert}
          disabled={isReverting}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs',
            'text-[#6B7280] hover:text-[#1E4B7A] hover:bg-[#F3F4F6]',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Revert to this version"
        >
          {isReverting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3" />
          )}
          Revert
        </button>
      </div>

      {/* Content */}
      <p className="text-sm text-[#374151] whitespace-pre-wrap line-clamp-3">
        {version.note_text}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-xs text-[#9CA3AF]">
        <span>by {version.modified_by}</span>
        <span>{formatDate(version.modified_at)}</span>
      </div>

      {/* Change Reason */}
      {version.change_reason && (
        <div className="mt-2 text-xs text-[#6B7280] italic">
          Reason: {version.change_reason}
        </div>
      )}
    </div>
  );
}
