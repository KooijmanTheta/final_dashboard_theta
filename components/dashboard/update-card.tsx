'use client';

import { useState } from 'react';
import { ProjectUpdate } from '@/actions/project-updates';
import { UpdateNotesThread } from './update-notes-thread';
import { cn } from '@/lib/utils';
import { Calendar, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface UpdateCardProps {
  update: ProjectUpdate;
  projectId: string;  // Human-readable project name
  dateOfReview: string;
  author: string;
  isFirst: boolean;
  isLast: boolean;
}

// Tag color mapping based on common note tags
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  'Portfolio Update': { bg: 'bg-violet-100', text: 'text-violet-700' },
  'Risk': { bg: 'bg-red-100', text: 'text-red-700' },
  'Concern': { bg: 'bg-red-100', text: 'text-red-700' },
  'Team Update': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  'Product Update': { bg: 'bg-pink-100', text: 'text-pink-700' },
  'Strategy Update': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'Partnership': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'News': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'Market Context': { bg: 'bg-slate-100', text: 'text-slate-700' },
  'Manager Call': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'LP Update': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'DDQ': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Fund Operations': { bg: 'bg-teal-100', text: 'text-teal-700' },
  'Fund Strategy': { bg: 'bg-orange-100', text: 'text-orange-700' },
  'Observation': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Action Item': { bg: 'bg-red-100', text: 'text-red-700' },
  'Positive Signal': { bg: 'bg-green-100', text: 'text-green-700' },
};

function getTagColors(tag: string): { bg: string; text: string } {
  // Try exact match first
  if (TAG_COLORS[tag]) {
    return TAG_COLORS[tag];
  }
  // Try partial match
  for (const [key, colors] of Object.entries(TAG_COLORS)) {
    if (tag.toLowerCase().includes(key.toLowerCase())) {
      return colors;
    }
  }
  // Default colors
  return { bg: 'bg-[#1E4B7A]/10', text: 'text-[#1E4B7A]' };
}

export function UpdateCard({
  update,
  projectId,
  dateOfReview,
  author,
  isFirst,
  isLast,
}: UpdateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Truncate summary
  const maxSummaryLength = 250;
  const summaryText = update.claude_summary || '';
  const shouldTruncate = summaryText.length > maxSummaryLength && !isExpanded;
  const displaySummary = shouldTruncate
    ? summaryText.slice(0, maxSummaryLength) + '...'
    : summaryText;

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-6 top-3 w-3 h-3 rounded-full bg-[#1E4B7A] border-2 border-white shadow-sm z-10" />

      {/* Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {update.note_tags && update.note_tags.length > 0 ? (
              update.note_tags.map((tag, idx) => {
                const colors = getTagColors(tag);
                return (
                  <span
                    key={idx}
                    className={cn(
                      'px-2 py-0.5 text-xs font-medium rounded-full',
                      colors.bg,
                      colors.text
                    )}
                  >
                    {tag}
                  </span>
                );
              })
            ) : (
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                Update
              </span>
            )}
          </div>

          {/* Date */}
          <div className="flex items-center gap-1 text-xs text-[#6B7280] whitespace-nowrap flex-shrink-0">
            <Calendar className="w-3 h-3" />
            {formatDate(update.source_document_date)}
          </div>
        </div>

        {/* Source Document Name */}
        {update.source_document_name && (
          <div className="flex items-center gap-1 text-xs text-[#6B7280] mb-2">
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span className="truncate" title={update.source_document_name}>
              {update.source_document_name}
            </span>
          </div>
        )}

        {/* Summary */}
        {summaryText && (
          <div className="text-sm text-[#374151] mb-2">
            <p className="whitespace-pre-wrap leading-relaxed">{displaySummary}</p>
            {summaryText.length > maxSummaryLength && (
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
          </div>
        )}

        {/* Notes Thread */}
        <UpdateNotesThread
          projectUpdateId={update.id}
          projectId={projectId}
          dateOfReview={dateOfReview}
          author={author}
        />
      </div>
    </div>
  );
}
